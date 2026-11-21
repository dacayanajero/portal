"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

test("staff release updates a separately signed-in student's open request list", async () => {
  const row = { id: "db-id", reference_no: "R1", student_id: "student", student_number: "QA",
    status: "Ready for Pickup", details: {} };
  let writes = 0;
  async function signIn(role) {
    let tick;
    const document = new EventTarget();
    const window = {
      PortalSupabaseApi: {}, PortalAppointmentService: {},
      PortalRequestService: { canTransition: (from, to) => from === "Ready for Pickup" && to === "Released" },
      PortalProfile: { snapshot: () => ({ account: {accountNumber: "QA"} }) },
      PortalAccounts: { sessionInfo: () => ({role}) },
      PortalStaffContext: { current: () => ({account: {accountNumber: "S1"}}) },
      setInterval(callback) { tick = callback; return 1; },
      clearInterval() { tick = undefined; },
    };
    window.PortalSupabase = { configured: true, client: {
      auth: { getUser: async () => ({ data: {user: {id: role}} }) },
      from(table) {
        const filters = {};
        let changes;
        return {
          select() { return this; }, order() { return this; }, limit() { return this; },
          eq(key, value) { filters[key] = value; return this; },
          update(values) { changes = values; return this; },
          then(resolve) {
            const visible = table === "requests" && Object.entries(filters).every(([k,v]) => row[k] === v);
            return resolve({ data: visible ? [structuredClone(row)] : [] });
          },
          async maybeSingle() {
            assert.equal(role, "staff");
            assert.equal(filters.id, row.id);
            assert.equal(filters.status, "Ready for Pickup");
            if (row.status !== filters.status) return {data: null};
            assert.equal(changes.status, "Released");
            Object.assign(row, changes, {release: {reference: "REL-R1", actor: "Test Staff"}, released_at: "2030-01-01T12:00:00Z"});
            writes++;
            return {data: structuredClone(row)};
          },
        };
      },
    }};
    vm.runInNewContext(fs.readFileSync("js/portal-supabase-storage.js","utf8"), {window, document, CustomEvent, console});
    document.dispatchEvent(new Event("portal:login"));
    await new Promise(resolve => setImmediate(resolve));
    return { service: window.PortalRequestService, tick: () => tick(), document };
  }
  const student = await signIn("student");
  const staff = await signIn("staff");
  const actor = { accountNumber: "S1" };
  assert.equal(student.service.getForStudent("R1", "QA").status, "Ready for Pickup");
  const result = await staff.service.updateStatus("R1", "Released", actor);
  assert.equal(result.persisted, true);
  assert.equal(writes, 1);
  await student.tick();
  assert.equal(student.service.getForStudent("R1", "QA").status, "Released");
  assert.equal(student.service.getForStudent("R1", "QA").release.reference, "REL-R1");
  await assert.rejects(staff.service.updateStatus("R1","Released",actor));
  assert.equal(writes, 1);
});
