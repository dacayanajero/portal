"use strict";

// Supabase Auth is the sole source of account identity. The remaining document
// and appointment services are still browser-local until separately migrated.
(() => {
  const PASSWORD_POLICY = Object.freeze({ minimumLength: 8, maximumLength: 128 });
  const SESSION_POLICY = Object.freeze({ developmentOnly: false, lifetimeMs: null });
  let currentAccount = null;
  let expiresAt = null;
  let signedInAt = null;
  let explicitSignOut = false;
  let pendingSignOut = null;
  let directoryStudents = [];
  let directoryStaff = [];

  function client() {
    const sb = window.PortalSupabase;
    if (!sb?.configured || !sb.client) throw new Error("Supabase is unavailable. Check the project URL and publishable key.");
    return sb.client;
  }

  function identity(profile) {
    if (!profile || !["student", "staff", "admin"].includes(profile.role) || !profile.is_active) {
      throw new Error("This account does not have an active portal profile.");
    }
    return {
      id: profile.id,
      role: profile.role === "admin" ? "staff" : profile.role,
      backendRole: profile.role,
      accountNumber: profile.account_number,
      fullName: profile.full_name,
      displayName: profile.display_name || "",
      email: profile.contact_email || "",
      phoneNumber: profile.phone_number || "",
      college: profile.college || "",
      program: profile.program || "",
      yearLevel: profile.year_level || "",
      semester: profile.semester || "",
      address: profile.address || "",
      position: profile.position || "",
      department: profile.department || "",
      officeLocation: profile.office_location || "",
      officeHours: profile.office_hours || "",
    };
  }

  async function trackSession(account) {
    const { data, error } = await client().auth.getSession();
    if (error || !data?.session) throw new Error("Your authentication session could not be restored.");
    currentAccount = account;
    expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : null;
    signedInAt = Date.now();
    if (account.role === "staff") void loadDirectory();
    return { ...account };
  }

  async function loadDirectory() {
    // Staff may read profiles under the database's staff RLS policy.
    try {
      const { data, error } = await client().from("profiles")
        .select("id,role,account_number,full_name,display_name,contact_email,phone_number,college,program,year_level,semester,position,department,office_location,office_hours,is_active")
        .eq("is_active", true).order("full_name").limit(1000);
      if (error) throw error;
      if (currentAccount?.role !== "staff") return;
      directoryStudents = (data || []).filter((p) => p.role === "student").map(identity);
      directoryStaff = (data || []).filter((p) => p.role === "staff" || p.role === "admin").map(identity);
      document.dispatchEvent(new Event("portal:directoryloaded"));
    } catch (error) {
      console.warn("Staff directory could not be loaded:", error.message);
    }
  }

  async function register({ fullName, accountNumber, email, password, college, program, role = "student" }) {
    if (role !== "student") throw new Error("Staff registration is restricted to administrators.");
    const number = String(accountNumber || "").trim();
    if (number.length < 3 || number.length > 30) throw new Error("Student number must contain 3–30 characters.");
    if (String(password || "").length < 8 || String(password || "").length > 128) throw new Error("Use a password between 8 and 128 characters.");
    const result = await window.PortalSupabaseApi.signUpStudent({ fullName, accountNumber: number, email, password, college, program });
    // If email confirmation is disabled, Supabase signs in at registration.
    // Return to the login form instead of opening a dashboard unexpectedly.
    if (!result.needsEmailConfirmation) {
      const { error } = await client().auth.signOut();
      if (error) throw new Error("Account created, but automatic sign-out failed. Sign out before continuing.");
    }
    return { accountNumber: number, email: String(email).trim().toLowerCase(), needsEmailConfirmation: result.needsEmailConfirmation };
  }

  async function authenticate(emailOrNumber, password, expectedRole = "student") {
    if (pendingSignOut) await pendingSignOut;
    if (!emailOrNumber?.trim() || !password) return null;
    const profile = await window.PortalSupabaseApi.signIn({
      email: emailOrNumber, password, expectedPortalRole: expectedRole,
    });
    return trackSession(identity(profile));
  }

  async function restoreSession() {
    if (pendingSignOut) await pendingSignOut;
    const { data, error } = await client().auth.getSession();
    if (error) throw new Error(error.message);
    if (!data?.session) return null;
    try {
      const profile = await window.PortalSupabaseApi.profile();
      return await trackSession(identity(profile));
    } catch (error) {
      await client().auth.signOut({ scope: "local" });
      currentAccount = null;
      throw error;
    }
  }

  function saveSession(account) {
    if (!isSessionValid(account, false)) throw new Error("The authenticated Supabase account is unavailable.");
    return { ...currentAccount };
  }

  async function clearSession() {
    if (pendingSignOut) return pendingSignOut;
    explicitSignOut = true;
    pendingSignOut = (async () => {
      try {
        const { error } = await client().auth.signOut({ scope: "local" });
        if (error) throw error;
        currentAccount = null;
        expiresAt = null;
        directoryStudents = [];
        directoryStaff = [];
      } finally {
        explicitSignOut = false;
        pendingSignOut = null;
      }
    })();
    return pendingSignOut;
  }

  function isSessionValid(account, notify = false) {
    const ok = Boolean(currentAccount && account && currentAccount.role === account.role
      && currentAccount.accountNumber === account.accountNumber
      && currentAccount.id === account.id && (!expiresAt || expiresAt > Date.now()));
    if (!ok && notify && currentAccount && expiresAt && expiresAt <= Date.now()) {
      const previous = currentAccount;
      currentAccount = null;
      Promise.resolve().then(() => document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", {
        detail: { role: previous.role, accountNumber: previous.accountNumber, message: "Your session expired. Sign in again." },
      })));
    }
    return ok;
  }

  async function changePassword(accountNumber, currentPassword, newPassword, role = "student") {
    if (!isSessionValid({ ...currentAccount, accountNumber, role })) throw new Error("Sign in before changing your password.");
    if (!currentPassword || !newPassword || newPassword.length < 8 || newPassword.length > 128 || newPassword === currentPassword) {
      throw new Error("Enter your current password and a different new password of 8–128 characters.");
    }
    const sb = client();
    const { data: current, error: userError } = await sb.auth.getUser();
    if (userError || !current?.user?.email) throw new Error("Your email could not be verified. Sign in again.");
    const { error: checkError } = await sb.auth.signInWithPassword({ email: current.user.email, password: currentPassword });
    if (checkError) throw new Error("Your current password is incorrect.");
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    await clearSession();
    document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", {
      detail: { role, accountNumber, message: "Password updated. Sign in with your new password." },
    }));
  }

  function listStudents() {
    return currentAccount?.role === "student" ? [{ ...currentAccount }] : [...directoryStudents];
  }
  function listRegisteredStudents() {
    if (currentAccount?.role !== "staff") throw new Error("Staff sign-in required.");
    return [...directoryStudents];
  }
  function listStaff() {
    if (currentAccount?.role !== "staff") throw new Error("Staff sign-in required.");
    return directoryStaff.map(({ accountNumber, fullName }) => ({ accountNumber, fullName }));
  }
  function staffIdentity() {
    if (currentAccount?.role !== "staff") throw new Error("Sign in as staff to access this page.");
    return { ...currentAccount };
  }
  function preferencesKey(account) {
    return `rtu.portal.settings.${encodeURIComponent(account.accountNumber)}.${account.role}`;
  }
  function setSessionPersistence() {
    // Supabase's browser client currently manages persistence. The legacy
    // remember-session preference cannot change it without reconfiguring Auth.
    return true;
  }
  function sessionInfo() {
    if (!currentAccount || !isSessionValid(currentAccount)) return null;
    return { role: currentAccount.role, accountNumber: currentAccount.accountNumber,
      signedInAt: signedInAt ? new Date(signedInAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      persistent: true, legacy: false };
  }

  window.PortalSupabase?.client?.auth.onAuthStateChange((event, session) => {
    if (session?.expires_at) expiresAt = session.expires_at * 1000;
    if (event !== "SIGNED_OUT" || explicitSignOut || !currentAccount) return;
    const previous = currentAccount;
    currentAccount = null;
    directoryStudents = [];
    directoryStaff = [];
    Promise.resolve().then(() => document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", {
      detail: { role: previous.role, accountNumber: previous.accountNumber, message: "You have been signed out." },
    })));
  });

  window.PortalAccounts = Object.freeze({
    register, authenticate, restoreSession, saveSession, clearSession, changePassword,
    listStudents, listRegisteredStudents, listStaff, staffIdentity,
    isSessionValid, sessionInfo, setSessionPersistence, preferencesKey,
    PASSWORD_POLICY, SESSION_POLICY,
  });
})();
