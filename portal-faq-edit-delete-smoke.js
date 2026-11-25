"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { randomUUID } = require("node:crypto");

function fixture() {
  const storage = new Map(); let staff = "STAFF-A"; let failWrites = false;
  const window = new EventTarget();
  Object.assign(window, {
    crypto: { randomUUID },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem(key, value) { if (failWrites) throw Error("Unavailable"); storage.set(key, value); } },
    PortalSupportPolicy: { bundledGuideEnabled: false, categories: ["General"] },
    PortalRequestService: { SERVICES: [] },
    PortalProfile: { snapshot: () => ({ account: { role: staff ? "staff" : "student" } }) },
    PortalStaffContext: { current: () => staff ? { account: { role: "staff", accountNumber: staff, fullName: staff } } : null },
    PortalSupportService: { capabilities: () => staff ? ["faqView", "faqCreate", "faqEditOwn", "faqPublish"] : [] },
  });
  runInNewContext(readFileSync(join(__dirname, "js/faq-service.js"), "utf8"), { window, document: new EventTarget(), Event });
  return { faq: window.PortalFAQService, as: (value) => { staff = value; }, fail: (value) => { failWrites = value; } };
}
const answer = { question: "How can I get FAQ guidance?", answer: "Original answer", category: "General", keywords: ["faq guidance"] };

test("Staff can edit their answer and delete it with current revision and confirmation", () => {
  const { faq } = fixture(); let record = faq.save(answer);
  record = faq.save({ ...record, answer: "Edited answer" }, { id: record.id, revision: record.revision });
  assert.equal(faq.get(record.id).answer, "Edited answer");
  assert.throws(() => faq.remove(record.id, record.revision, false));
  assert.throws(() => faq.remove(record.id, record.revision - 1, true));
  assert.ok(faq.get(record.id)); faq.remove(record.id, record.revision, true);
  assert.equal(faq.get(record.id), null);
});

test("Staff can manage FAQ answers from another author; students cannot", () => {
  const { faq, as } = fixture(); let record = faq.save(answer);
  as("STAFF-B"); assert.equal(faq.editable(record), true); assert.equal(faq.deletable(record), true);
  record = faq.save({ ...record, answer: "Staff revision" }, { id: record.id, revision: record.revision });
  as(null);
  assert.throws(() => faq.save({ ...record, answer: "Unauthorized" }, { id: record.id, revision: record.revision }));
  assert.throws(() => faq.remove(record.id, record.revision, true));
  as("STAFF-B"); assert.equal(faq.get(record.id).answer, "Staff revision"); faq.remove(record.id, record.revision, true);
  assert.equal(faq.get(record.id), null);
});

test("Deletion failures preserve the FAQ; successful deletion removes published student and assistant answers", () => {
  const { faq, as, fail } = fixture(); const record = faq.save(answer, { action: "publish", confirmed: true });
  fail(true); assert.throws(() => faq.remove(record.id, record.revision, true)); fail(false);
  as(null); assert.equal(faq.answer("faq guidance"), answer.answer);
  as("STAFF-A"); faq.remove(record.id, record.revision, true);
  as(null); assert.equal(faq.search("faq guidance").length, 0); assert.equal(faq.answer("faq guidance"), faq.fallback);
});
