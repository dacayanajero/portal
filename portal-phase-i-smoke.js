"use strict";

// Real Web Crypto verification, isolated stores and generated test credentials.
const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path"); const vm = require("node:vm"); const crypto = require("node:crypto");
const local = new Map(); const tab = new Map(); let clock = "2026-10-31T00:00:00.000Z"; let failWrites = false; let staff = null; let student = null;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return Date.parse(clock); } }
const window = new EventTarget(); window.crypto = crypto.webcrypto;
window.localStorage = { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error("Full"); local.set(key, value); } };
window.sessionStorage = { getItem: (key) => tab.get(key) ?? null, setItem: (key, value) => tab.set(key, value), removeItem: (key) => tab.delete(key) };
const document = new EventTarget();
window.PortalStaffContext = { current: () => staff && window.PortalAccounts.isSessionValid(staff.account, false) ? staff : null };
window.PortalProfile = { snapshot: () => ({ account: student && window.PortalAccounts.isSessionValid(student, false) ? student : null, values: {} }) };
const context = vm.createContext({ window, document, CustomEvent, Event, Date: Clock, TextEncoder, console });
for (const file of ["accounts.js", "staff-account-service.js", "request-service.js", "appointment-service.js", "student-record-service.js", "announcement-config.js", "announcement-service.js", "report-config.js", "report-service.js", "support-config.js", "support-service.js", "notifications.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "js", file), "utf8"), context, { filename: file });
const accounts = window.PortalAccounts; const service = window.PortalStaffAccountService;
const employee = "2020-123456"; const credentialKey = "rtu.portal.staffCredentials"; const profileKey = `rtu.portal.staffProfile.${employee}`; const preferenceKey = `rtu.portal.settings.${employee}`;
const originalSecret = crypto.randomUUID(); const initialSalt = crypto.randomBytes(16).toString("hex");
const initialCredential = { passwordSalt: initialSalt, passwordHash: crypto.pbkdf2Sync(originalSecret, Buffer.from(initialSalt, "hex"), 100000, 32, "sha256").toString("hex") };
local.set(credentialKey, JSON.stringify({ [employee]: initialCredential }));
let passed = 0; async function test(label, callback) { await callback(); passed++; console.log(`PASS ${label}`); }
async function signIn(secret = originalSecret) { const account = await accounts.authenticate(employee, secret, "staff"); assert.ok(account); staff = { account, profile: { fullName: account.fullName } }; student = null; accounts.saveSession(account, { newLogin: true }); return account; }
const invalidations = []; document.addEventListener("portal:sessioninvalidated", (event) => invalidations.push(event.detail));

(async () => {
  await test("Legacy PBKDF2 staff credentials still authenticate without exposing credential fields", async () => {
    const account = await signIn(); assert.equal(account.role, "staff"); assert.equal(account.passwordHash, undefined); assert.equal(account.passwordSalt, undefined); assert.equal(account.passwordIterations, undefined);
    assert.equal(await accounts.authenticate(employee, "incorrect", "staff"), null); assert.equal(await accounts.authenticate("unknown", "incorrect", "staff"), null);
  });
  const legal = { ...staff.account };
  await test("Fresh session metadata records real current sign-in/expiration and contains no passwords/hashes", () => {
    const session = accounts.sessionInfo(); assert.equal(session.signedInAt, clock); assert.equal(Date.parse(session.expiresAt) - Date.parse(session.signedInAt), accounts.SESSION_POLICY.lifetimeMs); assert.equal(session.persistent, true);
    const raw = tab.get("rtu.portal.session"); assert.equal(raw.includes(originalSecret), false); assert.equal(raw.includes(initialCredential.passwordHash), false);
  });
  await test("Profile defaults come from the provisioned owner; optional contact data is not invented", () => { const snapshot = service.snapshot(); assert.equal(snapshot.account.accountNumber, employee); assert.equal(snapshot.profile.legalName, legal.fullName); assert.equal(snapshot.profile.phoneNumber, ""); assert.equal(snapshot.profile.displayName, ""); assert.equal(snapshot.account.accountStatus, "Institutional status not connected"); });
  await test("Legacy renamed profile is retained only as display name; old employment/email overrides are ignored", () => {
    local.set(profileKey, JSON.stringify({ profile: { fullName: "Legacy display", phoneNumber: "09171234567", role: "administrator", position: "Fake privileged position", department: "Fake department", email: "other@example.test" }, updatedAt: Date.now() }));
    const profile = service.snapshot().profile; assert.equal(profile.displayName, "Legacy display"); assert.equal(profile.legalName, legal.fullName); assert.equal(profile.position, legal.position); assert.equal(profile.department, legal.department); assert.equal(profile.email, legal.email);
  });
  await test("Privileged identity, legal name, email and permission changes are rejected through the service", () => {
    const before = local.get(profileKey);
    for (const field of ["employeeNumber", "accountNumber", "legalName", "fullName", "email", "department", "position", "role", "permissions"]) assert.throws(() => service.saveProfile({ displayName: "Safe", [field]: "forbidden" }, 0));
    assert.equal(local.get(profileKey), before);
  });
  await test("Display/contact values validate type, length and phone format", () => { for (const input of [[], { displayName: 123 }, { displayName: "x".repeat(101) }, { phoneNumber: "bad" }, { phoneNumber: "1".repeat(21) }]) assert.throws(() => service.saveProfile(input, 0)); });
  let snapshot = service.saveProfile({ displayName: "New display label", phoneNumber: "+63 917 123 4567" }, 0); staff.profile = snapshot.profile;
  await test("Allowed profile updates persist in the existing owner key and never change authenticated identity", () => { assert.equal(service.snapshot().profile.fullName, "New display label"); assert.equal(service.snapshot().account.fullName, legal.fullName); assert.equal(service.snapshot().account.accountNumber, employee); assert.equal(accounts.listStaff()[0].fullName, "New display label"); assert.ok(snapshot.updatedAt); });
  await test("Partial profile updates preserve other permitted values and stale revisions are rejected", () => { snapshot = service.saveProfile({ phoneNumber: "" }, snapshot.revision); assert.equal(snapshot.profile.displayName, "New display label"); assert.equal(snapshot.profile.phoneNumber, ""); assert.throws(() => service.saveProfile({ displayName: "Stale" }, 0)); staff.profile = snapshot.profile; });
  await test("Failed profile persistence neither changes source nor claims saved data", () => { const before = local.get(profileKey); failWrites = true; assert.throws(() => service.saveProfile({ displayName: "Not saved" }, snapshot.revision)); failWrites = false; assert.equal(local.get(profileKey), before); assert.equal(service.snapshot().profile.displayName, "New display label"); });
  const request = window.PortalRequestService.create({ student: { accountNumber: "TEST-I-STUDENT", fullName: "Test Student" }, document: "Grade Slip", purpose: "Fixture", details: { appointmentDate: "2099-11-01", appointmentStart: "09:00", appointmentEnd: "10:00" } });
  const actor = () => ({ role: "staff", accountNumber: employee, name: staff.profile.fullName });
  window.PortalRequestService.updateStatus(request.id, window.PortalRequestService.STATUS.APPROVED, actor());
  const historyBefore = window.PortalRequestService.get(request.id).history;
  await test("Changing display names never rewrites historical action names/IDs, while future actions use the new label", () => {
    snapshot = service.saveProfile({ displayName: "Future action label" }, snapshot.revision); staff.profile = snapshot.profile;
    assert.deepEqual(window.PortalRequestService.get(request.id).history, historyBefore);
    window.PortalRequestService.updateStatus(request.id, window.PortalRequestService.STATUS.PROCESSING, actor());
    const history = window.PortalRequestService.get(request.id).history; assert.equal(history.at(-2).actor, "New display label"); assert.equal(history.at(-1).actor, "Future action label"); assert.equal(history.at(-1).staffId, employee);
  });
  await test("Staff preferences use the existing key, preserve legacy flags and reject unsupported settings", () => {
    local.set(preferenceKey, JSON.stringify({ darkMode: false, shiftReminders: true, announcementAlerts: false }));
    const saved = service.savePreferences({ darkMode: true, requestAlerts: false, supportAlerts: false }); assert.equal(saved.darkMode, true); assert.equal(saved.supportAlerts, false); assert.equal(JSON.parse(local.get(preferenceKey)).shiftReminders, true);
    for (const change of [{ role: "admin" }, { darkMode: "true" }, { shiftReminders: false }, []]) assert.throws(() => service.savePreferences(change));
  });
  await test("Preference write errors preserve prior stored flags instead of claiming success", () => { const before = local.get(preferenceKey); failWrites = true; assert.throws(() => service.savePreferences({ darkMode: false })); failWrites = false; assert.equal(local.get(preferenceKey), before); });
  await test("Optional preference suppression cannot hide mandatory notices", () => {
    const list = [{ source: "requests", mandatory: false }, { source: "processing", mandatory: false }, { source: "support", mandatory: false }, { source: "support", mandatory: true }];
    const visible = window.PortalNotifications.visible(list, { requestAlerts: false, processingAlerts: false, supportAlerts: false }); assert.equal(visible.length, 1); assert.equal(visible[0].mandatory, true);
  });
  await test("Assigned processing notifications use stable staff IDs rather than mutable names", () => { const items = window.PortalNotifications.list().filter((notice) => notice.source === "processing"); assert.equal(items.length, 1); assert.equal(items[0].requestId, request.id); });
  await test("Remember-on-refresh changes preserve current session times; visit-only sessions stay active", () => {
    const original = accounts.sessionInfo(); service.savePreferences({ rememberSession: false }); assert.equal(tab.has("rtu.portal.session"), false); assert.equal(accounts.isSessionValid(staff.account), true); assert.equal(accounts.sessionInfo().signedInAt, original.signedInAt);
    clock = "2026-10-31T01:00:00.000Z"; service.savePreferences({ rememberSession: true }); assert.equal(accounts.sessionInfo().expiresAt, original.expiresAt);
  });
  await test("Ordinary preference saves do not extend absolute session expiration", () => { const expiry = accounts.sessionInfo().expiresAt; accounts.saveSession(staff.account); assert.equal(accounts.sessionInfo().expiresAt, expiry); });
  await test("Expired sessions block owned operations and remove their persisted marker", async () => {
    clock = "2026-10-31T09:00:00.000Z"; assert.equal(accounts.isSessionValid(staff.account), false); assert.throws(() => service.snapshot()); assert.equal(tab.has("rtu.portal.session"), false); await Promise.resolve(); assert.ok(invalidations.some((entry) => entry.reason === "expired"));
  });
  await signIn();
  await test("Wrong current passwords, reuse, empty and oversized new passwords are rejected", async () => {
    await assert.rejects(accounts.changePassword(employee, "wrong", "A valid new passphrase", "staff"));
    for (const password of [originalSecret, "", "short", "x".repeat(129)]) await assert.rejects(accounts.changePassword(employee, originalSecret, password, "staff"));
  });
  await test("A pending password change cannot persist after logout", async () => {
    const before = local.get(credentialKey); const pending = accounts.changePassword(employee, originalSecret, "Pending test password value", "staff"); accounts.clearSession(); staff = null; await assert.rejects(pending); assert.equal(local.get(credentialKey), before); await signIn();
  });
  await test("A new session for the same owner cannot revive an earlier pending credential update", async () => {
    const before = local.get(credentialKey); const account = staff.account; const pending = accounts.changePassword(employee, originalSecret, "Cancelled earlier session operation", "staff"); accounts.clearSession(); accounts.saveSession(account, { newLogin: true });
    await assert.rejects(pending); assert.equal(local.get(credentialKey), before); assert.equal(accounts.isSessionValid(account), true);
  });
  await test("Credential storage failures leave the old password valid and the current sign-in intact", async () => {
    const before = local.get(credentialKey); failWrites = true; await assert.rejects(accounts.changePassword(employee, originalSecret, "Unsaved test password value", "staff")); failWrites = false; assert.equal(local.get(credentialKey), before); assert.equal(accounts.isSessionValid(staff.account), true);
  });
  const newSecret = `  Café passphrase ${crypto.randomUUID()}  `;
  const peerMarker = tab.get("rtu.portal.session");
  await test("A successful password change uses a fresh salt/stronger PBKDF2 metadata without plaintext storage", async () => {
    await accounts.changePassword(employee, originalSecret, newSecret, "staff"); await Promise.resolve();
    const saved = JSON.parse(local.get(credentialKey))[employee]; assert.equal(saved.passwordIterations, 600000); assert.equal(saved.passwordSalt === initialSalt, false); assert.equal(local.get(credentialKey).includes(newSecret), false); assert.ok(saved.passwordChangedAt); assert.ok(saved.credentialVersion);
  });
  await test("Password changes invalidate this session and old revision markers; only the new exact passphrase authenticates", async () => {
    assert.equal(accounts.sessionInfo(), null); assert.equal(tab.has("rtu.portal.session"), false); tab.set("rtu.portal.session", peerMarker); assert.equal(accounts.restoreSession(), null);
    assert.equal(await accounts.authenticate(employee, originalSecret, "staff"), null); assert.ok(await accounts.authenticate(employee, newSecret, "staff")); assert.equal(await accounts.authenticate(employee, newSecret.trim(), "staff"), null); await signIn(newSecret);
  });
  await test("Legacy untimed markers do not revive credentials after a versioned password change", () => { accounts.clearSession(); tab.set("rtu.portal.session", `staff:${employee}`); assert.equal(accounts.restoreSession(), null); });
  await signIn(newSecret);
  await test("Credential replacement in another same-origin tab invalidates the cached session", async () => {
    const saved = JSON.parse(local.get(credentialKey)); const original = saved[employee].credentialVersion; saved[employee].credentialVersion = crypto.randomUUID(); local.set(credentialKey, JSON.stringify(saved));
    window.dispatchEvent(Object.assign(new Event("storage"), { key: credentialKey })); assert.equal(accounts.sessionInfo(), null); await Promise.resolve(); assert.ok(invalidations.some((entry) => entry.reason === "credentialsChanged")); saved[employee].credentialVersion = original; local.set(credentialKey, JSON.stringify(saved)); await signIn(newSecret);
  });
  await test("Credential corruption fails closed rather than falling back to the bundled staff hash", async () => { const original = local.get(credentialKey); local.set(credentialKey, "bad json"); await assert.rejects(accounts.authenticate(employee, newSecret, "staff")); local.set(credentialKey, original); });
  await test("Legacy long passwords still verify; new password policy does not retroactively lock them out", async () => {
    const original = local.get(credentialKey); const secret = crypto.randomUUID().repeat(5); const salt = crypto.randomBytes(16).toString("hex"); local.set(credentialKey, JSON.stringify({ [employee]: { passwordSalt: salt, passwordHash: crypto.pbkdf2Sync(secret, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex") } })); assert.ok(await accounts.authenticate(employee, secret, "staff")); local.set(credentialKey, original);
  });
  await test("Malformed or artificially extended timed markers are not restored", () => {
    const original = tab.get("rtu.portal.session"); const value = JSON.parse(original); value.expiresAt = "2099-01-01T00:00:00Z"; accounts.clearSession(); tab.set("rtu.portal.session", JSON.stringify(value)); assert.equal(accounts.restoreSession(), null); tab.set("rtu.portal.session", original); assert.ok(accounts.restoreSession());
  });
  await test("Staff role-specific module permissions remain delegated and cannot be changed by profile data", () => {
    const previous = window.PortalReportPolicy; window.PortalReportPolicy = { ...previous, accountCapabilities: { [employee]: [] } }; assert.equal(service.canAccess("staff-reports"), false); assert.equal(service.canAccess("staff-profile"), true); assert.equal(service.canAccess("dashboard"), false); window.PortalReportPolicy = previous;
  });
  await test("Students and signed-out callers cannot modify staff profiles or staff credentials", async () => {
    accounts.clearSession(); staff = null; assert.throws(() => service.snapshot()); await assert.rejects(accounts.changePassword(employee, newSecret, "Another valid passphrase", "staff"));
    const secret = crypto.randomUUID(); const user = await accounts.register({ fullName: "Test Student", accountNumber: "TEST-I-NEW", email: "phase-i@example.test", password: secret, college: "College of Information Technology", program: "BS Information Technology" }); student = user; accounts.saveSession(user, { newLogin: true }); assert.throws(() => service.saveProfile({ displayName: "Unauthorized" }, 0)); assert.throws(() => accounts.listStaff());
    const booking = window.PortalAppointmentService.getByRequest(request.id); assert.throws(() => window.PortalAppointmentService.confirmAppointment(booking.id, { role: "staff", accountNumber: employee, name: "Forged staff actor" }));
  });
  await test("Students cannot cancel another student's request with a forged actor argument", () => { const other = window.PortalRequestService.create({ student: { accountNumber: "OTHER-STUDENT", fullName: "Other Student" }, document: "Grade Slip", purpose: "Fixture" }); assert.throws(() => window.PortalRequestService.studentCancel(other.id, { role: "student", accountNumber: "OTHER-STUDENT" }, "Forged cancellation")); });
  await test("Student profile/settings session behavior stays supported and preferences remain role/account scoped", () => {
    const key = accounts.preferencesKey(student); local.set(key, JSON.stringify({ ownerRole: "student", darkMode: false })); assert.notEqual(key, preferenceKey); assert.equal(JSON.parse(local.get(preferenceKey)).darkMode, true); accounts.setSessionPersistence(false, student); assert.equal(accounts.isSessionValid(student), true);
  });
  await test("Public staff registration and employee-ID collisions are rejected", async () => {
    await assert.rejects(accounts.register({ role: "staff", fullName: "Forbidden", accountNumber: "NEW-STAFF", email: "new@example.test", password: crypto.randomUUID(), college: "College of Information Technology", program: "BS Information Technology" }));
    await assert.rejects(accounts.register({ fullName: "Collision", accountNumber: employee, email: "collision@example.test", password: crypto.randomUUID(), college: "College of Information Technology", program: "BS Information Technology" }));
    assert.notEqual(accounts.preferencesKey({ role: "student", accountNumber: employee }), accounts.preferencesKey({ role: "staff", accountNumber: employee }));
  });
  await test("Invalidation feedback contains no plaintext passwords or credential hashes", () => { const raw = JSON.stringify(invalidations); assert.equal(raw.includes(originalSecret), false); assert.equal(raw.includes(newSecret), false); assert.equal(raw.includes(initialCredential.passwordHash), false); });
  console.log(`\n${passed} Phase I isolated account/security scenarios passed. Browser-local checks are not production authentication, MFA or server session guarantees.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
