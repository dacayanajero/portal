"use strict";

// Supabase Auth is the sole source of account identity. The remaining document
// and appointment services are still browser-local until separately migrated.
(() => {
  const PASSWORD_POLICY = Object.freeze({ minimumLength: 8, maximumLength: 128 });
  const SESSION_POLICY = Object.freeze({ developmentOnly: false, lifetimeMs: null, inactivityMs: 10 * 60 * 1000, warningMs: 60 * 1000 });
  const ACTIVITY_PREFIX = "rtu.portal.auth.activity.v1:";
  let activityKey = "", warningDialog = null, lastPointerWrite = 0;
  const IDLE_MESSAGE = "You were signed out after 10 minutes of inactivity. Please sign in again.";
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
      employeeNumber: profile.employee_number || "",
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

  // JWT session_id is only a browser cache key; Supabase still authenticates every request.
  function keyFor(session) {
    try {
      const part = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const sid = JSON.parse(atob(part)).session_id;
      if (typeof sid !== "string" || !/^[0-9a-f-]{36}$/i.test(sid)) throw Error();
      return ACTIVITY_PREFIX + sid;
    } catch { throw new Error("Session identity is unavailable. Please sign in again."); }
  }
  function readActivity(key = activityKey) {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      const record = raw ? JSON.parse(raw) : null;
      return record && Number.isFinite(record.last) && Number.isFinite(record.started) &&
        record.last >= record.started && record.started > 0 && record.last <= Date.now() ? record : null;
    } catch { return null; }
  }
  function remaining(key = activityKey) {
    const record = readActivity(key);
    return record ? Math.max(0, record.last + SESSION_POLICY.inactivityMs - Date.now()) : 0;
  }
  function writeActivity(key, record) {
    localStorage.setItem(key, JSON.stringify(record));
  }
  function forgetActivity(key = activityKey) {
    try { if (key) localStorage.removeItem(key); } catch {}
  }
  function hideWarning() { if (warningDialog?.open) warningDialog.close(); }
  function invalidate(message = IDLE_MESSAGE) {
    const previous = currentAccount;
    if (!previous) return;
    forgetActivity(); hideWarning();
    currentAccount = null; expiresAt = null; directoryStudents = []; directoryStaff = [];
    // Let the existing dashboard logout handlers clear the Supabase refresh session and UI.
    Promise.resolve().then(() => document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", {
      detail: { role: previous.role, accountNumber: previous.accountNumber, message },
    })));
  }
  function recordActivity() {
    if (!currentAccount) return false;
    const record = readActivity();
    if (!record || remaining() <= 0) { invalidate(); return false; }
    try { writeActivity(activityKey, { ...record, last: Date.now() }); }
    catch { invalidate("Session storage is unavailable. Please sign in again."); return false; }
    hideWarning();
    return true;
  }
  function showWarning(ms) {
    if (document.hidden || !document.body) return;
    if (!warningDialog) {
      const dialog = document.createElement("dialog");
      dialog.className = "portal-dialog";
      dialog.setAttribute("aria-labelledby", "portal-idle-title");
      Object.assign(dialog.style,{maxWidth:"420px",width:"calc(100% - 32px)",padding:"24px"});
      const title=document.createElement("h3"); title.id="portal-idle-title"; title.textContent="Your session is about to expire";
      const description=document.createElement("p"); description.textContent="You have been inactive. Stay signed in to continue, or sign out now.";
      const countdown=document.createElement("p"); countdown.id="portal-idle-countdown"; countdown.setAttribute("role","timer");
      const actions=document.createElement("div"); actions.className="support-actions";
      const logout=document.createElement("button"); logout.type="button"; logout.className="secondary-button"; logout.textContent="Log Out";
      logout.addEventListener("click",()=>invalidate("You have been signed out."));
      const stay=document.createElement("button"); stay.type="button"; stay.className="primary-button"; stay.textContent="Stay Logged In";
      stay.addEventListener("click",recordActivity);
      actions.append(logout,stay); dialog.append(title,description,countdown,actions);
      dialog.addEventListener("cancel",event=>event.preventDefault());
      document.body.append(dialog); warningDialog=dialog;
    }
    const seconds=Math.ceil(ms/1000);
    warningDialog.querySelector("#portal-idle-countdown").textContent=
      "Automatic sign-out in "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
    if (!warningDialog.open) warningDialog.showModal();
  }
  function checkIdle() {
    if (!currentAccount) { hideWarning(); return false; }
    const ms=remaining();
    if (ms<=0) { invalidate(); return false; }
    if (ms<=SESSION_POLICY.warningMs) showWarning(ms); else hideWarning();
    return true;
  }
  function activityEvent(event) {
    if (!currentAccount || !event.isTrusted || document.hidden) return;
    // Reject input arriving after a suspended tab's deadline before its handlers run.
    if (!checkIdle()) { if(event.cancelable)event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (warningDialog?.open) return; // explicit Stay Logged In is required during warning
    if (event.type==="pointermove") {
      if (Date.now()-lastPointerWrite<1000) return;
      lastPointerWrite=Date.now();
    }
    recordActivity();
  }

  async function trackSession(account, fresh = false) {
    const { data, error } = await client().auth.getSession();
    if (error || !data?.session) throw new Error("Your authentication session could not be restored.");
    const key = keyFor(data.session);
    if (fresh) {
      try { const now = Date.now(); writeActivity(key, { started: now, last: now }); }
      catch { await client().auth.signOut({ scope: "local" }); throw new Error("Session storage is unavailable. Please enable browser storage."); }
    }
    if (remaining(key) <= 0) {
      forgetActivity(key);
      await client().auth.signOut({ scope: "local" });
      throw new Error(IDLE_MESSAGE);
    }
    activityKey = key;
    currentAccount = account;
    expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : null;
    signedInAt = readActivity().started;
    lastPointerWrite=0;
    if (account.role === "staff") void loadDirectory();
    return { ...account };
  }

  async function loadDirectory() {
    // Staff may read profiles under the database's staff RLS policy.
    try {
      const { data, error } = await client().from("profiles")
        .select("id,role,account_number,employee_number,full_name,display_name,contact_email,phone_number,college,program,year_level,semester,position,department,office_location,office_hours,is_active")
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
    return trackSession(identity(profile), true);
  }

  async function requestPasswordReset(email) {
    const redirectTo = new URL("reset-password.html", window.location.href).href;
    const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    // Give the same acknowledgement for registered and unregistered addresses.
    if (!error || error.code === "user_not_found") return;
    if (error.status === 429) throw new Error("Too many reset requests. Please wait a few minutes before trying again.");
    throw new Error("Password reset email is unavailable right now. Please try again later.");
  }

  async function restoreSession() {
    if (pendingSignOut) await pendingSignOut;
    const { data, error } = await client().auth.getSession();
    if (error) throw new Error(error.message);
    if (!data?.session) return null;
    // Check before loading profile or rendering either protected dashboard. A pre-upgrade
    // session without a recorded activity time must authenticate once.
    let key;
    try { key=keyFor(data.session); } catch {}
    if (!key || remaining(key)<=0) {
      forgetActivity(key);
      await client().auth.signOut({scope:"local"}).catch(()=>{});
      throw new Error(IDLE_MESSAGE);
    }
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
    const key = activityKey;
    pendingSignOut = (async () => {
      try {
        const { error } = await client().auth.signOut({ scope: "local" });
        if (error) throw error;
        forgetActivity(key); activityKey = ""; hideWarning();
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
    if (currentAccount && remaining() <= 0) invalidate();
    const ok = Boolean(currentAccount && account && currentAccount.role === account.role
      && currentAccount.accountNumber === account.accountNumber
      && currentAccount.id === account.id && (!expiresAt || expiresAt > Date.now()));
    if (!ok && notify && currentAccount && expiresAt && expiresAt <= Date.now()) {
      invalidate("Your authentication session expired. Sign in again.");
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
      idleExpiresAt: new Date(Date.now()+remaining()).toISOString(),
      persistent: true, legacy: false };
  }

  window.PortalSupabase?.client?.auth.onAuthStateChange((event, session) => {
    if (session?.expires_at) expiresAt = session.expires_at * 1000;
    if (event !== "SIGNED_OUT" || explicitSignOut || !currentAccount) return;
    const previous = currentAccount;
    forgetActivity(); activityKey=""; hideWarning();
    currentAccount = null;
    directoryStudents = [];
    directoryStaff = [];
    Promise.resolve().then(() => document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", {
      detail: { role: previous.role, accountNumber: previous.accountNumber, message: "You have been signed out." },
    })));
  });

  ["pointermove","pointerdown","click","keydown","input","wheel","touchstart","scroll"].forEach(name =>
    document.addEventListener(name,activityEvent,{capture:true,passive:false}));
  window.addEventListener("focus",checkIdle);
  window.addEventListener("pageshow",checkIdle);
  document.addEventListener("visibilitychange",checkIdle);
  window.addEventListener("storage",event=>{if(event.key===activityKey||event.key===null)checkIdle();});
  window.setInterval(checkIdle,1000);

  window.PortalAccounts = Object.freeze({
    register, authenticate, restoreSession, saveSession, clearSession, changePassword, requestPasswordReset,
    listStudents, listRegisteredStudents, listStaff, staffIdentity,
    isSessionValid, sessionInfo, setSessionPersistence, preferencesKey,
    PASSWORD_POLICY, SESSION_POLICY,
  });
})();
