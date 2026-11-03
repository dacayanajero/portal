"use strict";

(() => {
  const accountsKey = "rtu.portal.accounts";
  const staffCredentialsKey = "rtu.portal.staffCredentials";
  const sessionKey = "rtu.portal.session";
  const PASSWORD_POLICY = Object.freeze({ minimumLength: 8, maximumLength: 128, newHashIterations: 600000 });
  const SESSION_POLICY = Object.freeze({ lifetimeMs: 8 * 60 * 60 * 1000, developmentOnly: true });
  let sessionMemory = null;
  const invalidated = new Set();
  const passwordChanges = new Set();
  const demoAccount = {
    role: "student",
    accountNumber: "2023-103319",
    fullName: "Juan Dela Cruz",
    email: "2023-103319@rtu.edu.ph",
    phoneNumber: "0999199192",
    yearLevel: "3rd Year",
    program: "BSIT",
    semester: "1st Semester",
    address: "",
  };
  const staffAccounts = Object.freeze([
    Object.freeze({
      role: "staff",
      accountNumber: "2020-123456",
      fullName: "Crissabelle Veloso",
      email: "cheezyyummy@gmail.com",
      phoneNumber: "",
      position: "Academic Services Staff",
      department: "Office of the Registrar",
      officeLocation: "RTU Pasig Campus - Registrar's Office",
      officeHours: "Monday to Friday, 8:00 AM - 5:00 PM",
      passwordSalt: "fd10c6b26633ca40c5204cf81764e1b4",
      passwordHash: "e9af2bf280b00496306552133520635f09b8982e1c9076fb073037cf492237bc",
    }),
  ]);

  function readAccounts() {
    let accounts;
    try {
      accounts = JSON.parse(window.localStorage.getItem(accountsKey) || "[]");
    } catch {
      throw new Error("Saved demo accounts could not be read. Check that browser storage is available.");
    }
    if (!Array.isArray(accounts) || !accounts.every((account) => (
      account?.role === "student"
      && [account.accountNumber, account.fullName, account.email].every((value) => typeof value === "string" && value.trim())
      && /^[a-f\d]{32}$/.test(account.passwordSalt)
      && /^[a-f\d]{64}$/.test(account.passwordHash)
      && (account.passwordIterations === undefined || Number.isInteger(account.passwordIterations) && account.passwordIterations >= 100000 && account.passwordIterations <= 2000000)
    ))) {
      throw new Error("Saved demo account data is invalid and could not be loaded.");
    }
    return accounts;
  }

  function readStaffCredentials() {
    let credentials;
    try {
      credentials = JSON.parse(window.localStorage.getItem(staffCredentialsKey) || "{}");
    } catch {
      throw new Error("Saved staff credentials are unavailable. Check browser storage.");
    }
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) throw new Error("Saved staff credentials are invalid.");
    return credentials;
  }

  function staffRecords() {
    const credentials = readStaffCredentials();
    return staffAccounts.map((account) => {
      const replacement = credentials[account.accountNumber];
      if (replacement !== undefined) {
        if (!replacement || !/^[a-f\d]{32}$/.test(replacement.passwordSalt) || !/^[a-f\d]{64}$/.test(replacement.passwordHash) || replacement.passwordIterations !== undefined && (!Number.isInteger(replacement.passwordIterations) || replacement.passwordIterations < 100000 || replacement.passwordIterations > 2000000)) throw new Error("Saved staff credentials are invalid.");
        return { ...account, passwordSalt: replacement.passwordSalt, passwordHash: replacement.passwordHash, passwordIterations: replacement.passwordIterations || 100000, credentialVersion: replacement.credentialVersion, passwordChangedAt: replacement.passwordChangedAt };
      }
      return { ...account };
    });
  }

  function publicAccount(account) {
    return {
      role: "student",
      accountNumber: account.accountNumber,
      fullName: account.fullName,
      email: account.email,
      phoneNumber: "",
      yearLevel: "",
      program: account.program || "",
      college: account.college || "",
      semester: "",
      address: "",
    };
  }

  function publicStaffAccount(account) {
    return {
      role: "staff",
      accountNumber: account.accountNumber,
      fullName: account.fullName,
      email: account.email,
      phoneNumber: account.phoneNumber || "",
      position: account.position || "",
      department: account.department || "",
      officeLocation: account.officeLocation || "",
      officeHours: account.officeHours || "",
      passwordChangedAt: typeof account.passwordChangedAt === "string" ? account.passwordChangedAt : "",
      accountStatus: typeof account.status === "string" ? account.status : "Institutional status not connected",
    };
  }

  function findAccount(accountNumber, role = "student") {
    if (role === "staff") {
      const account = staffRecords().find((entry) => entry.accountNumber === accountNumber && entry.active !== false);
      return account ? publicStaffAccount(account) : null;
    }
    const account = readAccounts().find((entry) => entry.accountNumber === accountNumber);
    if (account && accountNumber === demoAccount.accountNumber) return { ...demoAccount };
    return account ? publicAccount(account) : null;
  }

  function listStudents() {
    let students = [];
    try {
      students = readAccounts().map(publicAccount);
    } catch {
      students = [];
    }
    if (!students.some((account) => account.accountNumber === demoAccount.accountNumber)) {
      students.unshift({ ...demoAccount });
    }
    return students;
  }

  // Staff records source: saved accounts only, without seeded identities or credentials.
  function listRegisteredStudents() {
    if (window.PortalStaffContext?.current()?.account?.role !== "staff") throw new Error("Authorized staff access is required.");
    return readAccounts().map(publicAccount);
  }

  function listStaff() {
    if (window.PortalStaffContext?.current()?.account?.role !== "staff") throw new Error("Authorized staff access is required.");
    return staffRecords().filter((account) => account.active !== false).map((account) => ({ accountNumber: account.accountNumber, fullName: staffLabel(account) }));
  }

  function staffLabel(account) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`rtu.portal.staffProfile.${encodeURIComponent(account.accountNumber)}`) || "{}");
      const value = typeof saved.profile?.displayName === "string" ? saved.profile.displayName : saved.profile?.fullName !== account.fullName ? saved.profile?.fullName : "";
      if (typeof value === "string" && value.trim() && value.length <= 100) return value.trim();
    } catch {}
    return account.fullName;
  }

  function staffIdentity() {
    const current = window.PortalStaffContext?.current()?.account;
    if (current?.role !== "staff") throw new Error("Sign in as staff to access your account.");
    const account = findAccount(current.accountNumber, "staff");
    if (!account) throw new Error("Your staff account is unavailable.");
    return account;
  }

  function toHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt, iterations = 100000) {
    if (!window.crypto?.subtle) throw new Error("Account creation and sign-in require opening the demo on localhost or HTTPS.");
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const saltBytes = Uint8Array.from(salt.match(/.{2}/g), (byte) => parseInt(byte, 16));
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) throw new Error("Saved credential parameters are invalid.");
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256);
    return toHex(new Uint8Array(bits));
  }

  function checkDuplicate(accounts, accountNumber, email) {
    if (staffAccounts.some((account) => account.accountNumber === accountNumber)) throw new Error("This identifier is reserved for a provisioned account. Use your student number.");
    if (accountNumber === demoAccount.accountNumber || accounts.some((account) => account.accountNumber === accountNumber)) {
      throw new Error("This student number already has an account. Please sign in instead.");
    }
    if (email === demoAccount.email || accounts.some((account) => account.email.toLowerCase() === email)) {
      throw new Error("This email is already registered. Please use a different email.");
    }
  }

  async function register({ fullName, accountNumber, email, password, college, program, role = "student" }) {
    if (role !== "student") throw new Error("Staff accounts are provisioned; public staff registration is unavailable.");
    fullName = fullName.trim();
    accountNumber = accountNumber.trim();
    email = email.trim().toLowerCase();
    college = typeof college === "string" ? college.trim() : "";
    program = typeof program === "string" ? program.trim() : "";
    if (!fullName || fullName.length > 100 || !accountNumber || accountNumber.length > 40 || !email || email.length > 254 || !college || college.length > 150 || !program || program.length > 150) throw new Error("Complete all registration fields.");
    if (typeof password !== "string" || password.length < PASSWORD_POLICY.minimumLength || password.length > PASSWORD_POLICY.maximumLength || !password.trim()) throw new Error("Use 8–128 characters for your registration password.");
    checkDuplicate(readAccounts(), accountNumber, email);
    const passwordSalt = toHex(window.crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password, passwordSalt, PASSWORD_POLICY.newHashIterations);
    // Re-read after hashing so another completed registration is preserved.
    const accounts = readAccounts();
    checkDuplicate(accounts, accountNumber, email);
    const account = { role: "student", fullName, accountNumber, email, passwordSalt, passwordHash, passwordIterations: PASSWORD_POLICY.newHashIterations, credentialVersion: window.crypto.randomUUID(), college, program };
    accounts.push(account);
    try {
      window.localStorage.setItem(accountsKey, JSON.stringify(accounts));
    } catch {
      throw new Error("Your account could not be saved. Browser storage is unavailable or full. Please try again.");
    }
    return publicAccount(account);
  }

  async function authenticate(accountNumber, password, role = "student") {
    if (!["student", "staff"].includes(role) || typeof password !== "string" || !password) return null;
    accountNumber = accountNumber.trim();
    if (role === "staff") {
      const account = staffRecords().find((entry) => entry.accountNumber === accountNumber && entry.active !== false);
      if (!account || await hashPassword(password, account.passwordSalt, account.passwordIterations || 100000) !== account.passwordHash) return null;
      if (credentialVersion(accountNumber, role) !== (account.credentialVersion || "legacy")) return null;
      return publicStaffAccount(account);
    }
    const account = readAccounts().find((entry) => entry.accountNumber === accountNumber);
    if (!account || await hashPassword(password, account.passwordSalt, account.passwordIterations || 100000) !== account.passwordHash) return null;
    if (credentialVersion(accountNumber, role) !== (account.credentialVersion || "legacy")) return null;
    if (accountNumber === demoAccount.accountNumber) return { ...demoAccount };
    return publicAccount(account);
  }

  async function changePassword(accountNumber, currentPassword, newPassword, role = "student") {
    const owner = () => role === "staff" ? window.PortalStaffContext?.current()?.account : window.PortalProfile?.snapshot()?.account;
    const authorized = () => { const account = owner(); if (!["staff", "student"].includes(role) || account?.role !== role || account.accountNumber !== accountNumber || !isSessionValid(account)) throw new Error("This operation requires your active account sign-in."); };
    authorized();
    if (typeof currentPassword !== "string" || !currentPassword) throw new Error("Enter your current password.");
    if (typeof newPassword !== "string" || !newPassword.trim() || newPassword.length < PASSWORD_POLICY.minimumLength || newPassword.length > PASSWORD_POLICY.maximumLength) throw new Error("Use 8–128 characters for your new password. A long, unique passphrase is recommended.");
    if (newPassword === currentPassword) throw new Error("Choose a new password different from your current password.");
    const key = `${role}:${accountNumber}`;
    const operationSession = sessionMemory;
    if (passwordChanges.has(key)) throw new Error("A password update is already in progress.");
    passwordChanges.add(key);
    try {
      const originalVersion = credentialVersion(accountNumber, role);
      const verified = await authenticate(accountNumber, currentPassword, role);
      if (!verified) throw new Error("Your current password could not be verified.");
      const passwordSalt = toHex(window.crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash = await hashPassword(newPassword, passwordSalt, PASSWORD_POLICY.newHashIterations);
      authorized();
      if (sessionMemory !== operationSession) throw new Error("Your sign-in changed while updating. Reauthenticate before trying again.");
      if (credentialVersion(accountNumber, role) !== originalVersion) throw new Error("Credentials changed while updating. Sign in again.");
      const updated = { passwordSalt, passwordHash, passwordIterations: PASSWORD_POLICY.newHashIterations, credentialVersion: window.crypto.randomUUID(), passwordChangedAt: new Date().toISOString() };
      try {
        if (role === "staff") { const credentials = readStaffCredentials(); credentials[accountNumber] = updated; window.localStorage.setItem(staffCredentialsKey, JSON.stringify(credentials)); }
        else { const accounts = readAccounts(); const index = accounts.findIndex((entry) => entry.accountNumber === accountNumber); if (index < 0) throw new Error("Unavailable"); accounts[index] = { ...accounts[index], ...updated }; window.localStorage.setItem(accountsKey, JSON.stringify(accounts)); }
      } catch { throw new Error("Your password could not be saved. Browser storage is unavailable or full."); }
      invalidateSession("passwordChanged", { role, accountNumber });
    } finally { passwordChanges.delete(key); }
  }

  function credentialVersion(number, role) {
    const record = role === "staff" ? staffRecords().find((entry) => entry.accountNumber === number && entry.active !== false) : readAccounts().find((entry) => entry.accountNumber === number);
    if (!record) throw new Error("Account unavailable.");
    return record.credentialVersion || "legacy";
  }
  function saveSession(account, options = {}) {
    const identity = account && ["student", "staff"].includes(account.role) ? findAccount(account.accountNumber, account.role) : null;
    if (!identity) throw new Error("A valid account is required to establish the demo session.");
    const version = credentialVersion(account.accountNumber, account.role);
    if (options.newLogin || !sessionMemory || sessionMemory.role !== account.role || sessionMemory.accountNumber !== account.accountNumber) sessionMemory = { schemaVersion: 2, role: account.role, accountNumber: account.accountNumber, signedInAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_POLICY.lifetimeMs).toISOString(), credentialVersion: version, legacy: false };
    invalidated.delete(`${account.role}:${account.accountNumber}`);
    let remember = false;
    try { const preferences = JSON.parse(window.localStorage.getItem(preferencesKey(account)) || "{}"); remember = (!preferences.ownerRole || preferences.ownerRole === account.role) && preferences.rememberSession !== false; } catch {}
    setSessionPersistence(remember, account);
    return identity;
  }

  function restoreSession() {
    try {
      const stored = window.sessionStorage.getItem(sessionKey); if (!stored) return null;
      if (stored.startsWith("{")) sessionMemory = JSON.parse(stored);
      else { const separator = stored.indexOf(":"); sessionMemory = { schemaVersion: 2, role: stored.slice(0, separator), accountNumber: stored.slice(separator + 1), signedInAt: null, expiresAt: null, credentialVersion: "legacy", legacy: true }; }
      const account = findAccount(sessionMemory.accountNumber, sessionMemory.role);
      if (!account || !isSessionValid(account)) return null;
      return account;
    } catch { if (sessionMemory) invalidateSession("unavailable", sessionMemory); else clearSession(); return null; }
  }

  function clearSession() {
    sessionMemory = null;
    try {
      window.sessionStorage.removeItem(sessionKey);
    } catch {
      // Complete sign-out even when session storage is unavailable.
    }
  }

  function invalidateSession(reason, account = sessionMemory) {
    const detail = account ? { role: account.role, accountNumber: account.accountNumber, reason } : null;
    clearSession();
    if (detail && !invalidated.has(`${detail.role}:${detail.accountNumber}`)) {
      invalidated.add(`${detail.role}:${detail.accountNumber}`);
      const messages = { passwordChanged: "Password changed. Sign in again with your new password.", expired: "Your demo session expired. Sign in again.", credentialsChanged: "Your account credentials changed. Sign in again.", unavailable: "Your account session could not be verified. Sign in again.", signedOut: "Your session ended. Sign in again." };
      Promise.resolve().then(() => document.dispatchEvent(new CustomEvent("portal:sessioninvalidated", { detail: { ...detail, message: messages[reason] || messages.unavailable } })));
    }
  }
  function isSessionValid(account, notify = true) {
    let reason = "signedOut";
    try {
      if (sessionMemory?.schemaVersion === 2 && ["staff", "student"].includes(sessionMemory.role) && sessionMemory.role === account?.role && sessionMemory.accountNumber === account.accountNumber) {
        if (sessionMemory.expiresAt && (!Number.isFinite(Date.parse(sessionMemory.expiresAt)) || Date.parse(sessionMemory.expiresAt) <= Date.now())) reason = "expired";
        else if (sessionMemory.credentialVersion !== credentialVersion(account.accountNumber, account.role)) reason = "credentialsChanged";
        else if (sessionMemory.legacy) return true;
        else if (typeof sessionMemory.signedInAt === "string" && typeof sessionMemory.expiresAt === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(sessionMemory.signedInAt) && /(?:Z|[+-]\d{2}:\d{2})$/.test(sessionMemory.expiresAt) && Number.isFinite(Date.parse(sessionMemory.signedInAt)) && Date.parse(sessionMemory.signedInAt) <= Date.now() && Date.parse(sessionMemory.expiresAt) > Date.parse(sessionMemory.signedInAt) && Date.parse(sessionMemory.expiresAt) - Date.parse(sessionMemory.signedInAt) <= SESSION_POLICY.lifetimeMs) return true;
        else reason = "unavailable";
      }
    } catch { reason = "unavailable"; }
    if (notify && account) invalidateSession(reason, account); return false;
  }
  function setSessionPersistence(remember, account) {
    if (!sessionMemory || sessionMemory.role !== account?.role || sessionMemory.accountNumber !== account.accountNumber) return false;
    try { if (remember) window.sessionStorage.setItem(sessionKey, JSON.stringify(sessionMemory)); else window.sessionStorage.removeItem(sessionKey); return true; } catch { return false; }
  }
  function sessionInfo() {
    if (!sessionMemory) return null;
    if (!isSessionValid({ role: sessionMemory.role, accountNumber: sessionMemory.accountNumber }, false)) return null;
    let persistent = false; try { persistent = window.sessionStorage.getItem(sessionKey) !== null; } catch {}
    return { role: sessionMemory.role, accountNumber: sessionMemory.accountNumber, signedInAt: sessionMemory.signedInAt, expiresAt: sessionMemory.expiresAt, legacy: Boolean(sessionMemory.legacy), persistent };
  }
  function preferencesKey(account) {
    const base = `rtu.portal.settings.${encodeURIComponent(account.accountNumber)}`;
    // Normal keys stay unchanged. Isolate pre-existing student/staff ID collisions;
    // new student registrations cannot use a provisioned employee identifier.
    return account.role === "student" && staffAccounts.some((staff) => staff.accountNumber === account.accountNumber) ? `${base}.student` : base;
  }
  window.addEventListener("storage", (event) => { if (sessionMemory && (event.key === staffCredentialsKey || event.key === accountsKey || event.key === null)) isSessionValid({ role: sessionMemory.role, accountNumber: sessionMemory.accountNumber }); });

  window.PortalAccounts = Object.freeze({
    register,
    authenticate,
    changePassword,
    saveSession,
    restoreSession,
    clearSession,
    listStudents,
    listRegisteredStudents,
    listStaff,
    staffIdentity,
    PASSWORD_POLICY,
    SESSION_POLICY,
    isSessionValid,
    setSessionPersistence,
    sessionInfo,
    preferencesKey,
  });
})();
