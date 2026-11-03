"use strict";

// Browser-local service regression tests. No dependencies, real accounts, or backend.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const saved = new Map();
let storageFails = false;
let staff = { account: { role: "staff", accountNumber: "TEST-STAFF", fullName: "Test Staff" } };
let student = null;
const actor = { role: "staff", accountNumber: "TEST-STAFF", name: "Test Staff" };
let checks = 0;
function test(label, callback) { callback(); checks++; console.log(`PASS ${label}`); }
function load() {
  const document = new EventTarget();
  const window = new EventTarget();
  window.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => { if (storageFails) throw new Error("Unavailable"); saved.set(key, value); },
  };
  window.PortalStaffContext = { current: () => staff };
  window.PortalProfile = { snapshot: () => ({ account: student }) };
  const context = vm.createContext({ window, document, CustomEvent, Date, console });
  for (const file of ["document-processing-config.js", "request-service.js", "appointment-service.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "js", file), "utf8"), context, { filename: file });
  }
  return window;
}
let window = load();
let service = window.PortalRequestService;
const S = service.STATUS;
function create(type = "Grade Slip", number = "TEST-STUDENT") {
  return service.create({ student: { accountNumber: number, fullName: "Test Student" }, document: type, purpose: "Test purpose", details: { copies: "2", academicYear: "2026–2027", appointmentDate: "2099-10-30", appointmentStart: "08:00", appointmentEnd: "09:00" } });
}
function configured() {
  window.PortalDocumentPolicy = {
    version: "test-policy-v1",
    services: Object.fromEntries(service.SERVICES.map((type) => [type, { configured: true, items: [{ id: "prepared", label: "Test preparation check", required: true }] }])),
    verification: { configured: true, methods: [{ id: "test", label: "Test verification method" }], allowRepresentative: false, releaseChecks: [{ id: "review", label: "Test release check" }] },
    exportAllowed: false,
  };
}
const request = create();
test("Pending requests cannot enter Processing", () => assert.throws(() => service.updateStatus(request.id, S.PROCESSING, actor)));
test("Signed-out and student actors cannot approve or process", () => {
  staff = null;
  assert.throws(() => service.updateStatus(request.id, S.APPROVED, actor));
  assert.throws(() => service.updateStatus(request.id, S.APPROVED, { role: "student", name: "Test Student" }));
  staff = { account: { role: "staff", accountNumber: actor.accountNumber } };
});
test("Approval and Processing share one request and append status history", () => {
  service.updateStatus(request.id, S.APPROVED, actor);
  service.updateStatus(request.id, S.PROCESSING, actor, { remarks: "INTERNAL MUST NOT LEAK" });
  const updated = service.get(request.id);
  assert.equal(updated.status, S.PROCESSING);
  assert.equal(updated.history.length, 3);
  assert.equal(updated.assignedStaff, actor.name);
  assert.ok(updated.processingStartedAt);
  assert.equal(updated.staffRemarks, "");
});
test("Repeated Start Processing is rejected without duplicate history", () => {
  assert.throws(() => service.updateStatus(request.id, S.PROCESSING, actor));
  assert.equal(service.get(request.id).history.length, 3);
});
test("Default development checklist is usable and requires every required item", () => {
  const policy = window.PortalDocumentPolicy;
  const preparation = policy.services[request.documentType];
  assert.equal(preparation.developmentOnly, true);
  assert.equal(service.preparationComplete(service.get(request.id)), false);
  for (const item of preparation.items) service.savePreparationCheck(request.id, item.id, true, actor);
  assert.equal(service.preparationComplete(service.get(request.id)), true);
  service.savePreparationCheck(request.id, preparation.items[0].id, false, actor);
  assert.equal(service.preparationComplete(service.get(request.id)), false);
});
test("Unconfigured preparation blocks readiness and checklist edits", () => {
  const current = window.PortalDocumentPolicy;
  window.PortalDocumentPolicy = { ...current, services: Object.fromEntries(Object.entries(current.services).map(([type, policy]) => [type, { ...policy, configured: false }])) };
  assert.throws(() => service.updateStatus(request.id, S.READY, actor));
  assert.throws(() => service.savePreparationCheck(request.id, "prepared", true, actor));
});
configured();
test("Required preparation checks enforced; unknown checks rejected", () => {
  assert.throws(() => service.updateStatus(request.id, S.READY, actor));
  assert.throws(() => service.savePreparationCheck(request.id, "unknown", true, actor));
});
test("Checklist saves author, timestamp, policy version; repeated checks are idempotent", () => {
  service.savePreparationCheck(request.id, "prepared", true, actor);
  const before = service.get(request.id);
  service.savePreparationCheck(request.id, "prepared", true, actor);
  assert.equal(service.get(request.id).processing.events.length, before.processing.events.length);
  assert.equal(before.processing.checks.prepared.staffId, actor.accountNumber);
  assert.ok(before.processing.checks.prepared.timestamp);
});
test("Internal notes append and validate", () => {
  service.addProcessingNote(request.id, "PRIVATE <script>test</script>", actor);
  service.addProcessingNote(request.id, "Second internal note", actor);
  assert.equal(service.get(request.id).processing.notes.length, 2);
  assert.throws(() => service.addProcessingNote(request.id, " ", actor));
  assert.throws(() => service.addProcessingNote(request.id, "x".repeat(1001), actor));
});
test("Student projection omits notes and verification and restricts ownership", () => {
  staff = null; student = { role: "student", accountNumber: "TEST-STUDENT" };
  assert.equal(service.getForStudent(request.id, student.accountNumber).processing, undefined);
  assert.equal(service.listForStudent("OTHER-STUDENT").length, 0);
  assert.equal(service.getForStudent(request.id, "OTHER-STUDENT"), null);
  assert.throws(() => service.addProcessingNote(request.id, "Unauthorized", actor));
  student = null; staff = { account: { role: "staff", accountNumber: actor.accountNumber } };
});
test("Checklist completion survives refresh", () => {
  window = load(); service = window.PortalRequestService; configured();
  assert.ok(service.preparationComplete(service.get(request.id)));
  assert.equal(service.get(request.id).processing.notes.length, 2);
});
test("Ready for Pickup updates shared totals, timestamp and in-app notice", () => {
  service.updateStatus(request.id, S.READY, actor);
  const updated = service.get(request.id);
  assert.ok(updated.readyAt);
  assert.equal(service.summary().ready, 1);
  assert.ok(updated.notifications.some((notice) => notice.message.includes("ready for pickup")));
});
test("Readiness locks preparation checks", () => assert.throws(() => service.savePreparationCheck(request.id, "prepared", false, actor)));
test("Unconfigured identity policy blocks verification on Ready requests", () => {
  window.PortalDocumentPolicy.verification.configured = false;
  assert.throws(() => service.verifyRecipient(request.id, { recipientType: "Requesting Student", methodId: "test", confirmed: true, requirements: ["review"] }, actor));
  window.PortalDocumentPolicy.verification.configured = true;
});
test("Old Phase B verification checkbox cannot bypass release safeguards", () => assert.throws(() => service.updateStatus(request.id, S.RELEASED, actor, { verification: true, handoverConfirmed: true })));
const verification = { recipientType: "Requesting Student", methodId: "test", confirmed: true, requirements: ["review"] };
test("Verification requires configured method, confirmation, release checks and permitted recipient", () => {
  assert.throws(() => service.verifyRecipient(request.id, { ...verification, methodId: "unknown" }, actor));
  assert.throws(() => service.verifyRecipient(request.id, { ...verification, confirmed: false }, actor));
  assert.throws(() => service.verifyRecipient(request.id, { ...verification, requirements: [] }, actor));
  assert.throws(() => service.verifyRecipient(request.id, { ...verification, recipientType: "Authorized Representative", recipientName: "Other" }, actor));
});
test("Recipient verification records immutable reference and audit event", () => {
  service.verifyRecipient(request.id, verification, actor);
  const updated = service.get(request.id);
  assert.equal(updated.recipientVerification.recipientName, updated.studentName);
  assert.ok(updated.recipientVerification.reference);
  assert.throws(() => service.verifyRecipient(request.id, verification, actor));
});
test("Explicit actual handover required even after verification", () => assert.throws(() => service.updateStatus(request.id, S.RELEASED, actor, { verification: true })));
test("Policy version changes invalidate verification and preserve earlier snapshots", () => {
  const previous = service.get(request.id).recipientVerification.reference;
  window.PortalDocumentPolicy.version = "test-policy-v2";
  assert.equal(service.verificationComplete(service.get(request.id)), false);
  assert.throws(() => service.updateStatus(request.id, S.RELEASED, actor, { handoverConfirmed: true }));
  service.verifyRecipient(request.id, verification, actor);
  assert.equal(service.get(request.id).recipientVerifications.length, 2);
  assert.equal(service.get(request.id).recipientVerifications[0].reference, previous);
});
const appointment = window.PortalAppointmentService.getByRequest(request.id);
test("Release records recipient, staff, copies, verification reference and handover", () => {
  service.updateStatus(request.id, S.RELEASED, actor, { handoverConfirmed: true });
  const updated = service.get(request.id);
  assert.equal(updated.release.reference, `REL-${request.id}`);
  assert.equal(updated.release.verificationReference, updated.recipientVerification.reference);
  assert.equal(updated.release.copies, "2");
  assert.equal(updated.release.handoverConfirmed, true);
  assert.equal(service.summary().ready, 0);
  assert.equal(service.summary().released, 1);
});
test("Duplicate release and post-release mutations are rejected", () => {
  assert.throws(() => service.updateStatus(request.id, S.RELEASED, actor, { handoverConfirmed: true }));
  assert.throws(() => service.addProcessingNote(request.id, "Rewrite", actor));
  assert.throws(() => service.verifyRecipient(request.id, verification, actor));
  assert.equal(service.get(request.id).history.filter((event) => event.newStatus === S.RELEASED).length, 1);
});
test("Release leaves related appointment lifecycle unchanged", () => assert.equal(window.PortalAppointmentService.getByRequest(request.id).status, appointment.status));
test("Student release projection includes reference but omits recipient details", () => {
  staff = null; student = { role: "student", accountNumber: "TEST-STUDENT" };
  const visible = service.getForStudent(request.id, student.accountNumber);
  assert.ok(visible.release.reference);
  assert.equal(visible.recipientVerification, undefined);
  assert.equal(visible.release.recipientName, undefined);
  assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
  student = null; staff = { account: { role: "staff", accountNumber: actor.accountNumber } };
});
test("Rejected, Cancelled and Needs Correction cannot enter Processing", () => {
  for (const target of [S.REJECTED, S.CANCELLED, S.CORRECTION]) {
    const pending = create(); service.updateStatus(pending.id, target, actor, { reason: "Test decision" });
    assert.throws(() => service.updateStatus(pending.id, S.PROCESSING, actor));
    assert.equal(service.get(pending.id).status, target);
  }
});
test("All five existing service types preserve request submission workflows", () => {
  for (const type of service.SERVICES) {
    const pending = create(type); assert.equal(pending.documentType, type); assert.equal(pending.status, S.PENDING);
  }
});
test("Appointment completion and cancellation never release or cancel requests", () => {
  const pending = create(); const booking = window.PortalAppointmentService.getByRequest(pending.id);
  window.PortalAppointmentService.confirmAppointment(booking.id, actor);
  window.PortalAppointmentService.checkIn(booking.id, actor);
  window.PortalAppointmentService.completeAppointment(booking.id, actor);
  assert.equal(service.get(pending.id).status, S.PENDING);
  const other = create(); const otherBooking = window.PortalAppointmentService.getByRequest(other.id);
  window.PortalAppointmentService.cancelAppointment(otherBooking.id, actor, "Test cancellation");
  assert.equal(service.get(other.id).status, S.PENDING);
});
test("Release and audit history survive refresh", () => {
  window = load(); service = window.PortalRequestService;
  assert.equal(service.get(request.id).release.reference, `REL-${request.id}`);
  assert.equal(service.get(request.id).processing.notes.length, 2);
});
test("Storage failure is reported as memory-only rather than successful persistence", () => {
  const pending = create(); service.updateStatus(pending.id, S.APPROVED, actor);
  storageFails = true;
  const result = service.updateStatus(pending.id, S.PROCESSING, actor);
  assert.equal(result.persisted, false);
  assert.equal(service.get(pending.id).status, S.PROCESSING);
  storageFails = false;
});
console.log(`\n${checks} browser-local service scenarios passed. Production server authorization and concurrent transactions are not tested by this suite.`);
