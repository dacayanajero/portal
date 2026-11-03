"use strict";

(() => {
  const requests = window.PortalRequestService;
  const appointments = window.PortalAppointmentService;
  const S = requests.STATUS;
  const A = appointments.STATUS;
  const OTHER = "Other / Unrecognized Service";
  const DAY = 86400000;
  const intervalLabels = Object.freeze({ approvalToStart: "Approval → Processing Start", startToReady: "Processing Start → Ready", approvalToRelease: "Approval → Release" });
  const definitions = Object.freeze([
    "All reporting days are inclusive Asia/Manila calendar days. Service, current request status, and current self-reported program filters combine.",
    "Total/Pending/In Processing Requests and request charts: requests submitted during the period; status is their current status, not historical status at period end.",
    "Released Documents and release charts: unique requests with a valid Phase D handover-confirmed release snapshot dated in the period, regardless of submission date. Legacy Released status without a valid snapshot is excluded.",
    "Appointments: unique appointments by their current scheduled appointment date, not booking or completion date. Request Status applies through the linked request; appointments without that link are excluded only when that filter requires it.",
    "Average Processing Time: mean elapsed calendar hours from recorded approval to actual release for valid release snapshots during the period; missing, future or reversed timestamps are excluded, never treated as zero.",
    "Approval → Processing Start and Processing Start → Ready use records whose interval endpoint is in the period. No working-hour, SLA or deadline assumptions are applied.",
    "Program: current self-reported profile from the authorized student-record source, not verified enrollment or historical program at submission. Unknown programs remain in All Programs.",
    "Approval/rejection activity counts unique requests with a recorded status-changing approval/rejection history event in the period, independent of submission date. Reschedules are separate actual events, never extra appointments.",
    "Data-quality counters cover all dates under the selected service/status/program scope; raw rejected-row counts are source-wide. They are not additional reporting-period activity.",
  ]);
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  function timestamp(value) {
    const match = typeof value === "string" && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/);
    return match && validDay(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && (!match[4] || Number(match[4]) < 60) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  }
  function capabilities() {
    const account = window.PortalStaffContext?.current()?.account;
    if (account?.role !== "staff") throw new Error("Authorized staff access is required for reports.");
    return [...(window.PortalReportPolicy.accountCapabilities[account.accountNumber] || window.PortalReportPolicy.defaultCapabilities)];
  }
  function requireCapability(capability) {
    if (!capabilities().includes(capability)) throw new Error(`Your account does not have ${capability} reporting permission.`);
  }
  function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
  function manilaDay(value = new Date().toISOString()) {
    const time = timestamp(value); if (time === null) return "";
    return new Date(time + 8 * 3600000).toISOString().slice(0, 10);
  }
  function shift(day, amount) { return new Date(Date.parse(`${day}T00:00:00Z`) + amount * DAY).toISOString().slice(0, 10); }
  function preset(name, today = manilaDay()) {
    if (!validDay(today)) throw new Error("The reporting date is invalid.");
    const first = `${today.slice(0, 7)}-01`;
    if (name === "today") return { start: today, end: today };
    if (name === "7days") return { start: shift(today, -6), end: today };
    if (name === "30days") return { start: shift(today, -29), end: today };
    if (name === "month") return { start: first, end: today };
    if (name === "lastMonth") { const end = shift(first, -1); return { start: `${end.slice(0, 7)}-01`, end }; }
    throw new Error("Choose a supported reporting period.");
  }
  function validateFilters(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose valid reporting filters.");
    const fallback = preset("30days");
    const result = { start: input.start ?? fallback.start, end: input.end ?? fallback.end, service: input.service || "", program: String(input.program || "").trim(), status: input.status || "", aggregation: input.aggregation || "daily" };
    if (!validDay(result.start) || !validDay(result.end) || result.start > result.end) throw new Error("Enter a valid start and end date, with the start no later than the end.");
    if ((Date.parse(result.end) - Date.parse(result.start)) / DAY > 3660) throw new Error("This browser prototype supports at most 3,661 reporting days per report. Narrow the range.");
    if (result.service && !requests.SERVICES.includes(result.service)) throw new Error("Choose an available academic document service.");
    if (result.status && !requests.STATUSES.includes(result.status)) throw new Error("Choose a valid shared request status.");
    if (!["daily", "weekly", "monthly"].includes(result.aggregation)) throw new Error("Choose daily, weekly or monthly aggregation.");
    return result;
  }
  function unique(list, key) {
    const map = new Map();
    list.forEach((record) => { if (record && typeof record[key] === "string" && record[key] && !map.has(record[key])) map.set(record[key], record); });
    return [...map.values()];
  }
  const category = (name) => requests.SERVICES.includes(name) ? name : OTHER;
  function distribution(list, getter, categories) {
    const counts = new Map(categories.map((name) => [name, 0]));
    list.forEach((record) => { const name = getter(record); counts.set(name, (counts.get(name) || 0) + 1); });
    return [...counts].map(([label, value]) => ({ label, value }));
  }
  function bucket(day, grouping) {
    if (grouping === "monthly") return day.slice(0, 7);
    if (grouping === "weekly") { const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); return shift(day, -((weekday + 6) % 7)); }
    return day;
  }
  function trend(list, dayOf, filters, grouping = filters.aggregation) {
    const values = new Map();
    for (let day = filters.start; day <= filters.end; day = shift(day, 1)) values.set(bucket(day, grouping), 0);
    list.forEach((record) => { const key = bucket(dayOf(record), grouping); if (values.has(key)) values.set(key, values.get(key) + 1); });
    return [...values].map(([label, value]) => ({ label, value }));
  }
  function measured(list, startOf, endOf, generatedAt) {
    const samples = [];
    list.forEach((record) => { const start = timestamp(startOf(record)); const end = timestamp(endOf(record)); if (start !== null && end !== null && end >= start && end <= generatedAt && start <= generatedAt) samples.push((end - start) / 3600000); });
    return { hours: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null, eligible: samples.length, excluded: list.length - samples.length };
  }
  function build(input) {
    requireCapability("aggregate");
    const filters = validateFilters(input); const generatedAt = new Date().toISOString(); const generatedTime = Date.parse(generatedAt);
    const requestInfo = requests.sourceInfo?.() || { available: true }; const appointmentInfo = appointments.sourceInfo?.() || { available: true };
    if (!requestInfo.available || !appointmentInfo.available) throw new Error("A shared request or appointment source is unavailable. Reports cannot be calculated reliably.");
    const allRequests = unique(requests.listAll(), "id"); const allAppointments = unique(appointments.listAll(), "id");
    const requestIndex = new Map(allRequests.map((request) => [request.id, request]));
    let attributes = []; let programSourceAvailable = true;
    try { attributes = window.PortalStudentRecordService.reportingAttributes(); } catch { programSourceAvailable = false; }
    if (filters.program && !programSourceAvailable) throw new Error("The student program source is unavailable; a program-filtered report cannot be generated.");
    const programs = new Map(attributes.map((student) => [student.studentNumber, student.program]));
    const facets = [...new Map(attributes.filter((student) => student.program).map((student) => [normalize(student.program), student.program])).values()].sort();
    if (filters.program && !facets.some((program) => normalize(program) === normalize(filters.program))) throw new Error("Choose an available self-reported program.");
    const matchingProgram = (number) => !filters.program || normalize(programs.get(number)) === normalize(filters.program);
    const requestScope = allRequests.filter((request) => (!filters.service || request.documentType === filters.service) && (!filters.status || request.status === filters.status) && matchingProgram(request.studentNumber));
    const appointmentScope = allAppointments.filter((appointment) => (!filters.service || appointment.serviceType === filters.service) && matchingProgram(appointment.studentNumber) && (!filters.status || requestIndex.get(appointment.requestId)?.status === filters.status));
    const from = Date.parse(`${filters.start}T00:00:00+08:00`); const to = Date.parse(`${filters.end}T23:59:59.999+08:00`);
    const inPeriod = (value, actual = true) => { const time = timestamp(value); return time !== null && time >= from && time <= to && (!actual || time <= generatedTime); };
    const cohort = requestScope.filter((request) => inPeriod(request.submittedAt));
    const appointmentCohort = appointmentScope.filter((appointment) => validDay(appointment.date) && appointment.date >= filters.start && appointment.date <= filters.end);
    const seenRelease = new Set(); const validReleaseIds = new Set(); let invalidReleases = 0;
    const releases = requestScope.filter((request) => {
      const release = request.release;
      if (!release) return false;
      const valid = request.status === S.RELEASED && release.requestId === request.id && typeof release.reference === "string" && release.reference.trim() && release.handoverConfirmed === true && timestamp(release.timestamp) !== null && timestamp(release.timestamp) <= generatedTime && !seenRelease.has(release.reference);
      if (!valid) { invalidReleases++; return false; }
      seenRelease.add(release.reference); validReleaseIds.add(request.id); return inPeriod(release.timestamp);
    });
    if (filters.program && window.PortalReportPolicy.minimumProgramGroupSize > 0) {
      const size = new Set([...cohort, ...appointmentCohort, ...releases].map((record) => record.studentNumber)).size;
      if (size < window.PortalReportPolicy.minimumProgramGroupSize) throw new Error("This program report is below the configured privacy threshold. Choose All Programs or broaden the period.");
    }
    const counts = requests.summary(cohort);
    const processingStarts = requestScope.filter((request) => inPeriod(request.processingStartedAt));
    const readyEvents = requestScope.filter((request) => inPeriod(request.readyAt));
    const intervals = {
      approvalToStart: measured(processingStarts, (record) => record.approvedAt, (record) => record.processingStartedAt, generatedTime),
      startToReady: measured(readyEvents, (record) => record.processingStartedAt, (record) => record.readyAt, generatedTime),
      approvalToRelease: measured(releases, (record) => record.approvedAt, (record) => record.release.timestamp, generatedTime),
    };
    const approvalActivity = requestScope.filter((request) => request.history.some((event) => event.action === "Approved by Staff" && event.newStatus === S.APPROVED && event.previousStatus === S.PENDING && inPeriod(event.timestamp))).length;
    const rejectionActivity = requestScope.filter((request) => request.history.some((event) => event.action === "Request Rejected" && event.newStatus === S.REJECTED && event.previousStatus === S.PENDING && inPeriod(event.timestamp))).length;
    const reschedules = new Set(appointmentScope.flatMap((appointment) => (appointment.rescheduleHistory || []).filter((event) => inPeriod(event.timestamp)).map((event) => `${appointment.id}:${event.timestamp}:${event.from?.date}:${event.from?.start}:${event.to?.date}:${event.to?.start}`))).size;
    const activeAppointments = [A.PENDING, A.SCHEDULED, A.CHECKED_IN];
    const upcoming = appointmentCohort.filter((appointment) => activeAppointments.includes(appointment.status) && `${appointment.date}T${appointment.start}` > appointments.manilaDateTime()).length;
    const quantities = releases.map((request) => { const value = request.release.copies; return /^(?:[1-9]\d*)$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value)) ? Number(value) : null; });
    const copySum = quantities.filter((value) => value !== null).reduce((sum, value) => sum + BigInt(value), 0n);
    const serviceNames = [...requests.SERVICES, ...(requestScope.some((request) => category(request.documentType) === OTHER) || appointmentScope.some((appointment) => category(appointment.serviceType) === OTHER) ? [OTHER] : [])];
    const servicePerformance = serviceNames.map((label) => {
      const submissions = cohort.filter((request) => category(request.documentType) === label);
      const completed = releases.filter((request) => category(request.documentType) === label);
      return { documentType: label, total: submissions.length, pending: submissions.filter((request) => request.status === S.PENDING).length, processing: submissions.filter((request) => request.status === S.PROCESSING).length, released: completed.length, duration: measured(completed, (request) => request.approvedAt, (request) => request.release.timestamp, generatedTime) };
    });
    const caps = capabilities();
    let releaseStaffGroups = null;
    if (caps.includes("staffMetrics")) {
      const groups = new Map();
      releases.forEach((request) => { const release = request.release; const key = release.staffId || "unattributed"; if (!groups.has(key)) groups.set(key, { label: release.staffId ? `${release.actor || "Not recorded"} · ${release.staffId}` : "Unattributed staff (stable ID unavailable)", value: 0 }); groups.get(key).value++; });
      releaseStaffGroups = [...groups.values()];
    }
    const report = {
      generatedAt, filters, definitions, capabilities: caps, facets: { programs: facets, programSourceAvailable },
      overview: { total: cohort.length, pending: counts.pending, processing: counts.processing, released: releases.length, appointments: appointmentCohort.length, average: intervals.approvalToRelease },
      requests: { byService: distribution(cohort, (request) => category(request.documentType), serviceNames), byStatus: distribution(cohort, (request) => request.status, requests.STATUSES), trend: trend(cohort, (request) => manilaDay(request.submittedAt), filters), approvalActivity, rejectionActivity },
      appointments: { total: appointmentCohort.length, upcoming, completed: appointmentCohort.filter((record) => record.status === A.COMPLETED).length, cancelled: appointmentCohort.filter((record) => record.status === A.CANCELLED).length, noShow: appointmentCohort.filter((record) => record.status === A.NO_SHOW).length, reschedules, byStatus: distribution(appointmentCohort, (record) => record.status, appointments.STATUSES), byService: distribution(appointmentCohort, (record) => category(record.serviceType), serviceNames), trend: trend(appointmentCohort, (record) => record.date, filters) },
      processing: { awaiting: counts[S.APPROVED], processing: counts.processing, ready: counts[S.READY], intervals, startsByService: distribution(processingStarts, (request) => category(request.documentType), serviceNames), averagesByService: servicePerformance.filter((row) => row.duration.eligible >= 2).map((row) => ({ label: row.documentType, value: row.duration.hours, sampleSize: row.duration.eligible })) },
      releases: { total: releases.length, knownCopies: copySum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(copySum) : copySum.toString(), knownQuantityRecords: quantities.filter((value) => value !== null).length, unknownQuantityRecords: quantities.filter((value) => value === null).length, byService: distribution(releases, (request) => category(request.documentType), serviceNames), trend: trend(releases, (request) => manilaDay(request.release.timestamp), filters), monthly: trend(releases, (request) => manilaDay(request.release.timestamp), filters, "monthly"), byStaff: releaseStaffGroups },
      servicePerformance,
      quality: { memoryOnly: Boolean(requestInfo.memoryOnly), invalidStoredRequests: requestInfo.invalidRecords || 0, invalidSubmissionDates: requestScope.filter((request) => timestamp(request.submittedAt) === null || timestamp(request.submittedAt) > generatedTime).length, invalidAppointmentDates: appointmentScope.filter((appointment) => !validDay(appointment.date)).length, legacyReleasedWithoutSnapshot: requestScope.filter((request) => request.status === S.RELEASED && !request.release).length, invalidReleaseSnapshots: invalidReleases },
    };
    try { report.support = window.PortalSupportService ? window.PortalSupportService.analytics({ start: filters.start, end: filters.end }) : { available: false }; }
    catch { report.support = { available: false }; }
    return { report, cohort, releases, validReleaseIds };
  }
  function detailRows(cohort, options = {}, validReleaseIds = new Set()) {
    const showIdentifiers = capabilities().includes("studentIdentifiers"); const showStaff = capabilities().includes("staffMetrics");
    const query = normalize(options.query);
    const observedTime = (value) => timestamp(value) !== null && timestamp(value) <= Date.now() ? value : "";
    return cohort.map((request) => ({ id: request.id, documentType: request.documentType, submittedAt: request.submittedAt, status: request.status, approvedAt: observedTime(request.approvedAt), processingStartedAt: observedTime(request.processingStartedAt), readyAt: observedTime(request.readyAt), releasedAt: validReleaseIds.has(request.id) ? request.release.timestamp : "", durationHours: validReleaseIds.has(request.id) ? measured([request], (record) => record.approvedAt, (record) => record.release.timestamp, Date.now()).hours : null, ...(showIdentifiers ? { studentNumber: request.studentNumber } : {}), ...(showStaff ? { responsibleStaff: request.release?.actor || request.assignedStaff || "Not recorded" } : {}) }))
      .filter((row) => !query || [row.id, row.documentType, row.status, ...(showIdentifiers ? [row.studentNumber] : [])].some((value) => normalize(value).includes(query)))
      .sort((a, b) => options.sort === "id" ? a.id.localeCompare(b.id, "en", { numeric: true }) : (Date.parse(b.submittedAt) - Date.parse(a.submittedAt)) * (options.sort === "oldest" ? -1 : 1));
  }
  function generate(filters, detailOptions = {}) {
    const { report, cohort, validReleaseIds } = build(filters);
    if (capabilities().includes("details")) {
      const rows = detailRows(cohort, detailOptions, validReleaseIds); const pages = Math.max(1, Math.ceil(rows.length / 10)); const page = Math.min(pages, Math.max(1, Math.trunc(Number(detailOptions.page)) || 1));
      report.details = { rows: rows.slice((page - 1) * 10, page * 10), total: rows.length, page, pages };
    } else report.details = null;
    return report;
  }
  function exportData(type, filters, detailOptions = {}) {
    requireCapability("export");
    const { report, cohort, validReleaseIds } = build(filters);
    const titles = { requests: "Document Request Summary", appointments: "Appointment Summary", processing: "Document Processing Summary", releases: "Document Release Summary", services: "Service Performance Summary", detailed: "Filtered Detailed Report", support: "Authorized Support Summary" };
    if (!Object.hasOwn(titles, type)) throw new Error("Choose an available report export type.");
    const series = (name, list) => [[name, "Count"], ...list.map((row) => [row.label, row.value])];
    let rows = [];
    if (type === "requests") rows = [["Submitted Requests", report.overview.total], ["Approval Activity (unique requests)", report.requests.approvalActivity], ["Rejection Activity (unique requests)", report.requests.rejectionActivity], [], ...series("Current Request Status", report.requests.byStatus), [], ...series("Service", report.requests.byService), [], ...series("Submission Trend", report.requests.trend)];
    if (type === "appointments") rows = [["Total Appointments", report.appointments.total], ["Upcoming", report.appointments.upcoming], ["Completed", report.appointments.completed], ["Cancelled", report.appointments.cancelled], ["No Show", report.appointments.noShow], ["Reschedule events during period", report.appointments.reschedules], [], ...series("Appointment Status", report.appointments.byStatus), [], ...series("Service", report.appointments.byService), [], ...series("Appointment Date Trend", report.appointments.trend)];
    if (type === "processing") rows = [["Interval", "Mean Elapsed Hours", "Eligible", "Excluded"], ...Object.entries(report.processing.intervals).map(([name, value]) => [intervalLabels[name], value.hours ?? "N/A", value.eligible, value.excluded]), [], ...series("Processing Starts by Service", report.processing.startsByService)];
    if (type === "releases") rows = [["Recorded Released Requests", report.releases.total], ["Known Copies Released", report.releases.total === 0 || report.releases.knownQuantityRecords ? report.releases.knownCopies : "N/A"], ["Unknown Copy Quantities", report.releases.unknownQuantityRecords], [], ...series("Released Service", report.releases.byService), [], ...series("Monthly Releases", report.releases.monthly), ...(report.releases.byStaff ? [[], ...series("Releasing Staff", report.releases.byStaff)] : [])];
    if (type === "services") rows = [["Document Type", "Submitted", "Currently Pending in Submission Cohort", "Currently Processing in Submission Cohort", "Recorded Releases in Period", "Approval-to-Release Mean Hours", "Eligible", "Excluded"], ...report.servicePerformance.map((row) => [row.documentType, row.total, row.pending, row.processing, row.released, row.duration.hours ?? "N/A", row.duration.eligible, row.duration.excluded])];
    if (type === "support") {
      if (!report.support.available) throw new Error("Authorized support analytics are unavailable.");
      const support = report.support;
      rows = [["Scope", "Submission-period support cohort and authorized support view only. Service/program/request-status filters do not apply."], ["Submitted Support Tickets", support.total], ["Current Open", support.open], ["Current In Progress", support.progress], ["Current Waiting for Student", support.waiting], ["Current Resolved", support.resolved], ["Current Closed", support.closed], ["Unique Tickets With Recorded Resolution During Period", support.resolvedDuringPeriod], ["First Staff Response Mean Hours (submission cohort)", support.firstResponse.hours ?? "N/A"], ["First Response Valid / Excluded", support.firstResponse.eligible, support.firstResponse.excluded], ["Creation to Latest Resolution During Period Mean Hours", support.resolution.hours ?? "N/A"], ["Resolution Valid / Excluded", support.resolution.eligible, support.resolution.excluded], [], ...series("Support Category", support.byCategory)];
    }
    if (type === "detailed") {
      requireCapability("details");
      const data = detailRows(cohort, detailOptions, validReleaseIds);
      const columns = ["id", ...(capabilities().includes("studentIdentifiers") ? ["studentNumber"] : []), "documentType", "submittedAt", "status", "approvedAt", "processingStartedAt", "readyAt", "releasedAt", "durationHours", ...(capabilities().includes("staffMetrics") ? ["responsibleStaff"] : [])];
      rows = [["Detailed Search", String(detailOptions.query || "")], ["Detailed Sort", detailOptions.sort || "newest"], ["Matching Records (all pages)", data.length], [], columns, ...data.map((row) => columns.map((column) => row[column] === null || row[column] === "" ? "N/A" : row[column]))];
      if (!data.length) rows.push(["No matching records"]);
    }
    return { title: titles[type], filename: `RTU_Pasig_${type}_Report_${report.filters.start}_to_${report.filters.end}.csv`, metadata: [["Report", titles[type]], ["Reporting Period (Asia/Manila, inclusive)", report.filters.start, report.filters.end], ["Generated At (UTC)", report.generatedAt], ["Service", report.filters.service || "All Services"], ["Current Request Status", report.filters.status || "All Statuses"], ["Current Self-reported Program", report.filters.program || "All Programs"], ["Aggregation", report.filters.aggregation], ...report.definitions.map((definition) => ["Definition", definition]), ["Source-wide Invalid Request Rows", report.quality.invalidStoredRequests], ["Scoped Invalid/Future Submission Dates", report.quality.invalidSubmissionDates], ["Scoped Invalid Appointment Dates", report.quality.invalidAppointmentDates], ["Scoped Legacy Releases Without Snapshots", report.quality.legacyReleasedWithoutSnapshot], ["Scoped Invalid Release Snapshots", report.quality.invalidReleaseSnapshots], ["Request Source Memory-only", report.quality.memoryOnly ? "Yes" : "No"], ["Program Source Available", report.facets.programSourceAvailable ? "Yes" : "No"], ["Audit", "Secure persistent report-generation auditing is not connected."], []], rows };
  }
  window.PortalReportService = Object.freeze({ definitions, intervalLabels, capabilities, preset, validateFilters, timestamp, manilaDay, generate, exportData });
})();
