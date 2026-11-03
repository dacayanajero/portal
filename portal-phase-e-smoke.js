"use strict";

// Dependency-free tests of the browser-local records projection. Fixtures exist only here.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const store = new Map();
let current = { account: { role: "staff", accountNumber: "TEST-STAFF" } };
const actor = { role: "staff", accountNumber: "TEST-STAFF", name: "Test Staff" };
let passed = 0;
function test(name, callback) { callback(); passed++; console.log(`PASS ${name}`); }
const window = new EventTarget();
window.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
window.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
window.PortalStaffContext = { current: () => current };
const context = vm.createContext({ window, document: new EventTarget(), CustomEvent, Date, console });
for (const file of ["accounts.js", "document-processing-config.js", "request-service.js", "appointment-service.js", "student-record-service.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "js", file), "utf8"), context, { filename: file });
}
const records = window.PortalStudentRecordService;
const requests = window.PortalRequestService;
const appointments = window.PortalAppointmentService;
const S = requests.STATUS;
test("Empty authorized account source shows zero students, not seeded sample identities", () => {
  const result = records.search(); assert.equal(result.total, 0); assert.equal(result.summary.total, 0);
  assert.equal(result.summary.active, 0); assert.equal(result.summary.upcoming, 0); assert.equal(result.summary.released, 0);
});
const accounts = Array.from({ length: 13 }, (_, index) => ({ role: "student", accountNumber: `TEST-${String(index + 1).padStart(3, "0")}`, fullName: index < 2 ? "Same Name" : `Student ${index + 1}`, email: `student${index}@example.test`, passwordSalt: "0".repeat(32), passwordHash: "0".repeat(64) }));
store.set("rtu.portal.accounts", JSON.stringify(accounts));
store.set("rtu.portal.profile.TEST-001", JSON.stringify({ updatedAt: Date.now(), profile: { fullName: "Alex Reyes", email: "alex@example.test", program: "BS Information Technology", yearLevel: "3rd Year", semester: "1st Semester", phoneNumber: "PRIVATE-PHONE", address: "PRIVATE-ADDRESS" } }));
store.set("rtu.portal.profile.TEST-002", JSON.stringify({ updatedAt: Date.now(), profile: { program: "BS Business Administration", yearLevel: "2nd Year", semester: "2nd Semester" } }));
test("Only registered accounts are listed, without password or unrelated contact fields", () => {
  const result = records.search(); assert.equal(result.total, 13);
  assert.doesNotMatch(JSON.stringify(result), /password|PRIVATE-PHONE|PRIVATE-ADDRESS|2023-103319/);
});
test("Directory merges actual saved profile values with provenance", () => {
  const student = records.get("TEST-001").student;
  assert.equal(student.fullName, "Alex Reyes"); assert.equal(student.program, "BS Information Technology");
  assert.equal(student.provenance.fullName, "Self-reported saved profile");
});
test("Case and extra whitespace are ignored in number, name and program search", () => {
  assert.equal(records.search({ query: "  test-001  " }).total, 1);
  assert.equal(records.search({ query: "  ALEX    reyes " }).total, 1);
  assert.equal(records.search({ query: "  bs    information technology " }).total, 1);
});
test("Combined program, year and semester filters and no-match states", () => {
  assert.equal(records.search({ program: "bs information technology", yearLevel: "3rd Year", semester: "1st Semester" }).total, 1);
  assert.equal(records.search({ program: "BS Information Technology", yearLevel: "2nd Year" }).total, 0);
});
test("Pagination clamps invalid pages and sorting uses stable identifiers", () => {
  assert.equal(records.search({ sort: "number" }).students[0].studentNumber, "TEST-001");
  assert.equal(records.search({ page: 2 }).students.length, 3);
  assert.equal(records.search({ page: 999 }).page, 2);
  assert.equal(records.search({ query: "Alex", page: 2 }).page, 1);
});
test("Same names never merge students; duplicate identifiers are deduplicated", () => {
  store.set("rtu.portal.accounts", JSON.stringify([...accounts, accounts[0]]));
  assert.equal(records.search().total, 13);
  assert.ok(records.get("TEST-002")); assert.ok(records.get("TEST-001"));
  store.set("rtu.portal.accounts", JSON.stringify(accounts));
});
test("Missing profiles are safe and never imply official enrollment", () => {
  const student = records.get("TEST-003").student;
  assert.equal(student.program, ""); assert.equal(student.completeness, "Additional Information Needed");
  assert.equal(student.enrollment, "Official enrollment verification is not connected.");
  assert.equal(records.get("NOT-IN-SOURCE"), null);
});
test("Malformed saved profiles fall back without creating verified information", () => {
  store.set("rtu.portal.profile.TEST-004", "invalid json");
  const student = records.get("TEST-004").student;
  assert.equal(student.profileUnavailable, true); assert.equal(student.fullName, "Student 4");
});
function create(number, type = "Grade Slip", date = "2099-11-01") {
  return requests.create({ student: { accountNumber: number, fullName: "Submitted Name" }, document: type, purpose: "Test purpose", details: { copies: "2", appointmentDate: date, appointmentStart: "08:00", appointmentEnd: "09:00" } });
}
const first = create("TEST-001"); const second = create("TEST-001", "Registration Form");
const other = create("TEST-002", "ID Printing", "2001-01-01");
requests.updateStatus(other.id, S.CANCELLED, actor, { reason: "Test cancellation" });
test("Request and appointment histories match exact student identifier only", () => {
  const record = records.get("TEST-001");
  assert.equal(record.requests.length, 2); assert.equal(record.appointments.length, 2);
  assert.ok(record.requests.every((entry) => entry.id !== other.id));
  assert.equal(records.get("TEST-002").requests.length, 1);
});
test("Active/upcoming overview counts unique known students, not requests", () => {
  const summary = records.search().summary;
  assert.equal(summary.active, 1); assert.equal(summary.upcoming, 1);
  assert.equal(records.search({ query: "Alex" }).students[0].activeRequests, 2);
});
const booking = appointments.getByRequest(first.id);
appointments.confirmAppointment(booking.id, actor);
appointments.rescheduleAppointment(booking.id, actor, "2099-11-02", "10:00", "11:00", "Test reschedule");
test("Rescheduling history is shared and does not change request status", () => {
  assert.ok(records.get("TEST-001").appointments.some((entry) => entry.history.some((event) => /reschedul/i.test(event.action))));
  assert.equal(requests.get(first.id).status, S.PENDING);
});
test("Missing appointment audit timestamps remain unavailable rather than being invented as current activity", () => {
  const key = "rtu.portal.appointments.v1"; const original = store.get(key); const raw = JSON.parse(original); const target = raw.find((record) => record.id === booking.id);
  target.rescheduleHistory.push({ from: { date: "2099-11-02" }, to: { date: "2099-11-03" } }); target.history.push({ action: "Imported event without timestamp", actorRole: "staff" }); store.set(key, JSON.stringify(raw));
  const normalized = appointments.get(booking.id); assert.equal(normalized.rescheduleHistory.at(-1).timestamp, ""); assert.equal(normalized.history.at(-1).timestamp, "");
  assert.ok(!records.get("TEST-001").timeline.some((event) => event.action === "Imported event without timestamp")); store.set(key, original);
});
test("Cancelled appointments remain in history but not future-active counts", () => {
  appointments.cancelAppointment(appointments.getByRequest(second.id).id, actor, "Test cancellation");
  appointments.cancelAppointment(booking.id, actor, "Test cancellation");
  assert.equal(records.get("TEST-001").appointments.length, 2);
  assert.equal(records.search().summary.upcoming, 0);
});
window.PortalDocumentPolicy = {
  version: "test-records-policy", services: { "Grade Slip": { configured: true, items: [{ id: "prepared", label: "Test prepared", required: true }] } },
  verification: { configured: true, methods: [{ id: "test", label: "PRIVATE-VERIFICATION-METHOD" }], allowRepresentative: false, releaseChecks: [] },
};
requests.updateStatus(first.id, S.APPROVED, actor);
requests.updateStatus(first.id, S.PROCESSING, actor);
requests.addProcessingNote(first.id, "PRIVATE-INTERNAL-NOTE", actor);
requests.savePreparationCheck(first.id, "prepared", true, actor);
requests.updateStatus(first.id, S.READY, actor);
requests.verifyRecipient(first.id, { recipientType: "Requesting Student", methodId: "test", confirmed: true }, actor);
requests.updateStatus(first.id, S.RELEASED, actor, { handoverConfirmed: true });
test("Release history reuses Phase D snapshot without verification credentials or internal notes", () => {
  const record = records.get("TEST-001");
  assert.equal(record.releases.length, 1); assert.equal(record.releases[0].reference, `REL-${first.id}`);
  assert.equal(record.releases[0].recipientType, "Requesting Student");
  assert.equal(records.get("TEST-002").releases.length, 0);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE-|recipientName|verificationReference/);
});
test("Released students and current active students update from shared data", () => {
  assert.equal(records.search().summary.released, 1);
  assert.equal(records.search().summary.active, 1);
  assert.equal(records.search({ query: "Alex" }).students[0].activeRequests, 1);
});
test("Timeline projects only actual history, with no fabricated profile-created event", () => {
  const record = records.get("TEST-001");
  assert.equal(record.timeline.length, record.requests.reduce((sum, item) => sum + item.history.length, 0) + record.appointments.reduce((sum, item) => sum + item.history.length, 0));
  assert.equal(new Set(record.timeline.map((entry) => entry.id)).size, record.timeline.length);
  assert.ok(record.timeline.every((entry, index, list) => !index || new Date(list[index - 1].timestamp) >= new Date(entry.timestamp)));
  assert.ok(!record.timeline.some((entry) => /profile created|recipient verified|internal note/i.test(entry.action)));
});
test("Profile updates preserve historical request and release snapshots", () => {
  const stored = JSON.parse(store.get("rtu.portal.profile.TEST-001")); stored.profile.fullName = "Updated Profile Name";
  store.set("rtu.portal.profile.TEST-001", JSON.stringify(stored));
  assert.equal(records.get("TEST-001").student.fullName, "Updated Profile Name");
  assert.equal(requests.get(first.id).studentName, "Submitted Name");
  assert.equal(requests.get(first.id).release.studentName, "Submitted Name");
});
test("Read-only service does not mutate account, profile or lifecycle data", () => {
  const before = JSON.stringify([...store]); records.search(); records.get("TEST-001");
  assert.equal(JSON.stringify([...store]), before);
  assert.deepEqual(Object.keys(records).sort(), ["get", "reportingAttributes", "search"]);
  assert.doesNotMatch(JSON.stringify(records.reportingAttributes()), /fullName|email|password|phone|address/);
});
test("Signed-out and student callers cannot query directory or individual records", () => {
  current = null; assert.throws(() => records.search()); assert.throws(() => records.get("TEST-001")); assert.throws(() => window.PortalAccounts.listRegisteredStudents());
  current = { account: { role: "student", accountNumber: "TEST-001" } };
  assert.throws(() => records.search()); assert.throws(() => records.get("TEST-002"));
  current = { account: { role: "staff", accountNumber: "TEST-STAFF" } };
});
test("Unavailable account data reports failure rather than a misleading zero", () => {
  store.set("rtu.portal.accounts", "bad json"); assert.throws(() => records.search());
});
console.log(`\n${passed} Phase E browser-local service scenarios passed. Server security and cross-device authorization require a backend.`);
