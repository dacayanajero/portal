"use strict";

// Deterministic reporting math / privacy tests. No real records or dependencies.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const fixedTime = "2026-11-10T00:00:00.000Z";
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixedTime])); } static now() { return Date.parse(fixedTime); } }
const S = { PENDING: "Pending Review", CORRECTION: "Needs Correction", APPROVED: "Approved", PROCESSING: "Processing", READY: "Ready for Pickup", RELEASED: "Released", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const A = { PENDING: "Pending Confirmation", SCHEDULED: "Scheduled", CHECKED_IN: "Checked In", COMPLETED: "Completed", CANCELLED: "Cancelled", NO_SHOW: "No Show" };
const services = ["Grade Slip", "Registration Form", "ID Printing", "Transcript of Records", "Certificate of Enrollment"];
let sourceRequests = []; let sourceAppointments = []; let sourceAvailable = true; let profilesAvailable = true;
let current = { account: { role: "staff", accountNumber: "2020-123456" } };
const window = {
  PortalStaffContext: { current: () => current },
  PortalRequestService: { STATUS: S, STATUSES: Object.values(S), SERVICES: services, listAll: () => sourceRequests, sourceInfo: () => ({ available: sourceAvailable }), summary(list) { const result = Object.fromEntries(Object.values(S).map((status) => [status, list.filter((record) => record.status === status).length])); return { ...result, pending: result[S.PENDING], processing: result[S.PROCESSING] }; } },
  PortalAppointmentService: { STATUS: A, STATUSES: Object.values(A), listAll: () => sourceAppointments, sourceInfo: () => ({ available: true }), manilaDateTime: () => "2026-11-10T08:00" },
  PortalStudentRecordService: { reportingAttributes: () => { if (!profilesAvailable) throw new Error("Unavailable"); return [{ studentNumber: "S1", program: "BS Information Technology" }, { studentNumber: "S2", program: "BS Business Administration" }]; } },
};
const context = vm.createContext({ window, Date: Clock, console });
for (const file of ["report-config.js", "report-service.js", "report-export.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "js", file), "utf8"), context, { filename: file });
const reports = window.PortalReportService;
const filters = { start: "2026-10-01", end: "2026-10-31", aggregation: "daily" };
let passed = 0;
const test = (label, callback) => { callback(); passed++; console.log(`PASS ${label}`); };
function request(id, studentNumber, documentType, status, submittedAt, extra = {}) {
  return { id, studentNumber, documentType, status, submittedAt, approvedAt: "", processingStartedAt: "", readyAt: "", history: [], assignedStaff: "PRIVATE-STAFF", studentName: "PRIVATE-STUDENT", purpose: "PRIVATE-PURPOSE", processing: { notes: ["PRIVATE-INTERNAL"] }, recipientVerification: { method: "PRIVATE-VERIFICATION" }, ...extra };
}
function release(id, time, copies = null) { return { requestId: id, reference: `REL-${id}`, timestamp: time, copies, actor: "=UNTRUSTED-STAFF", handoverConfirmed: true, recipientName: "PRIVATE-RECIPIENT", verificationReference: "PRIVATE-VERIFICATION" }; }
test("Empty counts are zero and unmeasurable durations are N/A, never zero", () => {
  const report = reports.generate(filters); assert.equal(report.overview.total, 0); assert.equal(report.overview.appointments, 0); assert.equal(report.overview.released, 0); assert.equal(report.overview.average.hours, null); assert.equal(report.overview.average.eligible, 0);
});
test("Manila day boundaries and presets handle leap years and month changes", () => {
  assert.equal(reports.manilaDay("2026-09-30T16:00:00Z"), "2026-10-01");
  assert.equal(reports.preset("7days", "2026-11-01").start, "2026-10-26");
  assert.equal(reports.preset("lastMonth", "2024-03-15").end, "2024-02-29");
  assert.equal(reports.preset("month", "2026-11-10").start, "2026-11-01");
});
test("Lifecycle timestamps require timezone-aware real calendar times, not date-only values or rolled-over dates", () => {
  assert.equal(reports.timestamp("2026-02-30T00:00:00Z"), null); assert.equal(reports.timestamp("2026-10-01"), null); assert.equal(reports.timestamp("2026-10-01T24:00:00Z"), null); assert.equal(reports.timestamp("2026-10-01T09:00:00+08:00"), Date.parse("2026-10-01T01:00:00Z"));
});
test("Invalid dates, reversed ranges, unsupported statuses/services and excessive ranges fail validation", () => {
  assert.throws(() => reports.generate(null));
  for (const change of [{ start: "2026-02-30" }, { start: "2026-11-01", end: "2026-10-01" }, { status: "Scheduled" }, { service: "Invented Service" }, { aggregation: "hourly" }, { start: "2000-01-01" }]) assert.throws(() => reports.generate({ ...filters, ...change }));
});
sourceRequests = [
  request("P-1", "S1", services[0], S.PENDING, "2026-09-30T16:00:00Z"),
  request("P-2", "S2", services[0], S.PENDING, "2026-10-31T15:59:59.999Z"),
  request("BEFORE", "S1", services[0], S.PENDING, "2026-09-30T15:59:59.999Z"),
  request("AFTER", "S1", services[0], S.PENDING, "2026-10-31T16:00:00Z"),
  request("PROCESSING", "S1", services[1], S.PROCESSING, "2026-10-05T00:00:00Z", { approvedAt: "2026-10-06T00:00:00Z", processingStartedAt: "2026-10-07T00:00:00Z" }),
  request("READY", "S2", services[2], S.READY, "2026-10-06T00:00:00Z", { approvedAt: "2026-10-07T00:00:00Z", processingStartedAt: "2026-10-08T00:00:00Z", readyAt: "2026-10-10T00:00:00Z" }),
  request("REL-OLD", "S1", services[0], S.RELEASED, "2026-09-15T00:00:00Z", { approvedAt: "2026-10-01T00:00:00Z", processingStartedAt: "2026-10-01T06:00:00Z", readyAt: "2026-10-02T00:00:00Z", release: release("REL-OLD", "2026-10-03T00:00:00Z", 2), history: [{ action: "Approved by Staff", previousStatus: S.PENDING, newStatus: S.APPROVED, timestamp: "2026-10-01T00:00:00Z" }] }),
  request("REL-NEW", "S2", services[0], S.RELEASED, "2026-10-01T00:00:00Z", { approvedAt: "2026-10-02T00:00:00Z", release: release("REL-NEW", "2026-10-04T00:00:00Z", "3") }),
  request("REL-MISSING", "S1", services[0], S.RELEASED, "2026-10-02T00:00:00Z", { release: release("REL-MISSING", "2026-10-05T00:00:00Z") }),
  request("REL-REVERSED", "S2", services[3], S.RELEASED, "2026-10-03T00:00:00Z", { approvedAt: "2026-10-09T00:00:00Z", release: release("REL-REVERSED", "2026-10-08T00:00:00Z", "2.5") }),
  request("LEGACY", "S1", services[3], S.RELEASED, "2026-10-04T00:00:00Z", { releasedAt: "2026-10-10T00:00:00Z", history: [{ action: "Demo Record Imported", previousStatus: S.PENDING, newStatus: S.APPROVED, timestamp: "2026-10-04T00:00:00Z" }] }),
  request("REJECTED", "S2", services[4], S.REJECTED, "2026-10-08T00:00:00Z", { history: [{ action: "Request Rejected", previousStatus: S.PENDING, newStatus: S.REJECTED, timestamp: "2026-10-09T00:00:00Z" }] }),
  request("CANCELLED", "S3", services[1], S.CANCELLED, "2026-10-08T00:00:00Z"),
  request("FUTURE", "S1", services[0], S.PENDING, "2027-01-01T00:00:00Z"),
];
sourceRequests.push(sourceRequests[0]);
function appointment(id, requestId, studentNumber, serviceType, date, status, extra = {}) { return { id, requestId, studentNumber, serviceType, date, start: "09:00", status, rescheduleHistory: [], ...extra }; }
const reschedule = { timestamp: "2026-10-25T00:00:00Z", from: { date: "2026-10-20", start: "09:00" }, to: { date: "2026-10-31", start: "09:00" } };
sourceAppointments = [appointment("A1", "P-1", "S1", services[0], "2026-10-01", A.SCHEDULED), appointment("A2", "PROCESSING", "S1", services[1], "2026-10-31", A.COMPLETED, { rescheduleHistory: [reschedule, { ...reschedule, timestamp: "2026-10-26T00:00:00Z" }, reschedule] }), appointment("A3", "REL-NEW", "S2", services[0], "2026-10-30", A.CANCELLED), appointment("A4", "P-2", "S2", services[0], "2026-11-15", A.SCHEDULED), appointment("A5", "ORPHAN", "S3", services[4], "2026-10-15", A.NO_SHOW), appointment("A6", "P-1", "S1", services[0], "2026-10-32", A.PENDING)];
sourceAppointments.push(sourceAppointments[0]);
test("Inclusive request boundaries count each request once and use current statuses", () => {
  const report = reports.generate(filters); assert.equal(report.overview.total, 10); assert.equal(report.overview.pending, 2); assert.equal(report.overview.processing, 1);
  assert.equal(report.requests.byStatus.reduce((sum, row) => sum + row.value, 0), 10);
  assert.equal(report.requests.byService.reduce((sum, row) => sum + row.value, 0), 10);
});
test("Releases use actual handover snapshots by release date, independent of submission cohort", () => {
  const report = reports.generate(filters); assert.equal(report.overview.released, 4); assert.equal(report.releases.total, 4);
  assert.equal(report.quality.legacyReleasedWithoutSnapshot, 1); assert.equal(report.requests.byStatus.find((row) => row.label === S.RELEASED).value, 4);
  assert.equal(report.details.rows.some((row) => row.id === "REL-OLD"), false);
});
test("Durations exclude missing/reversed stamps without reducing valid release counts", () => {
  const report = reports.generate(filters); assert.equal(report.overview.average.hours, 48); assert.equal(report.overview.average.eligible, 2); assert.equal(report.overview.average.excluded, 2);
  assert.equal(report.processing.intervals.approvalToStart.hours, 18); assert.equal(report.processing.intervals.startToReady.hours, 33);
});
test("A genuinely zero-hour recorded interval is valid and distinct from missing data", () => {
  sourceRequests.push(request("ZERO", "S1", services[0], S.RELEASED, "2026-10-01T00:00:00Z", { approvedAt: "2026-10-06T00:00:00Z", release: release("ZERO", "2026-10-06T00:00:00Z", 1) }));
  const report = reports.generate(filters); assert.equal(report.overview.average.hours, 32); assert.equal(report.overview.average.eligible, 3); assert.equal(report.overview.average.excluded, 2); sourceRequests.pop();
});
test("Duplicate references, missing confirmation, invalid release timestamps and mismatched request IDs never inflate releases", () => {
  const entries = [
    { ...release("DUP", "2026-10-10T00:00:00Z", 1), reference: "REL-REL-OLD" },
    { ...release("UNCONFIRMED", "2026-10-10T00:00:00Z", 1), handoverConfirmed: false },
    release("INVALID", "invalid timestamp", 1),
    release("MISMATCH", "2026-10-10T00:00:00Z", 1),
  ].map((snapshot, index) => request(index === 3 ? "OTHER-ID" : snapshot.requestId, "S1", services[0], S.RELEASED, "2026-09-01T00:00:00Z", { approvedAt: "2026-10-01T00:00:00Z", release: snapshot }));
  sourceRequests.push(...entries); const report = reports.generate(filters); assert.equal(report.overview.released, 4); assert.equal(report.quality.invalidReleaseSnapshots, 4); sourceRequests.splice(-entries.length);
});
test("Known copy quantities are distinct from release requests; unknown/fractional quantities are not assumed", () => {
  const report = reports.generate(filters); assert.equal(report.releases.knownCopies, 5); assert.equal(report.releases.knownQuantityRecords, 2); assert.equal(report.releases.unknownQuantityRecords, 2);
});
test("Large valid copy sums retain exact integer precision rather than floating-point rounding", () => {
  for (const id of ["LARGE-1", "LARGE-2"]) sourceRequests.push(request(id, "S1", services[0], S.RELEASED, "2026-09-01T00:00:00Z", { approvedAt: "2026-10-01T00:00:00Z", release: release(id, "2026-10-03T00:00:00Z", Number.MAX_SAFE_INTEGER) }));
  assert.equal(reports.generate(filters).releases.knownCopies, (BigInt(Number.MAX_SAFE_INTEGER) * 2n + 5n).toString()); sourceRequests.splice(-2);
});
test("Processing chart requires two valid service observations; lone observations remain contextual", () => {
  const report = reports.generate({ ...filters, program: "BS Information Technology" });
  assert.equal(report.overview.average.eligible, 1); assert.equal(report.overview.average.hours, 48); assert.equal(report.processing.averagesByService.length, 0);
  assert.equal(reports.generate(filters).processing.averagesByService[0].sampleSize, 2);
});
test("Appointment counts use unique current scheduled dates, not status-change or reschedule entry counts", () => {
  const report = reports.generate(filters); assert.equal(report.overview.appointments, 4); assert.equal(report.appointments.completed, 1); assert.equal(report.appointments.cancelled, 1); assert.equal(report.appointments.noShow, 1); assert.equal(report.appointments.reschedules, 2);
  assert.equal(report.appointments.byStatus.reduce((sum, row) => sum + row.value, 0), 4);
});
test("Request status filters appointments through the linked request without confusing lifecycles", () => {
  const report = reports.generate({ ...filters, status: S.PENDING }); assert.equal(report.overview.total, 2); assert.equal(report.overview.appointments, 1);
  assert.equal(report.appointments.byStatus.find((row) => row.label === A.SCHEDULED).value, 1);
});
test("Service, program and status filters combine across submission/release activity", () => {
  const report = reports.generate({ ...filters, service: services[0], program: "bs information technology", status: S.RELEASED });
  assert.equal(report.overview.total, 1); assert.equal(report.overview.released, 2); assert.equal(report.overview.average.eligible, 1);
});
test("Program filtering uses current authorized self-reported attributes; unknown programs remain in All Programs", () => {
  assert.equal(reports.generate({ ...filters, program: "BS Information Technology" }).overview.total, 4);
  assert.equal(reports.generate({ ...filters, program: "BS Business Administration" }).overview.total, 5);
  assert.equal(reports.generate(filters).overview.total, 10);
});
test("Unavailable program source is explicit and cannot silently ignore a program filter", () => {
  profilesAvailable = false; assert.equal(reports.generate(filters).facets.programSourceAvailable, false); assert.throws(() => reports.generate({ ...filters, program: "BS Information Technology" })); profilesAvailable = true;
});
test("Approval/rejection activity uses real history, not imported or current status guesses", () => {
  const report = reports.generate(filters); assert.equal(report.requests.approvalActivity, 1); assert.equal(report.requests.rejectionActivity, 1);
});
test("Daily/weekly/monthly trends preserve totals and include empty buckets", () => {
  for (const aggregation of ["daily", "weekly", "monthly"]) {
    const report = reports.generate({ ...filters, aggregation }); assert.equal(report.requests.trend.reduce((sum, row) => sum + row.value, 0), 10); assert.equal(report.releases.trend.reduce((sum, row) => sum + row.value, 0), 4);
  }
  assert.equal(reports.generate(filters).requests.trend.length, 31); assert.equal(reports.generate({ ...filters, aggregation: "weekly" }).requests.trend[0].label, "2026-09-28");
});
test("Invalid/future dates are excluded and quality counts explain missing data", () => {
  const report = reports.generate(filters); assert.equal(report.quality.invalidSubmissionDates, 1); assert.equal(report.quality.invalidAppointmentDates, 1);
});
test("No identities, internal notes or staff metrics appear without their distinct capabilities", () => {
  const report = reports.generate(filters); assert.equal(report.releases.byStaff, null); assert.ok(report.details.rows.every((row) => !Object.hasOwn(row, "studentNumber") && !Object.hasOwn(row, "responsibleStaff")));
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-|UNTRUSTED-STAFF|recipientName|verificationReference/);
});
test("Detailed search/sort/pagination match the submitted cohort and do not search restricted identifiers", () => {
  const report = reports.generate(filters, { query: "P-", sort: "id", page: 9 }); assert.equal(report.details.total, 2); assert.equal(report.details.page, 1); assert.equal(report.details.rows[0].id, "P-1");
  assert.equal(reports.generate(filters, { query: "S1" }).details.total, 0);
});
test("Default staff can see aggregates but cannot obtain details or unrestricted exports", () => {
  current = { account: { role: "staff", accountNumber: "ORDINARY" } }; assert.equal(reports.generate(filters).details, null); assert.throws(() => reports.exportData("requests", filters));
  current = { account: { role: "staff", accountNumber: "2020-123456" } };
});
test("All six export datasets use applied filters, title/period/definitions and actual totals", () => {
  assert.throws(() => reports.exportData("toString", filters));
  for (const type of ["requests", "appointments", "processing", "releases", "services", "detailed"]) {
    const data = reports.exportData(type, filters); assert.ok(data.metadata.some((row) => row[0] === "Definition")); assert.match(data.filename, /2026-10-01_to_2026-10-31/);
    const csv = window.PortalReportExport.csv(data); assert.ok(csv.startsWith("\uFEFF")); assert.doesNotMatch(csv, /PRIVATE-|UNTRUSTED-STAFF|studentNumber|responsibleStaff/);
  }
  assert.equal(reports.exportData("requests", filters).rows.find((row) => row[0] === "Submitted Requests")[1], 10);
  assert.equal(reports.exportData("releases", filters).rows.find((row) => row[0] === "Recorded Released Requests")[1], 4);
});
test("Empty release exports report genuinely zero releases and copies with N/A only for unavailable durations", () => {
  const empty = { start: "2001-01-01", end: "2001-01-31" };
  const data = reports.exportData("releases", empty); assert.equal(data.rows.find((row) => row[0] === "Recorded Released Requests")[1], 0); assert.equal(data.rows.find((row) => row[0] === "Known Copies Released")[1], 0); assert.equal(reports.generate(empty).overview.average.hours, null);
});
test("Detailed exports respect local search/sort and include all matching pages, not only the visible page", () => {
  const data = reports.exportData("detailed", filters, { query: "P-", sort: "id", page: 2 }); assert.equal(data.rows.find((row) => row[0] === "Matching Records (all pages)")[1], 2);
});
test("CSV quoting handles commas, quotes, newlines, UTF-8 and whitespace-prefixed spreadsheet formulas", () => {
  const csv = window.PortalReportExport.csv({ metadata: [], rows: [["Rizal, Pasig", 'A "quote"', "Line1\nLine2", "Ñ", "=1+1", " \t@SUM(1,2)", "+cmd", "-cmd"]] });
  assert.match(csv, /"Rizal, Pasig"/); assert.match(csv, /"A ""quote"""/); assert.match(csv, /Line1\nLine2/); assert.match(csv, /Ñ/); assert.match(csv, /"'=1\+1"/); assert.match(csv, /"' \t@SUM/);
});
test("Explicit sensitive/staff capabilities are checked separately for detailed projections", () => {
  const previous = window.PortalReportPolicy;
  window.PortalReportPolicy = { ...previous, accountCapabilities: { "2020-123456": ["aggregate", "details", "export", "studentIdentifiers", "staffMetrics"] } };
  const report = reports.generate(filters); assert.ok(report.details.rows.some((row) => row.studentNumber === "S1")); assert.ok(report.releases.byStaff.length);
  const first = sourceRequests.find((request) => request.id === "REL-OLD"); const second = sourceRequests.find((request) => request.id === "REL-NEW"); const originalActor = second.release.actor;
  first.release.staffId = "STABLE-STAFF-ID"; second.release.staffId = "STABLE-STAFF-ID"; second.release.actor = "New display snapshot";
  const grouped = reports.generate(filters).releases.byStaff; assert.equal(grouped.find((row) => row.label.includes("STABLE-STAFF-ID")).value, 2); assert.equal(grouped.reduce((sum, row) => sum + row.value, 0), 4);
  const csv = window.PortalReportExport.csv(reports.exportData("releases", filters)); assert.match(csv, /'=UNTRUSTED-STAFF/);
  delete first.release.staffId; delete second.release.staffId; second.release.actor = originalActor;
  window.PortalReportPolicy = previous;
});
test("Configured small-program privacy suppression applies equally to views and exports", () => {
  const previous = window.PortalReportPolicy; window.PortalReportPolicy = { ...previous, minimumProgramGroupSize: 5 };
  assert.throws(() => reports.generate({ ...filters, program: "BS Information Technology" })); assert.throws(() => reports.exportData("detailed", { ...filters, program: "BS Information Technology" })); assert.equal(reports.generate(filters).overview.total, 10); window.PortalReportPolicy = previous;
});
test("Reports are read-only and never store duplicate operational data or change statuses", () => {
  const before = JSON.stringify([sourceRequests, sourceAppointments]); reports.generate(filters); reports.exportData("services", filters); assert.equal(JSON.stringify([sourceRequests, sourceAppointments]), before);
});
test("Unavailable shared data fails closed instead of inventing zero totals", () => { sourceAvailable = false; assert.throws(() => reports.generate(filters)); sourceAvailable = true; });
test("Students and signed-out callers cannot query reports or export through direct service access", () => {
  current = null; assert.throws(() => reports.generate(filters)); assert.throws(() => reports.exportData("requests", filters));
  current = { account: { role: "student", accountNumber: "S1" } }; assert.throws(() => reports.generate(filters));
});
console.log(`\n${passed} Phase G deterministic service scenarios passed. Server authorization, centralized aggregation and secure export auditing require a backend.`);
