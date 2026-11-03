"use strict";

window.initializeStaffReports = () => {
  const service = window.PortalReportService;
  const context = window.PortalStaffContext;
  const $ = (id) => document.getElementById(id);
  const form = $("report-filters");
  const dialog = $("report-export-dialog");
  const chart = window.PortalReportCharts.chart;
  let applied = null;
  let report = null;
  let detailPage = 1;
  let pending = false;
  const el = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = String(text); if (className) element.className = className; return element; };
  const hours = (value) => value === null || value === undefined ? "N/A" : value > 0 && value < .01 ? "<0.01 h" : `${value.toFixed(2)} h`;
  function date(value) { const time = service.timestamp(value); return time === null ? "N/A" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(time)); }
  function table(parent, title, columns, rows, className = "report-data-table") {
    const wrap = el("div", undefined, "staff-table-wrap"); wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", `${title}, scroll for more columns`);
    const element = el("table", undefined, `staff-table ${className}`); element.append(el("caption", title, "visually-hidden")); const head = el("thead"); const tr = el("tr");
    columns.forEach((label) => { const cell = el("th", label); cell.scope = "col"; tr.append(cell); }); head.append(tr); const body = el("tbody");
    rows.forEach((cells) => { const row = el("tr"); cells.forEach((value) => { const cell = el("td"); if (value instanceof Node) cell.append(value); else cell.textContent = String(value ?? "N/A"); row.append(cell); }); body.append(row); });
    element.append(head, body); wrap.append(element); parent.replaceChildren(wrap);
    if (!rows.length) parent.append(el("p", "No matching records for this report.", "staff-empty"));
  }
  function metrics(parent, entries) { parent.replaceChildren(); entries.forEach(([label, value]) => { const group = el("div"); group.append(el("dt", label), el("dd", value)); parent.append(group); }); }
  function rawFilters() { return Object.fromEntries(["start", "end", "service", "program", "status", "aggregation"].map((name) => [name, form.elements[name].value])); }
  function options() { return { page: detailPage, query: $("report-detail-search").value, sort: $("report-detail-sort").value }; }
  function dirty() {
    const changed = applied && JSON.stringify(rawFilters()) !== JSON.stringify(applied);
    $("report-filter-dirty").hidden = !changed;
    $("report-export-open").disabled = Boolean(changed) || pending || !report;
    return changed;
  }
  function setPreset() {
    if (form.elements.preset.value === "custom") return;
    const range = service.preset(form.elements.preset.value); form.elements.start.value = range.start; form.elements.end.value = range.end;
  }
  window.PortalRequestService.SERVICES.forEach((name) => form.elements.service.append(new Option(name, name)));
  window.PortalRequestService.STATUSES.forEach((name) => form.elements.status.append(new Option(name, name)));
  $("report-export-type").append(new Option("Authorized Support Summary", "support"));
  function serviceTable() {
    const rows = [...report.servicePerformance]; const sort = $("report-service-sort").value;
    rows.sort((a, b) => sort === "service" ? a.documentType.localeCompare(b.documentType) : sort === "average" ? (b.duration.hours ?? -1) - (a.duration.hours ?? -1) : b[sort] - a[sort]);
    table($("report-service-table"), "Service performance: submission cohort versus release events", ["Document Type", "Submitted in Period", "Currently Pending (cohort)", "Currently Processing (cohort)", "Recorded Releases in Period", "Approval → Release Mean", "Valid / Excluded"], rows.map((row) => [row.documentType, row.total, row.pending, row.processing, row.released, `${hours(row.duration.hours)}${row.duration.eligible === 1 ? " · Single observation" : ""}`, `${row.duration.eligible} / ${row.duration.excluded}`]));
  }
  function render() {
    const R = report; const caps = R.capabilities;
    $("report-content").hidden = false;
    $("report-period").textContent = `${R.filters.start} to ${R.filters.end}, inclusive Asia/Manila · ${R.filters.service || "All Services"} · ${R.filters.status || "All Request Statuses"} · ${R.filters.program || "All Programs"} · Generated ${date(R.generatedAt)}`;
    $("report-overview").replaceChildren();
    [["Total Requests", R.overview.total, "document", "pending", "Submitted during period"], ["Pending Requests", R.overview.pending, "clock", "pending", "Currently Pending Review in submission cohort"], ["In Processing", R.overview.processing, "file-clock", "processing", "Current Processing in submission cohort"], ["Released Documents", R.overview.released, "file-check", "released", "Actual release date in period; submission may be earlier"], ["Total Appointments", R.overview.appointments, "calendar", "ready", "Current scheduled appointment date in period"], ["Average Processing Time", hours(R.overview.average.hours), "clock", "processing", `Approval → release, elapsed hours. ${R.overview.average.eligible} valid; ${R.overview.average.excluded} excluded.${R.overview.average.eligible === 1 ? " Single observation, not a trend." : ""}`]].forEach(([label, value, icon, tone, note]) => {
      const card = el("article", undefined, `staff-stat-card staff-stat-${tone}`); card.dataset.reportMetric = label;
      const span = el("span", undefined, "staff-stat-icon"); const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true"); const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#icon-${icon}`); svg.append(use); span.append(svg);
      card.append(span, el("p", label), el("strong", value), el("small", note)); $("report-overview").append(card);
    });
    $("report-definitions").replaceChildren(...R.definitions.map((definition) => el("li", definition)));
    $("report-quality").textContent = `Source-wide: ${R.quality.invalidStoredRequests} invalid request rows rejected by the shared source. Under current service/status/program filters (all dates): ${R.quality.invalidSubmissionDates} invalid/future submission dates; ${R.quality.invalidAppointmentDates} invalid appointment dates; ${R.quality.legacyReleasedWithoutSnapshot} legacy Released requests without snapshots; ${R.quality.invalidReleaseSnapshots} invalid/duplicate release snapshots excluded.${R.quality.memoryOnly ? " Requests are memory-only; refresh may lose changes." : ""}${!R.facets.programSourceAvailable ? " Student program source is unavailable; only All Programs can be reported." : ""}`;
    const currentProgram = form.elements.program.value; form.elements.program.replaceChildren(new Option("All Programs", "")); R.facets.programs.forEach((program) => form.elements.program.append(new Option(program, program))); form.elements.program.value = currentProgram; form.elements.program.disabled = !R.facets.programSourceAvailable;
    const status = Object.fromEntries(R.requests.byStatus.map((row) => [row.label, row.value])); const S = window.PortalRequestService.STATUS;
    metrics($("report-request-metrics"), [["Submitted requests", R.overview.total], ["Current Approved in cohort", status[S.APPROVED]], ["Current Rejected in cohort", status[S.REJECTED]], ["Current Ready for Pickup in cohort", status[S.READY]], ["Current Released in cohort (includes legacy)", status[S.RELEASED]], ["Current Cancelled in cohort", status[S.CANCELLED]], ["Recorded approval activity in period", R.requests.approvalActivity], ["Recorded rejection activity in period", R.requests.rejectionActivity]]);
    $("report-request-charts").replaceChildren(chart("Requests by Document Type", R.requests.byService), chart("Requests by Current Status", R.requests.byStatus, "donut"), chart("Request Submission Trends", R.requests.trend, "line", { description: `${R.filters.aggregation} aggregation, request submission dates.` }));
    metrics($("report-appointment-metrics"), [["Total appointments by scheduled date", R.appointments.total], ["Upcoming in selected date cohort", R.appointments.upcoming], ["Current Completed", R.appointments.completed], ["Current Cancelled", R.appointments.cancelled], ["Current No Show", R.appointments.noShow], ["Actual reschedule events during period", R.appointments.reschedules]]);
    $("report-appointment-charts").replaceChildren(chart("Appointment Date Trends", R.appointments.trend, "line"), chart("Appointment Status Distribution", R.appointments.byStatus, "donut"), chart("Appointments by Service Type", R.appointments.byService));
    metrics($("report-processing-metrics"), [["Approved awaiting processing (cohort)", R.processing.awaiting], ["Currently Processing (cohort)", R.processing.processing], ["Ready for Pickup (cohort)", R.processing.ready]]);
    const names = service.intervalLabels;
    table($("report-intervals"), "Measured processing intervals", ["Interval", "Mean Elapsed Hours", "Valid Records", "Excluded Missing / Invalid"], Object.entries(R.processing.intervals).map(([name, measurement]) => [names[name], hours(measurement.hours), measurement.eligible, measurement.excluded]));
    $("report-processing-charts").replaceChildren(chart("Processing Starts by Document Type", R.processing.startsByService), chart("Observed Approval-to-Release Mean by Service", R.processing.averagesByService, "bar", { unit: "hours", measured: true, empty: "No service has at least two valid completed observations. Single observations remain in the service table, not a performance trend.", description: "Requires at least two valid release-period observations per service; no efficiency ranking or SLA is implied." }));
    metrics($("report-release-metrics"), [["Recorded released requests", R.releases.total], ["Known copies released", R.releases.total === 0 || R.releases.knownQuantityRecords ? R.releases.knownCopies : "N/A"], ["Release records with unknown quantities", R.releases.unknownQuantityRecords], ["Currently awaiting pickup (submission cohort)", R.processing.ready]]);
    $("report-release-charts").replaceChildren(chart("Monthly Document Releases", R.releases.monthly), chart("Releases by Service", R.releases.byService), chart("Recorded Release Date Trends", R.releases.trend, "line"));
    $("report-release-staff").replaceChildren(R.releases.byStaff ? chart("Releases by Staff (authorized)", R.releases.byStaff) : el("p", "Staff-level release metrics require a separate reporting capability.", "demo-note"));
    serviceTable();
    if (R.support?.available) {
      metrics($("report-support-metrics"), [["Submitted tickets (authorized scope)", R.support.total], ["Current Open", R.support.open], ["Current In Progress", R.support.progress], ["Current Waiting for Student", R.support.waiting], ["Current Resolved", R.support.resolved], ["Current Closed", R.support.closed], ["Unique tickets resolved during period", R.support.resolvedDuringPeriod], ["Mean first staff response (creation cohort)", `${hours(R.support.firstResponse.hours)} · ${R.support.firstResponse.eligible} valid / ${R.support.firstResponse.excluded} excluded`], ["Mean creation → latest resolution during period", `${hours(R.support.resolution.hours)} · ${R.support.resolution.eligible} valid / ${R.support.resolution.excluded} excluded`]]);
      $("report-support-chart").replaceChildren();
    } else { $("report-support-metrics").replaceChildren(); $("report-support-chart").textContent = "Support analytics are unavailable in your authorized scope."; }
    [...$("report-export-type").options].find((option) => option.value === "support").disabled = !R.support?.available;
    $("report-details-restricted").hidden = Boolean(R.details); $("report-details-controls").hidden = !R.details;
    if (R.details) {
      detailPage = R.details.page;
      const keys = ["id", ...(caps.includes("studentIdentifiers") ? ["studentNumber"] : []), "documentType", "submittedAt", "status", "approvedAt", "processingStartedAt", "readyAt", "releasedAt", "durationHours", ...(caps.includes("staffMetrics") ? ["responsibleStaff"] : [])];
      const labels = { id: "Request ID", studentNumber: "Student Number", documentType: "Document Type", submittedAt: "Submission Date", status: "Current Status", approvedAt: "Approval Date", processingStartedAt: "Processing Start", readyAt: "Ready Date", releasedAt: "Actual Release Date", durationHours: "Approval → Release", responsibleStaff: "Responsible Staff" };
      table($("report-detail-table"), "Detailed submitted requests", [...keys.map((key) => labels[key]), "Actions"], R.details.rows.map((row) => {
        const cells = keys.map((key) => key.endsWith("At") ? date(row[key]) : key === "durationHours" ? hours(row[key]) : row[key] || "N/A");
        const view = el("button", "View Request", "secondary-button"); view.type = "button"; view.addEventListener("click", () => context.openRequest(row.id)); cells.push(view); return cells;
      }), "report-detail-table");
      $("report-detail-count").textContent = `${R.details.total} matching submitted requests`; $("report-detail-page").textContent = `Page ${R.details.page} of ${R.details.pages}`;
      $("report-detail-prev").disabled = R.details.page <= 1; $("report-detail-next").disabled = R.details.page >= R.details.pages;
    } else $("report-detail-table").replaceChildren();
    $("report-export-open").hidden = !caps.includes("export"); $("report-export-detailed-option").hidden = !caps.includes("details"); $("report-export-detailed-option").disabled = !caps.includes("details"); dirty();
    if (!caps.includes("details") && $("report-export-type").value === "detailed") $("report-export-type").value = "requests";
  }
  function load() {
    if (!context.current() || !applied) return;
    const view = document.querySelector('[data-view="staff-reports"]'); view.setAttribute("aria-busy", "true");
    try { report = service.generate(applied, options()); $("report-feedback").textContent = ""; render(); }
    catch (error) { report = null; $("report-feedback").textContent = error.message; $("report-content").hidden = true; $("report-export-open").disabled = true; }
    finally { view.removeAttribute("aria-busy"); }
  }
  form.addEventListener("input", (event) => { if (["start", "end"].includes(event.target.name)) form.elements.preset.value = "custom"; if (event.target.name === "preset") setPreset(); dirty(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    try { applied = service.validateFilters(rawFilters()); detailPage = 1; load(); } catch (error) { $("report-feedback").textContent = error.message; dirty(); }
  });
  form.addEventListener("reset", () => setTimeout(() => { setPreset(); detailPage = 1; $("report-detail-search").value = ""; $("report-detail-sort").value = "newest"; if (!context.current()) return; applied = service.validateFilters(rawFilters()); load(); }, 0));
  $("report-service-sort").addEventListener("change", () => { if (report) serviceTable(); });
  $("report-detail-search").addEventListener("input", () => { detailPage = 1; load(); }); $("report-detail-sort").addEventListener("change", () => { detailPage = 1; load(); });
  $("report-detail-prev").addEventListener("click", () => { detailPage--; load(); }); $("report-detail-next").addEventListener("click", () => { detailPage++; load(); });
  $("report-export-open").addEventListener("click", () => {
    if (dirty() || !report) return;
    $("report-export-feedback").textContent = ""; $("report-export-period").textContent = `${applied.start} to ${applied.end}, inclusive Asia/Manila.`; dialog.showModal(); $("report-export-cancel").focus();
  });
  $("report-export-cancel").addEventListener("click", () => dialog.close()); dialog.addEventListener("close", () => { if (document.querySelector("#staff-screen").dataset.currentPage === "staff-reports") $("report-export-open").focus(); });
  $("report-export-form").addEventListener("submit", (event) => {
    event.preventDefault(); if (pending || dirty()) return;
    pending = true; $("report-export-confirm").disabled = true;
    try {
      const dataset = service.exportData($("report-export-type").value, applied, options());
      const url = URL.createObjectURL(new Blob([window.PortalReportExport.csv(dataset)], { type: "text/csv;charset=utf-8" }));
      const link = el("a"); link.href = url; link.download = dataset.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      dialog.close(); $("report-feedback").textContent = "CSV download requested using the applied filters. No report file or secure export audit was saved in browser storage.";
    } catch (error) { $("report-export-feedback").textContent = error.message; }
    finally { setTimeout(() => { pending = false; $("report-export-confirm").disabled = false; dirty(); }, 1000); }
  });
  document.addEventListener("portal:staffpagechange", (event) => { if (event.detail === "staff-reports") { if (!applied) { setPreset(); applied = service.validateFilters(rawFilters()); } load(); } });
  ["portal:requestschanged", "portal:appointmentschanged", "portal:supportchanged"].forEach((event) => document.addEventListener(event, () => { if (document.querySelector("#staff-screen").dataset.currentPage === "staff-reports") load(); }));
  window.addEventListener("storage", (event) => { if (event.key === null || event.key === "rtu.portal.accounts" || event.key?.startsWith("rtu.portal.profile.")) { if (document.querySelector("#staff-screen").dataset.currentPage === "staff-reports") load(); } });
  document.addEventListener("portal:logout", () => {
    applied = null; report = null; detailPage = 1; if (dialog.open) dialog.close(); $("report-content").hidden = true; form.reset(); form.elements.program.replaceChildren(new Option("All Programs", ""));
    ["report-detail-table", "report-overview", "report-feedback", "report-period", "report-definitions", "report-quality", "report-request-metrics", "report-request-charts", "report-appointment-metrics", "report-appointment-charts", "report-processing-metrics", "report-intervals", "report-processing-charts", "report-release-metrics", "report-release-charts", "report-release-staff", "report-service-table"].forEach((id) => $(id).replaceChildren());
    $("report-support-metrics").replaceChildren(); $("report-support-chart").replaceChildren();
  });
  setPreset();
  if (context.current() && document.querySelector("#staff-screen").dataset.currentPage === "staff-reports") { applied = service.validateFilters(rawFilters()); load(); }
};
