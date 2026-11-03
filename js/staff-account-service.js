"use strict";

// Owner-scoped profile/preferences facade over existing keys and authentication.
(() => {
  const accounts = window.PortalAccounts;
  const DEFAULTS = Object.freeze({ requestAlerts: true, processingAlerts: true, supportAlerts: true, rememberSession: true, darkMode: false });
  function owner() {
    const account = accounts.staffIdentity();
    if (!accounts.isSessionValid(account)) throw new Error("Your staff session is unavailable. Sign in again.");
    return account;
  }
  const profileKey = (account) => `rtu.portal.staffProfile.${encodeURIComponent(account.accountNumber)}`;
  const preferenceKey = (account) => accounts.preferencesKey(account);
  function read(key) {
    let record;
    try { record = JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { throw new Error("Your saved account settings could not be read in this browser."); }
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Your saved account settings are invalid.");
    if (record.ownerRole && record.ownerRole !== "staff") throw new Error("These saved preferences belong to another account role and have not been overwritten.");
    return record;
  }
  function write(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { throw new Error("Your changes could not be saved. Browser storage is unavailable or full."); } }
  function validateProfile(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((field) => !["displayName", "phoneNumber"].includes(field))) throw new Error("Only display name and contact number can be edited here. Registered identity and employment fields are read-only.");
    if (Object.values(input).some((value) => typeof value !== "string")) throw new Error("Profile values must be text.");
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    const phoneNumber = typeof input.phoneNumber === "string" ? input.phoneNumber.trim() : "";
    if (displayName.length > 100) throw new Error("Use at most 100 characters for your display name.");
    if (phoneNumber.length > 20 || phoneNumber && (!/^[+\d() .-]+$/.test(phoneNumber) || phoneNumber.replace(/\D/g, "").length < 7)) throw new Error("Enter a valid contact number, or leave it empty.");
    return { displayName, phoneNumber };
  }
  function snapshot() {
    const account = owner(); const record = read(profileKey(account)); const profile = record.profile && typeof record.profile === "object" && !Array.isArray(record.profile) ? record.profile : {};
    const legacyDisplay = typeof profile.fullName === "string" && profile.fullName !== account.fullName ? profile.fullName : "";
    let values;
    try { values = validateProfile({ displayName: typeof profile.displayName === "string" ? profile.displayName : legacyDisplay, phoneNumber: profile.phoneNumber || account.phoneNumber || "" }); }
    catch { values = { displayName: "", phoneNumber: account.phoneNumber || "" }; }
    return { account, profile: { ...account, ...values, legalName: account.fullName, fullName: values.displayName || account.fullName }, revision: Number.isInteger(record.revision) ? record.revision : 0, updatedAt: Number.isFinite(record.updatedAt) && record.updatedAt > 0 && !Number.isNaN(new Date(record.updatedAt).getTime()) ? new Date(record.updatedAt).toISOString() : "" };
  }
  function saveProfile(input, revision) {
    const account = owner(); validateProfile(input); const record = read(profileKey(account)); const current = snapshot().profile;
    const values = validateProfile({ displayName: current.displayName, phoneNumber: current.phoneNumber, ...input });
    if ((record.revision || 0) !== revision) throw new Error("Your profile changed in another view. Reload its latest values before saving; your unsaved changes have been kept.");
    // Preserve legacy data for review, but never use it to override account identity/employment.
    write(profileKey(account), { ...record, ownerRole: "staff", profile: { ...(record.profile || {}), ...values }, updatedAt: Date.now(), revision: revision + 1 });
    document.dispatchEvent(new Event("portal:staffprofileupdated")); return snapshot();
  }
  function preferences() {
    const account = owner(); const record = read(preferenceKey(account)); const result = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach((key) => { if (typeof record[key] === "boolean") result[key] = record[key]; });
    return result;
  }
  function savePreferences(changes) {
    const account = owner();
    if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.entries(changes).some(([key, value]) => !Object.hasOwn(DEFAULTS, key) || typeof value !== "boolean")) throw new Error("Only supported account preference values can be changed.");
    const key = preferenceKey(account); const record = read(key); const values = { ...preferences(), ...changes };
    write(key, { ...record, ...values, ownerRole: "staff" });
    if (Object.hasOwn(changes, "rememberSession")) accounts.setSessionPersistence(values.rememberSession, account);
    document.dispatchEvent(new Event("portal:staffpreferencesupdated")); document.dispatchEvent(new Event("portal:notificationschanged"));
    return values;
  }
  function canAccess(page) {
    try {
      owner();
      if (page === "staff-announcements") return window.PortalAnnouncementService.capabilities().includes("view");
      if (page === "staff-reports") return window.PortalReportService.capabilities().includes("aggregate");
      if (page === "staff-help-support") return window.PortalSupportService.capabilities().some((capability) => ["viewAll", "viewAssigned", "faqView"].includes(capability));
      return ["staff-dashboard", "staff-requests", "staff-appointments", "staff-document-processing", "staff-records", "staff-profile", "staff-settings"].includes(page);
    } catch { return false; }
  }
  window.addEventListener("storage", (event) => {
    const account = window.PortalStaffContext?.current()?.account; if (!account) return;
    if (event.key === null || event.key === profileKey(account)) document.dispatchEvent(new Event("portal:staffprofileupdated"));
    if (event.key === null || event.key === preferenceKey(account)) document.dispatchEvent(new Event("portal:staffpreferencesupdated"));
  });
  window.PortalStaffAccountService = Object.freeze({ DEFAULTS, snapshot, validateProfile, saveProfile, preferences, savePreferences, canAccess });
})();
