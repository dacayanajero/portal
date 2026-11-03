"use strict";

window.initializeStaffStudentRecords = () => {
  const service = window.PortalStudentRecordService;
  const context = window.PortalStaffContext;
  const $ = (id) => document.getElementById(id);
  const filters = $("student-directory-filters");
  const route = "#/staff/student-records";
  let page = 1;
  let selected = "";
  let tab = "personal";
  let origin = null;
  let historyPage = {};
  let lastStudent = "";
  const tabs = [...document.querySelectorAll("[data-student-tab]")];
  function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function button(text, action) {
    const control = el("button", text, "secondary-button"); control.type = "button";
    control.addEventListener("click", action); return control;
  }
  function date(value) {
    return !value || Number.isNaN(new Date(value).getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
  }
  function navigateStudent(number, source = null) {
    if (context.current()?.account?.role !== "staff") return;
    origin = source ? { ...source, studentNumber: number } : null;
    const hash = `${route}/${encodeURIComponent(number)}`;
    if (location.hash === hash) renderRoute(true);
    else location.hash = hash;
  }
  function directory() {
    const values = Object.fromEntries(new FormData(filters));
    const result = service.search({ ...values, page }); page = result.page;
    for (const field of ["program", "yearLevel", "semester"]) {
      const select = filters.elements[field]; const current = select.value;
      const label = field === "program" ? "All programs" : field === "yearLevel" ? "All year levels" : "All semesters";
      select.replaceChildren(new Option(label, ""));
      result.facets[field].forEach((value) => select.append(new Option(value, value)));
      if (current && !result.facets[field].includes(current)) select.append(new Option(current, current));
      select.value = current;
    }
    $("student-record-stats").replaceChildren();
    [["total", "Total Students", "users", "pending"], ["active", "Students With Active Requests", "document", "processing"], ["upcoming", "Students With Upcoming Appointments", "calendar", "ready"], ["released", "Students With Released Documents", "file-check", "released"]].forEach(([key, label, icon, tone]) => {
      const card = el("article", undefined, `staff-stat-card staff-stat-${tone}`);
      const symbol = el("span", undefined, "staff-stat-icon");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#icon-${icon}`); svg.append(use); symbol.append(svg);
      card.append(symbol, el("p", label), el("strong", result.summary[key])); $("student-record-stats").append(card);
    });
    $("student-directory-rows").replaceChildren();
    result.students.forEach((student) => {
      const row = el("tr");
      [student.studentNumber, student.fullName, student.program, student.yearLevel, student.semester, "Not officially verified", student.activeRequests].forEach((value) => row.append(el("td", value === "" ? "Not provided" : value)));
      const action = el("td"); const open = button("View Student Record", () => navigateStudent(student.studentNumber));
      open.dataset.studentNumber = student.studentNumber; open.setAttribute("aria-label", `View Student Record for ${student.fullName}`);
      action.append(open); row.append(action); $("student-directory-rows").append(row);
    });
    $("student-directory-empty").hidden = result.total > 0;
    $("student-directory-empty").textContent = result.summary.total ? "No students match these search and filter settings." : "No registered student accounts are available in this browser. Student registration does not verify enrollment.";
    $("student-directory-count").textContent = `${result.total} student${result.total === 1 ? "" : "s"} found`;
    $("student-directory-page").textContent = `Page ${result.page} of ${result.pages}`;
    $("student-directory-prev").disabled = result.page <= 1; $("student-directory-next").disabled = result.page >= result.pages;
  }
  function grid(parent, entries) {
    const list = el("dl", undefined, "student-record-grid");
    entries.forEach(([label, value, source]) => {
      const group = el("div"); const description = el("dd", value || "Not provided");
      if (source) description.append(el("small", source)); group.append(el("dt", label), description); list.append(group);
    }); parent.append(list);
  }
  function openRequest(id) { context.openRequest(id); }
  function openAppointment(id) { document.dispatchEvent(new CustomEvent("portal:appointmentopen", { detail: id })); }
  function openRelease(id) { document.dispatchEvent(new CustomEvent("portal:documentopen", { detail: id })); }
  function requestActions(request) {
    const actions = el("div", undefined, "student-record-actions");
    actions.append(button("View Request", () => openRequest(request.id)));
    const status = window.PortalRequestService.STATUS;
    if ([status.APPROVED, status.PROCESSING, status.READY].includes(request.status)) actions.append(button("View Processing", () => openRelease(request.id)));
    return actions;
  }
  function showTab(name, focus = false) {
    tab = name;
    tabs.forEach((control) => {
      const active = control.dataset.studentTab === tab; control.setAttribute("aria-selected", String(active)); control.tabIndex = active ? 0 : -1;
      $(control.getAttribute("aria-controls")).hidden = !active;
      if (active && focus) control.focus();
    });
  }
  function historyTable(panel, name, columns, list, values, action) {
    panel.replaceChildren(el("h4", name));
    if (!list.length) { panel.append(el("p", `No ${name.toLowerCase()} records are available for this student.`, "staff-empty")); return; }
    const wrap = el("div", undefined, "staff-table-wrap"); wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", `${name} table, scroll for more columns`);
    const table = el("table", undefined, "staff-table student-record-history-table"); const head = el("thead"); const header = el("tr");
    columns.forEach((label) => { const cell = el("th", label); cell.scope = "col"; header.append(cell); }); head.append(header);
    const body = el("tbody"); const pages = Math.ceil(list.length / 8); const current = Math.min(historyPage[tab] || 1, pages);
    list.slice((current - 1) * 8, current * 8).forEach((record) => {
      const row = el("tr"); values(record).forEach((value) => { const cell = el("td"); cell.append(value instanceof Node ? value : el("span", value || "Not recorded")); row.append(cell); });
      const actions = el("td"); actions.append(action(record)); row.append(actions); body.append(row);
    });
    table.append(el("caption", name, "visually-hidden"), head, body); wrap.append(table); panel.append(wrap);
    const pager = el("div", undefined, "staff-request-pagination");
    const previous = button("Previous records", () => { historyPage[tab] = current - 1; renderDetail(); $(`student-panel-${tab}`).focus(); }); previous.disabled = current <= 1;
    const next = button("Next records", () => { historyPage[tab] = current + 1; renderDetail(); $(`student-panel-${tab}`).focus(); }); next.disabled = current >= pages;
    pager.append(el("p", `${list.length} records · Page ${current} of ${pages}`), previous, next); panel.append(pager);
  }
  function historyEvents(record) {
    const details = el("details"); details.append(el("summary", "Recorded lifecycle history"));
    const list = el("ol", undefined, "student-record-history-events");
    record.history.forEach((event) => list.append(el("li", `${date(event.timestamp)} · ${event.action}${event.status ? ` · ${event.status}` : ""}${event.actor ? ` · ${event.actor}` : ""}`)));
    if (!record.history.length) list.append(el("li", "No lifecycle events recorded.")); details.append(list); return details;
  }
  function renderDetail() {
    const data = service.get(selected);
    if (!data) {
      $("student-record-detail").hidden = true; $("student-directory").hidden = true;
      $("student-record-feedback").replaceChildren(el("span", "Student record is unavailable in the authorized account source. "), button("Back to directory", () => { location.hash = route; }));
      return false;
    }
    const student = data.student;
    $("student-record-name").textContent = student.fullName || "Not provided";
    $("student-record-number").textContent = `Student No. ${student.studentNumber}`;
    $("student-record-source").textContent = student.source;
    const fieldLabels = { fullName: "full name", email: "email", program: "program", yearLevel: "year level", semester: "semester" };
    $("student-record-completeness").textContent = `${student.completeness}${student.missingFields.length ? ` · Not provided: ${student.missingFields.map((field) => fieldLabels[field]).join(", ")}` : ""}. Pending Official Verification.`;
    $("student-record-discrepancy").textContent = `${student.profileUnavailable ? "Saved profile is unavailable or invalid; showing registration fields. " : ""}For discrepancies in a submitted request, open its Request Management record and use the existing correction workflow when eligible. Profile changes remain student-managed.`;
    const personal = $("student-panel-personal"); personal.replaceChildren(el("h4", "Personal Information"));
    grid(personal, [["Full name", student.fullName, student.provenance.fullName], ["Student number", student.studentNumber, "Registered account identifier"], ["University email / registered email", student.email, student.provenance.email], ["Program/Course", student.program, student.provenance.program], ["Year level", student.yearLevel, student.provenance.yearLevel], ["Semester", student.semester, student.provenance.semester], ["Profile last saved", student.profileUpdatedAt ? date(student.profileUpdatedAt) : "Not recorded", "Not an official verification date"]]);
    const academic = $("student-panel-academic"); academic.replaceChildren(el("h4", "Academic & Enrollment Information"), el("p", student.enrollment, "demo-note"));
    grid(academic, [["Student number", student.studentNumber], ["Program/Course", student.program, "Self-reported"], ["Year level", student.yearLevel, "Self-reported"], ["Current semester", student.semester, "Self-reported"], ["Enrollment verification", "Pending Official Verification"], ["Last officially verified", "Not available — authoritative source not connected"]]);
    // Histories are paginated independently; tab selection never alters source records.
    const activeTab = tab;
    tab = "requests";
    historyTable($("student-panel-requests"), "Document Request History", ["Request ID", "Document Type", "Submission Date", "Purpose", "Current Status", "History", "Actions"], data.requests, (request) => [request.id, request.documentType, date(request.submittedAt), request.purpose, request.status, historyEvents(request)], requestActions);
    tab = "appointments";
    historyTable($("student-panel-appointments"), "Appointment History", ["Appointment ID", "Related Request", "Service", "Appointment Date", "Time Slot", "Status", "Booking Date", "History", "Actions"], data.appointments, (appointment) => [appointment.id, appointment.requestId, appointment.serviceType, `${appointment.date}${appointment.upcoming ? " · Upcoming" : ""}`, `${appointment.start}–${appointment.end}`, appointment.status, date(appointment.bookingDate), historyEvents(appointment)], (appointment) => button("View Appointment", () => openAppointment(appointment.id)));
    tab = "releases";
    historyTable($("student-panel-releases"), "Document Release History", ["Release Reference", "Request ID", "Document Type", "Copies", "Release Date", "Released By", "Recipient Type", "Actions"], data.releases, (release) => [release.reference || "Legacy record — reference not recorded", release.requestId, release.documentType, release.copies, date(release.timestamp), release.actor, release.recipientType || "Not recorded"], (release) => button("View Release Record", () => openRelease(release.requestId)));
    tab = activeTab; showTab(tab);
    const quick = $("student-record-quick-actions");
    quick.replaceChildren(
      button("View Active Requests", () => document.dispatchEvent(new CustomEvent("portal:studentrequests", { detail: selected }))),
      button("View Appointments", () => document.dispatchEvent(new CustomEvent("portal:studentappointments", { detail: selected }))),
      button("View Released Documents", () => document.dispatchEvent(new CustomEvent("portal:studentreleases", { detail: selected }))),
      button("Review Available Enrollment Information", () => showTab("academic", true)),
    );
    $("student-record-origin").replaceChildren();
    if (origin) {
      $("student-record-origin").append(el("span", `Opened from ${origin.type} ${origin.id}`), button(`Return to ${origin.type}`, () => origin.type === "request" ? openRequest(origin.id) : origin.type === "appointment" ? openAppointment(origin.id) : openRelease(origin.id)));
    }
    const timeline = $("student-record-timeline"); timeline.replaceChildren();
    data.timeline.slice(0, 50).forEach((event) => {
      const item = el("li"); const time = el("time", date(event.timestamp)); time.dateTime = event.timestamp;
      item.append(el("strong", event.action), time, el("small", `${event.type} · ${event.reference}${event.actor ? ` · ${event.actor}` : ""}`)); timeline.append(item);
    });
    $("student-record-timeline-count").textContent = data.timeline.length ? `Showing ${Math.min(50, data.timeline.length)} of ${data.timeline.length} actual lifecycle events. Full histories are available in each history section.` : "No request or appointment activity has been recorded.";
    $("student-record-detail").hidden = false; $("student-directory").hidden = true;
    return true;
  }
  function renderRoute(focus = false) {
    if (context.current()?.account?.role !== "staff") return;
    if (document.querySelector("#staff-screen").dataset.currentPage !== "staff-records") return;
    const view = document.querySelector('[data-view="staff-records"]');
    view.setAttribute("aria-busy", "true"); $("student-record-feedback").textContent = "";
    try {
      directory();
      const match = location.hash.match(/^#\/staff\/student-records\/([^/]+)$/);
      const number = match ? decodeURIComponent(match[1]) : "";
      if (origin && origin.studentNumber !== number) origin = null;
      if (number !== selected) { selected = number; historyPage = {}; tab = "personal"; }
      if (number) {
        lastStudent = number;
        if (renderDetail() && focus) $("student-record-name").focus();
      } else {
        selected = ""; $("student-directory").hidden = false; $("student-record-detail").hidden = true;
        if (focus) ([...document.querySelectorAll("[data-student-number]")].find((control) => control.dataset.studentNumber === lastStudent) || $("student-directory-title")).focus();
      }
    } catch {
      $("student-record-feedback").replaceChildren(el("span", "Student records could not be read. Check browser storage and try again. "), button("Retry", () => renderRoute(true)));
      $("student-directory-rows").replaceChildren(); $("student-record-stats").replaceChildren();
      $("student-record-detail").hidden = true; $("student-directory").hidden = true;
    } finally { view.removeAttribute("aria-busy"); }
  }
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("input", () => { page = 1; renderRoute(); });
  filters.addEventListener("reset", () => setTimeout(() => { page = 1; renderRoute(); }, 0));
  $("student-directory-prev").addEventListener("click", () => { page--; renderRoute(); });
  $("student-directory-next").addEventListener("click", () => { page++; renderRoute(); });
  $("student-record-back").addEventListener("click", () => { origin = null; location.hash = route; });
  tabs.forEach((control, index) => {
    control.addEventListener("click", () => showTab(control.dataset.studentTab));
    control.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); showTab(tabs[next].dataset.studentTab, true); }
    });
  });
  document.addEventListener("portal:studentrecordopen", (event) => navigateStudent(event.detail.studentNumber, event.detail.origin));
  document.addEventListener("portal:staffpagechange", (event) => { if (event.detail === "staff-records") renderRoute(true); });
  ["portal:requestschanged", "portal:appointmentschanged", "portal:profilechange"].forEach((name) => document.addEventListener(name, () => {
    if (document.querySelector("#staff-screen").dataset.currentPage === "staff-records") renderRoute();
  }));
  window.addEventListener("storage", (event) => { if (event.key === null || event.key === "rtu.portal.accounts" || event.key?.startsWith("rtu.portal.profile.")) renderRoute(); });
  document.addEventListener("portal:logout", () => {
    selected = ""; lastStudent = ""; origin = null; page = 1; tab = "personal"; historyPage = {}; filters.reset();
    $("student-directory-rows").replaceChildren(); $("student-record-stats").replaceChildren();
    ["student-record-name", "student-record-number", "student-record-source", "student-record-completeness", "student-record-discrepancy", "student-record-origin", "student-record-quick-actions", "student-record-feedback", "student-record-timeline-count"].forEach((id) => $(id).replaceChildren());
    ["program", "yearLevel", "semester"].forEach((field) => filters.elements[field].replaceChildren(new Option("All", "")));
    tabs.forEach((control) => $(control.getAttribute("aria-controls")).replaceChildren());
    $("student-record-detail").hidden = true; $("student-record-timeline").replaceChildren();
  });
  if (context.current()) renderRoute();
};
