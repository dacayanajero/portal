"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const store = new Map();
let clock = "2026-11-01T00:00:00.000Z";
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return new Date(clock).getTime(); } }
let current = { account: { role: "staff", accountNumber: "2020-123456", fullName: "Test Publisher" } };
let student = null;
let failWrite = false;
let passed = 0;
const window = new EventTarget();
window.crypto = { randomUUID };
window.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { if (failWrite) throw new Error("Storage unavailable"); store.set(key, value); } };
window.PortalStaffContext = { current: () => current };
window.PortalProfile = { snapshot: () => ({ account: student }) };
const context = vm.createContext({ window, document: new EventTarget(), Event, Date: Clock, console });
for (const file of ["announcement-config.js", "announcement-service.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "js", file), "utf8"), context, { filename: file });
const service = window.PortalAnnouncementService;
const S = service.STATUS;
function test(name, callback) { callback(); passed++; console.log(`PASS ${name}`); }
function input(overrides = {}) { return { title: "Test announcement", content: "Paragraph one.\n\nParagraph two.", category: "Academic Services", audience: "All Students", priority: "Normal", scheduledAt: "", expiresAt: "", ...overrides }; }
function asPublisher() { current = { account: { role: "staff", accountNumber: "2020-123456", fullName: "Test Publisher" } }; student = null; }
function asStudent(number = "TEST-STUDENT") { current = null; student = { role: "student", accountNumber: number }; }
test("New source has zero announcements and no fabricated university notices", () => { assert.equal(service.list().length, 0); assert.equal(service.summary().total, 0); });
test("Signed-out and student callers cannot manage announcements", () => {
  current = null; assert.throws(() => service.list()); assert.throws(() => service.save(input()));
  student = { role: "student", accountNumber: "TEST" }; assert.throws(() => service.get("x")); assert.throws(() => service.transition("x", 1, "archive", { confirmed: true })); asPublisher();
});
test("Default staff can create and edit own drafts but cannot publish", () => {
  current = { account: { role: "staff", accountNumber: "TEST-EDITOR", fullName: "Test Editor" } };
  const draft = service.save(input()); assert.equal(draft.status, S.DRAFT);
  assert.equal(service.save(input({ title: "Edited own draft" }), { id: draft.id, revision: draft.revision }).title, "Edited own draft");
  assert.throws(() => service.save(input(), { action: "publish", confirmed: true }));
  current = { account: { role: "staff", accountNumber: "OTHER-EDITOR", fullName: "Other Editor" } };
  assert.throws(() => service.save(input(), { id: draft.id, revision: 2 })); asPublisher();
});
test("Required fields, lengths, category and priority are validated", () => {
  for (const changes of [{ title: " " }, { content: "" }, { category: "" }, { audience: "" }, { title: "x".repeat(121) }, { content: "x".repeat(10001) }, { category: "Unknown" }, { priority: "Automatic urgent" }]) assert.throws(() => service.save(input(changes)));
});
test("Unsupported audience targeting is rejected even through the service", () => assert.throws(() => service.save(input({ audience: "Selected Programs" }), { action: "publish", confirmed: true })));
test("Draft save is idempotent for the same creation token", () => {
  const before = service.list().length; const token = randomUUID();
  const a = service.save(input(), { token }); const b = service.save(input(), { token });
  assert.equal(a.id, b.id); assert.equal(service.list().length, before + 1);
});
test("Draft content and line breaks persist without public visibility", () => {
  const draft = service.save(input()); assert.match(service.get(draft.id).content, /\n\n/);
  asStudent(); assert.equal(service.publicFeed().length, 0); assert.equal(service.publicGet(draft.id), null); asPublisher();
});
test("Publishing requires an explicit confirmation", () => assert.throws(() => service.save(input(), { action: "publish" })));
let published = service.save(input({ title: "Published test", content: "<script>alert('x')</script>\njavascript:alert(1)" }), { action: "publish", confirmed: true });
test("Publication records publisher, immutable content version and actual history", () => {
  assert.equal(published.status, S.PUBLISHED); assert.equal(published.versions.length, 1); assert.equal(published.published.publisherId, "2020-123456");
  assert.ok(published.history.some((event) => event.action === "Published")); assert.equal(service.summary().published, 1);
});
test("Student feed exposes only published snapshots without internal history or tokens", () => {
  asStudent(); const visible = service.publicGet(published.id); assert.equal(visible.title, "Published test");
  assert.equal(visible.history, undefined); assert.equal(visible.creationToken, undefined); assert.equal(visible.publisherId, undefined); asPublisher();
});
test("Revisions preserve the original version and publication timestamp", () => {
  const originalTime = published.publishedAt;
  clock = "2026-11-01T00:01:00.000Z";
  published = service.save(input({ title: "Revised published test" }), { id: published.id, revision: published.revision, action: "publish", confirmed: true });
  assert.equal(published.versions.length, 2); assert.equal(published.versions[0].title, "Published test"); assert.equal(published.publishedAt, originalTime);
  assert.equal(published.notifications.length, 1);
});
test("No-op republication, stale edits, and silent published-draft overwrite are rejected", () => {
  assert.throws(() => service.save(input({ title: "Revised published test" }), { id: published.id, revision: published.revision, action: "publish", confirmed: true }));
  assert.throws(() => service.save(input({ title: "Changed" }), { id: published.id, revision: published.revision - 1, action: "publish", confirmed: true }));
  assert.throws(() => service.save(input(), { id: published.id, revision: published.revision }));
});
test("One announcement notification survives refresh/revision without duplicate records", () => {
  asStudent(); assert.equal(service.notifications().length, 1); assert.equal(service.notifications().length, 1);
  assert.equal(service.notifications()[0].unread, true); service.markRead(published.id); assert.equal(service.notifications()[0].unread, false);
  asStudent("OTHER-STUDENT"); assert.equal(service.notifications()[0].unread, true); asPublisher();
});
test("Date conversion uses Manila time and rejects invalid calendar dates", () => {
  assert.equal(service.fromManila("2026-11-01T09:30"), "2026-11-01T01:30:00.000Z");
  assert.equal(service.toManila("2026-11-01T01:30:00Z"), "2026-11-01T09:30");
  assert.throws(() => service.fromManila("2026-02-30T09:00")); assert.throws(() => service.validate(input({ scheduledAt: "2026-11-01T09:00" })));
});
test("Past schedules and invalid expiration ordering are rejected", () => {
  assert.throws(() => service.save(input({ scheduledAt: "2026-10-01T00:00:00Z" }), { action: "schedule", confirmed: true }));
  assert.throws(() => service.save(input({ scheduledAt: "2026-11-02T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z" }), { action: "schedule", confirmed: true }));
  assert.throws(() => service.save(input({ expiresAt: "2026-10-01T00:00:00Z" }), { action: "publish", confirmed: true }));
});
let scheduled = service.save(input({ title: "Scheduled test", scheduledAt: "2026-11-02T00:00:00Z" }), { action: "schedule", confirmed: true });
test("Scheduled content stays hidden and cannot be published prematurely", () => {
  assert.equal(service.summary().scheduled, 1);
  assert.throws(() => service.save(input({ title: scheduled.title }), { id: scheduled.id, revision: scheduled.revision, action: "publish", confirmed: true }));
  asStudent(); assert.equal(service.publicGet(scheduled.id), null); asPublisher();
});
test("Schedules can be edited with version checks; archived cancellation is separate", () => {
  scheduled = service.save(input({ title: scheduled.title, scheduledAt: "2026-11-03T00:00:00Z" }), { id: scheduled.id, revision: scheduled.revision, action: "schedule", confirmed: true });
  assert.throws(() => service.transition(scheduled.id, scheduled.revision, "archive", { confirmed: true }));
  const cancelled = service.transition(scheduled.id, scheduled.revision, "cancelSchedule", { confirmed: true });
  assert.equal(cancelled.status, S.DRAFT); assert.equal(cancelled.scheduledAt, "");
});
let due = service.save(input({ title: "Due test", scheduledAt: "2026-11-02T00:00:00Z" }), { action: "schedule", confirmed: true });
test("Passing publication time never automatically publishes browser-local schedules", () => {
  clock = "2026-11-02T00:01:00.000Z";
  assert.equal(service.get(due.id).status, S.SCHEDULED); assert.equal(service.summary().scheduled, 0); assert.equal(service.summary().due, 1);
  asStudent(); assert.equal(service.publicGet(due.id), null); asPublisher();
});
test("An authorized publisher may explicitly publish a due schedule", () => {
  due = service.save(input({ title: due.title }), { id: due.id, revision: due.revision, action: "publish", confirmed: true });
  asStudent(); assert.ok(service.publicGet(due.id)); asPublisher();
});
test("Expired publications are excluded from feed, notifications and current published total", () => {
  const expiring = service.save(input({ title: "Expiring", expiresAt: "2026-11-02T00:02:00Z" }), { action: "publish", confirmed: true });
  clock = "2026-11-02T00:03:00.000Z"; asStudent(); assert.equal(service.publicGet(expiring.id), null); assert.ok(!service.notifications().some((notice) => notice.announcementId === expiring.id)); asPublisher();
});
test("Archiving preserves versions/history and removes active visibility", () => {
  published = service.transition(published.id, published.revision, "archive", { confirmed: true });
  assert.equal(published.status, S.ARCHIVED); assert.equal(published.versions.length, 2); assert.ok(published.archivedAt);
  assert.throws(() => service.transition(published.id, published.revision, "archive", { confirmed: true }));
  assert.throws(() => service.save(input(), { id: published.id, revision: published.revision }));
  asStudent(); assert.equal(service.publicGet(published.id), null); asPublisher();
});
test("Storage failure does not claim publication or persist an audit/version", () => {
  const before = store.get(service.STORAGE_KEY); failWrite = true;
  assert.throws(() => service.save(input(), { action: "publish", confirmed: true })); failWrite = false;
  assert.equal(store.get(service.STORAGE_KEY), before);
});
const basePolicy = window.PortalAnnouncementPolicy;
window.PortalAnnouncementPolicy = { ...basePolicy, approvalRequired: true, separateApprover: true };
let approvalDraft = service.save(input({ title: "Approval test" }));
test("Configured approval cannot be bypassed by direct publication", () => assert.throws(() => service.save(input({ title: "Approval test" }), { id: approvalDraft.id, revision: approvalDraft.revision, action: "publish", confirmed: true })));
approvalDraft = service.transition(approvalDraft.id, approvalDraft.revision, "submit", { confirmed: true });
test("Configured separate review prevents author self-approval", () => assert.throws(() => service.transition(approvalDraft.id, approvalDraft.revision, "approve", { confirmed: true })));
window.PortalAnnouncementPolicy = { ...window.PortalAnnouncementPolicy, accountCapabilities: { ...basePolicy.accountCapabilities, REVIEWER: ["view", "review", "approve", "publish", "editAny"] } };
current = { account: { role: "staff", accountNumber: "REVIEWER", fullName: "Test Reviewer" } };
approvalDraft = service.transition(approvalDraft.id, approvalDraft.revision, "approve", { confirmed: true });
test("Approval binds the content version; changing approved text requires reapproval", () => assert.throws(() => service.save(input({ title: "Changed after approval" }), { id: approvalDraft.id, revision: approvalDraft.revision, action: "publish", confirmed: true })));
test("Unchanged approved content can be published by an authorized publisher", () => {
  approvalDraft = service.save(input({ title: "Approval test" }), { id: approvalDraft.id, revision: approvalDraft.revision, action: "publish", confirmed: true });
  assert.equal(approvalDraft.status, S.PUBLISHED);
});
window.PortalAnnouncementPolicy = basePolicy; asPublisher();
test("Legacy saved notices migrate into drafts without inventing publication records", () => {
  store.set(service.STORAGE_KEY, JSON.stringify([{ id: "legacy", title: "Existing saved notice", message: "Existing saved content", audience: "Staff", author: "Existing Author", createdAt: "2026-01-01T00:00:00Z" }]));
  const record = service.list()[0]; assert.equal(record.status, S.DRAFT); assert.equal(record.content, "Existing saved content"); assert.equal(record.audience, "");
  assert.equal(record.versions.length, 0); assert.equal(record.legacy.audience, "Staff"); assert.equal(service.list()[0].history.length, 1);
});
test("Invalid and duplicate source data fail closed rather than exposing or double counting notices", () => {
  const record = service.list()[0]; store.set(service.STORAGE_KEY, JSON.stringify([record, record])); assert.throws(() => service.list());
  store.set(service.STORAGE_KEY, "invalid json"); assert.throws(() => service.list());
});
console.log(`\n${passed} Phase F browser-local service scenarios passed. Server authorization, atomic cross-client publication and reliable background scheduling require a backend.`);
