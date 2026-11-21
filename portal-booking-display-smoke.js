"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

test("request and confirmation views use the linked appointment after a reschedule", async () => {
  const details = {
    appointmentDate: "2030-02-04", appointmentDateLabel: "Original date",
    appointmentStart: "09:00", appointmentEnd: "10:00", appointmentTimeRange: "Original time",
  };
  const rows = {
    requests: [
      { id: "moved", reference_no: "R1", details },
      { id: "legacy", reference_no: "R2", details },
      { id: "unscheduled", reference_no: "R3", details: {} },
    ],
    appointments: [
      { id: "A1", request_id: "moved", appt_date: "2030-02-05", start_time: "14:30:00", end_time: "15:30:00" },
    ],
    audit_log: [],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "test-student" } } }) },
    from(table) {
      return { select() { return this; }, order() { return this; }, limit() { return this; },
        then(resolve) { return resolve({ data: rows[table] }); } };
    },
  };
  const window = {
    PortalRequestService: {}, PortalAppointmentService: {}, PortalSupabaseApi: {},
    PortalSupabase: { configured: true, client },
  };
  vm.runInNewContext(fs.readFileSync("js/portal-supabase-storage.js", "utf8"), {
    window, document: new EventTarget(), CustomEvent, console,
  });
  const requests = window.PortalRequestService;
  await requests.refresh();
  const moved = requests.get("R1");
  assert.equal(moved.appointment.display, window.PortalAppointmentService.get("A1").display);
  assert.equal(moved.details.appointmentDate, "2030-02-05");
  assert.equal(moved.details.appointmentDateLabel, moved.appointment.dateLabel);
  assert.equal(moved.details.appointmentTimeRange, "14:30 - 15:30");
  assert.equal(moved.details.appointmentStart, "14:30");
  assert.equal(moved.details.appointmentEnd, "15:30");
  assert.equal(requests.get("R2").appointment.display, "Original date · Original time");
  assert.equal(requests.get("R3").appointment.display, "");
});
