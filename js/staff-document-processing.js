"use strict";

window.initializeStaffDocumentProcessing = () => {
  const service = window.PortalRequestService;
  const policy = window.PortalDocumentPolicy;
  const status = service.STATUS;
  const context = window.PortalStaffContext;
  const $ = (id) => document.getElementById(id);
  const filters = $("document-filters");
  const dialog = $("document-details");
  const confirmation = $("document-confirm");
  let tab = "queue";
  let studentScope = "";
  const scopeNotice = document.createElement("p");
  scopeNotice.className = "demo-note";
  $("document-feedback").before(scopeNotice);
  let page = 1;
  let selected = "";
  let pendingOpenId = "";
  let pending = "";
  let opener = null;
  let confirmationOpener = null;
  const pageSize = 10;
  const titles = { queue: "Processing Queue", pickup: "Ready for Pickup", history: "Release History" };

  function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function button(text, action, primary = false) {
    const control = el("button", text, primary ? "primary-button" : "secondary-button");
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }
  function actor() {
    const current = context.current();
    if (current?.account?.role !== "staff") throw new Error("Sign in as authorized staff to continue.");
    return { role: "staff", accountNumber: current.account.accountNumber, name: current.profile.fullName || current.account.fullName };
  }
  function date(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return "—";
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
  }
  function day(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).formatToParts(new Date(value));
    const part = (type) => parts.find((entry) => entry.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  function queueDate(request) {
    return tab === "history" ? request.release?.timestamp || request.releasedAt : tab === "pickup" ? request.readyAt : request.approvedAt;
  }
  function records() {
    // One queue entry per shared request identifier, even after legacy imports.
    return [...new Map(service.listAll().map((request) => [request.id, request])).values()];
  }
  function filtered() {
    const values = new FormData(filters);
    const query = String(values.get("search") || "").trim().toLowerCase();
    return records().filter((request) => {
      const eligible = tab === "history" ? request.status === status.RELEASED : tab === "pickup" ? request.status === status.READY : [status.APPROVED, status.PROCESSING, status.READY].includes(request.status);
      const eventDay = day(queueDate(request));
      return eligible && service.SERVICES.includes(request.documentType) && (!studentScope || request.studentNumber === studentScope)
        && (!query || [request.id, request.studentName, request.studentNumber, request.release?.reference].some((value) => String(value || "").toLowerCase().includes(query)))
        && (!values.get("service") || request.documentType === values.get("service"))
        && (!values.get("from") || eventDay && eventDay >= values.get("from"))
        && (!values.get("to") || eventDay && eventDay <= values.get("to"));
    }).sort((a, b) => (new Date(queueDate(a) || 0) - new Date(queueDate(b) || 0)) * (values.get("sort") === "oldest" ? 1 : -1));
  }
  function option(select, value, label = value) { select.append(new Option(label, value)); }
  service.SERVICES.forEach((name) => option(filters.elements.service, name));

  function render() {
    if (!context.current()) return;
    scopeNotice.textContent = studentScope ? `Document records for student ${studentScope}. Use Clear Filters to view all students.` : "";
    const all = records();
    $("document-stats").replaceChildren();
    [[status.APPROVED, "Awaiting Processing", "pending", "clipboard"], [status.PROCESSING, "In Processing", "processing", "file-clock"], [status.READY, "Ready for Pickup", "ready", "package-check"], [status.RELEASED, "Released Documents", "released", "file-check"]].forEach(([state, label, tone, icon]) => {
      const card = el("article", undefined, `staff-stat-card staff-stat-${tone}`);
      const symbol = el("span", undefined, "staff-stat-icon");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#icon-${icon}`); svg.append(use); symbol.append(svg);
      card.append(symbol, el("p", label), el("strong", all.filter((request) => request.status === state && service.SERVICES.includes(request.documentType)).length));
      $("document-stats").append(card);
    });
    $("document-table-caption").textContent = titles[tab];
    document.querySelectorAll("[data-document-tab]").forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.documentTab === tab)));
    $("document-export").hidden = tab !== "history" || !policy.exportAllowed;
    const headers = tab === "history"
      ? ["Release Reference", "Request ID", "Student Name", "Document Type", "Copies Released", "Released To", "Release Date", "Released By", "Actions"]
      : tab === "pickup" ? ["Request ID", "Student Name", "Student Number", "Document Type", "Copies", "Date Ready", "Pickup Appointment", "Release Status", "Actions"]
        : ["Request ID", "Student Name", "Student Number", "Document Type", "Date Approved", "Actions"];
    const head = el("tr");
    headers.forEach((label) => { const cell = el("th", label); cell.scope = "col"; head.append(cell); });
    $("document-columns").replaceChildren(head);
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / pageSize)); page = Math.min(page, pages);
    $("document-rows").replaceChildren();
    list.slice((page - 1) * pageSize, page * pageSize).forEach((request) => {
      const row = el("tr");
      const release = request.release;
      const appointment = window.PortalAppointmentService.getByRequest(request.id);
      const values = tab === "history"
        ? [release?.reference || "Legacy record — no release reference", request.id, release?.studentName || request.studentName, release?.documentType || request.documentType, release?.copies || "—", release ? `${release.recipientName} · ${release.recipientType}` : "Not recorded", date(release?.timestamp || request.releasedAt), release?.actor || request.releasedBy || "Not recorded"]
        : tab === "pickup" ? [request.id, request.studentName, request.studentNumber, request.documentType, request.details.copies || "—", date(request.readyAt), appointment ? `${appointment.id} · ${appointment.date} · ${appointment.start}–${appointment.end} · ${appointment.status}` : "Not scheduled", service.verificationComplete(request) ? "Recipient verified · awaiting handover" : "Awaiting recipient verification"]
          : [request.id, request.studentName, request.studentNumber, request.documentType, date(request.approvedAt)];
      values.forEach((value) => row.append(el("td", value)));
      const actions = el("td");
      actions.append(button(tab === "history" ? "View Release Details" : "View / Manage", () => open(request.id)));
      row.append(actions); $("document-rows").append(row);
    });
    $("document-empty").hidden = list.length > 0;
    $("document-result-count").textContent = `${list.length} document${list.length === 1 ? "" : "s"}`;
    $("document-page").textContent = `Page ${page} of ${pages}`;
    $("document-prev").disabled = page <= 1; $("document-next").disabled = page >= pages;
  }
  function section(title, parent) {
    const container = el("section"); container.append(el("h4", title)); parent.append(container); return container;
  }
  function fields(parent, entries) {
    const grid = el("dl", undefined, "document-detail-grid");
    entries.forEach(([label, value]) => {
      if (value === "" || value === null || value === undefined) return;
      const group = el("div"); group.append(el("dt", label), el("dd", value)); grid.append(group);
    });
    parent.append(grid);
  }
  function check(label, id) {
    const wrapper = el("label", undefined, "document-check");
    const input = el("input"); input.type = "checkbox"; if (id) input.value = id;
    wrapper.append(input, el("span", label)); return { wrapper, input };
  }
  function report(error) { $("document-details-feedback").textContent = error.message || String(error); }
  function showDetails() {
    const request = service.get(selected);
    if (!request || !context.current()) { dialog.close(); return; }
    const focusedCheck = document.activeElement?.dataset.preparationCheck;
    const body = $("document-details-body"); body.replaceChildren();
    $("document-details-title").textContent = `${request.id} · ${request.documentType}`;
    const student = section("Student information", body);
    fields(student, [["Full name", request.studentName], ["Student number", request.studentNumber], ["Program/Course", request.program], ["Year level", request.yearLevel], ["Semester", request.semester]]);
    student.append(el("p", "Student-entered request snapshot; official enrollment verification is not connected.", "demo-note"));
    student.append(button("View Student Record", () => {
      dialog.close();
      document.dispatchEvent(new CustomEvent("portal:studentrecordopen", { detail: { studentNumber: request.studentNumber, origin: { type: "document", id: request.id } } }));
    }));
    const documentInfo = section("Document information", body);
    fields(documentInfo, [["Request ID", request.id], ["Document type", request.documentType], ["Purpose", request.purpose], ["Academic year", request.details.academicYear], ["Requested semester", request.details.requestedSemester || request.details.semester], ["Copies", request.details.copies], ["Submitted", date(request.submittedAt)], ["Approved", request.approvedAt && date(request.approvedAt)], ["Current status", request.status]]);
    const processing = section("Preparation & processing", body);
    fields(processing, [["Assigned staff", request.assignedStaff], ["Processing started", request.processingStartedAt && date(request.processingStartedAt)], ["Ready for pickup", request.readyAt && date(request.readyAt)]]);
    const preparation = policy.services[request.documentType];
    const checks = request.processing.checks || {};
    const complete = preparation?.items.filter((item) => checks[item.id]?.checked && checks[item.id].version === policy.version).length || 0;
    if (!preparation?.configured) processing.append(el("p", "Preparation workflow requires configuration. The following examples are not official RTU requirements; marking ready is blocked.", "demo-note"));
    else {
      if (preparation.developmentOnly) processing.append(el("p", "Development preparation checklist · These example checks support this browser prototype and are not official RTU verification requirements.", "demo-note"));
      processing.append(el("p", `${complete} of ${preparation.items.length} preparation checks completed · policy ${policy.version}`));
    }
    const progress = el("progress"); progress.max = preparation?.items.length || 1; progress.value = complete; progress.setAttribute("aria-label", "Preparation checklist completion"); processing.append(progress);
    (preparation?.items || []).forEach((item) => {
      const control = check(`${item.label}${item.required ? " (required)" : " (optional)"}`);
      control.input.dataset.preparationCheck = item.id;
      control.input.checked = Boolean(checks[item.id]?.checked && checks[item.id].version === policy.version);
      control.input.disabled = !preparation.configured || request.status !== status.PROCESSING;
      if (checks[item.id]) control.wrapper.lastChild.append(el("small", `${checks[item.id].actor} · ${date(checks[item.id].timestamp)}`));
      control.input.addEventListener("change", async () => {
        const checked = control.input.checked;
        const requestId = selected;
        control.input.disabled = true;
        $("document-details-feedback").textContent = "Saving preparation check to Supabase…";
        try {
          const result = await service.savePreparationCheck(requestId, item.id, checked, actor());
          if (selected === requestId && dialog.open) {
            showDetails();
            saved(result);
          }
        } catch (error) {
          if (selected === requestId && dialog.open) {
            control.input.checked = !checked;
            report(error);
          }
        } finally {
          if (selected === requestId && control.input.isConnected) control.input.disabled = false;
        }
      });
      processing.append(control.wrapper);
    });
    const actions = el("div", undefined, "document-actions");
    if (request.status === status.APPROVED) actions.append(button("Start Processing", () => confirm(status.PROCESSING), true));
    if (request.status === status.PROCESSING) {
      const ready = button("Mark Ready for Pickup", () => confirm(status.READY), true);
      ready.disabled = !service.preparationComplete(request);
      if (ready.disabled) {
        const hint = el("p", preparation?.configured ? "Complete all required preparation checks above to enable Mark Ready for Pickup." : "Configure the preparation workflow to enable Mark Ready for Pickup.", "demo-note");
        hint.id = "document-readiness-hint";
        ready.setAttribute("aria-describedby", hint.id);
        ready.title = hint.textContent;
        processing.append(hint);
      }
      actions.append(ready);
    }
    if (request.status === status.READY) {
      renderVerification(request, body);
      const release = button("Release Document", () => confirm(status.RELEASED), true);
      release.disabled = !service.verificationComplete(request); actions.append(release);
    }
    processing.append(actions);
    const appointment = window.PortalAppointmentService.getByRequest(request.id);
    if (appointment) {
      const related = section("Related appointment (independent lifecycle)", body);
      fields(related, [["Appointment ID", appointment.id], ["Date", appointment.date], ["Time slot", `${appointment.start}–${appointment.end}`], ["Status", appointment.status]]);
      related.append(button("Open Appointment Management", () => { dialog.close(); context.navigate("staff-appointments"); }));
    }
    if (request.release) {
      const released = section("Release record · read only", body);
      fields(released, [["Release reference", request.release.reference], ["Copies released", request.release.copies], ["Released to", `${request.release.recipientName} · ${request.release.recipientType}`], ["Released", date(request.release.timestamp)], ["Released by", request.release.actor], ["Verification reference", request.release.verificationReference], ["Handover", "Explicitly confirmed by releasing staff"]]);
    } else if (request.status === status.RELEASED) {
      section("Legacy release record", body).append(el("p", "This request was previously marked Released. Recipient verification and handover records were not recorded by Phase D; no details have been fabricated."));
    }
    const notes = section("Internal processing notes · staff only", body);
    (request.processing.notes || []).forEach((note) => {
      const item = el("p", note.text); item.style.whiteSpace = "pre-wrap"; item.append(el("small", ` — ${note.actor} · ${date(note.timestamp)}`)); notes.append(item);
    });
    if (!(request.processing.notes || []).length) notes.append(el("p", "No internal notes recorded."));
    if ([status.PROCESSING, status.READY].includes(request.status)) {
      const form = el("form");
      const label = el("label", "Add an internal note (not visible to students)");
      const input = el("textarea"); input.required = true; input.maxLength = 1000; input.rows = 3; label.append(input);
      const submit = el("button", "Save internal note", "secondary-button"); submit.type = "submit";
      form.append(label, submit);
      form.addEventListener("submit", (event) => { event.preventDefault(); try { saved(service.addProcessingNote(selected, input.value, actor())); showDetails(); } catch (error) { report(error); } });
      notes.append(form);
    }
    const timeline = section("Recorded activity timeline", body);
    const list = el("ol", undefined, "document-timeline");
    [...request.history, ...(request.processing.events || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach((entry) => {
      const item = el("li"); const time = el("time", date(entry.timestamp)); time.dateTime = entry.timestamp;
      item.append(el("strong", entry.action), time);
      if (entry.actor) item.append(el("small", entry.actor));
      if (entry.remarks) item.append(el("p", entry.remarks)); list.append(item);
    });
    timeline.append(list);
    if (focusedCheck) [...body.querySelectorAll("[data-preparation-check]")].find((input) => input.dataset.preparationCheck === focusedCheck)?.focus({ preventScroll: true });
  }
  function renderVerification(request, parent) {
    const container = section("Verify recipient before release", parent);
    if (!policy.verification.allowRepresentative) container.append(el("p", "Representative collection is not configured. Release is restricted to the requesting student.", "demo-note"));
    if (service.verificationComplete(request)) {
      const verification = request.recipientVerification;
      fields(container, [["Verified recipient", verification.recipientName], ["Recipient type", verification.recipientType], ["Method", verification.methodLabel], ["Verified by", verification.actor], ["Verified at", date(verification.timestamp)], ["Reference", verification.reference]]); return;
    }
    if (!policy.verification.configured || !policy.verification.methods.length) {
      container.append(el("p", "Identity verification requires approved configuration. No official verification methods are configured; release is blocked.", "demo-note")); return;
    }
    fields(container, [["Student name", request.studentName], ["Student number", request.studentNumber], ["Request ID", request.id], ["Document", request.documentType], ["Copies", request.details.copies]]);
    const form = el("form");
    const typeLabel = el("label", "Recipient type"); const type = el("select"); option(type, "Requesting Student");
    if (policy.verification.allowRepresentative) option(type, "Authorized Representative"); typeLabel.append(type);
    const nameLabel = el("label", "Representative name (only when permitted)"); const name = el("input"); name.type = "text"; name.maxLength = 150; nameLabel.append(name); nameLabel.hidden = true;
    type.addEventListener("change", () => { nameLabel.hidden = type.value !== "Authorized Representative"; name.required = !nameLabel.hidden; });
    const methodLabel = el("label", "Approved verification method"); const method = el("select"); method.required = true; option(method, "", "Select a method");
    policy.verification.methods.forEach((entry) => option(method, entry.id, entry.label)); methodLabel.append(method);
    const requirements = policy.verification.releaseChecks.map((item) => { const control = check(item.label, item.id); control.input.required = true; return control; });
    const confirmed = check("I confirm that I completed the selected approved verification method for this recipient."); confirmed.input.required = true;
    const submit = el("button", "Record Recipient Verification", "primary-button"); submit.type = "submit";
    form.append(typeLabel, nameLabel, methodLabel, ...requirements.map((item) => item.wrapper), confirmed.wrapper, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try { saved(service.verifyRecipient(selected, { recipientType: type.value, recipientName: name.value, methodId: method.value, confirmed: confirmed.input.checked, requirements: requirements.filter((item) => item.input.checked).map((item) => item.input.value) }, actor())); showDetails(); }
      catch (error) { report(error); }
    }); container.append(form);
  }
  function saved(result) {
    $("document-details-feedback").textContent = result.persisted
      ? "Saved to Supabase."
      : "The change was not saved to Supabase.";
  }
  function open(id) {
    try { actor(); } catch { return; }
    selected = id; opener = document.activeElement; $("document-details-feedback").textContent = "";
    showDetails(); if (!dialog.open) dialog.showModal(); $("document-details-title").focus();
  }
  function confirm(target) {
    const request = service.get(selected); if (!request) return;
    pending = target; confirmationOpener = document.activeElement;
    $("document-confirm-title").textContent = target === status.PROCESSING ? "Start Processing?" : target === status.READY ? "Mark Ready for Pickup?" : "Confirm Document Release";
    const verification = request.recipientVerification;
    $("document-confirm-summary").textContent = `${request.id} · ${request.studentName} · ${request.documentType} · Copies: ${request.details.copies || "not specified"}. Responsible staff: ${actor().name}.${target === status.RELEASED ? ` Verified recipient: ${verification?.recipientName} (${verification?.recipientType}). Verification: ${verification?.reference || "incomplete"}. Confirm only after the actual handover.` : " This will update the shared request status and create an in-app student notice."}`;
    $("document-handover-label").hidden = target !== status.RELEASED;
    $("document-handover").checked = false; $("document-handover").required = target === status.RELEASED;
    $("document-confirm-feedback").textContent = ""; confirmation.showModal(); $("document-confirm-cancel").focus();
  }
  $("document-confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = $("document-confirm-submit"); submit.disabled = true;
    const requestId = selected;
    try {
      const result = await service.updateStatus(requestId, pending, actor(), { handoverConfirmed: $("document-handover").checked });
      if (selected === requestId) {
        confirmation.close();
        showDetails();
        saved(result);
      }
    } catch (error) { $("document-confirm-feedback").textContent = error.message; }
    finally { submit.disabled = false; }
  });
  $("document-confirm-cancel").addEventListener("click", () => confirmation.close());
  confirmation.addEventListener("close", () => { pending = ""; if (confirmationOpener?.isConnected) confirmationOpener.focus(); else $("document-details-title").focus(); });
  $("document-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (opener?.isConnected) opener.focus(); else $("document-processing-title").focus(); });
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("input", () => { page = 1; render(); });
  filters.addEventListener("reset", () => { studentScope = ""; setTimeout(() => { page = 1; render(); }, 0); });
  $("document-prev").addEventListener("click", () => { page--; render(); });
  $("document-next").addEventListener("click", () => { page++; render(); });
  document.querySelectorAll("[data-document-tab]").forEach((control) => control.addEventListener("click", () => { tab = control.dataset.documentTab; page = 1; render(); }));
  $("document-export").addEventListener("click", () => {
    try {
      actor(); if (!policy.exportAllowed || tab !== "history") return;
      // Escape formula prefixes as well as CSV delimiters; exclude student numbers and verification methods.
      const csv = (value) => `"${String(value ?? "").replace(/^[\s]*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
      const rows = [["Release Reference", "Request ID", "Document", "Copies", "Release Date", "Released By"], ...filtered().filter((request) => request.release).map((request) => [request.release.reference, request.id, request.release.documentType, request.release.copies, request.release.timestamp, request.release.actor])];
      const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(csv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = el("a"); link.href = url; link.download = "document-release-history.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { $("document-feedback").textContent = error.message; }
  });
  document.addEventListener("portal:staffpagechange", (event) => {
    if (event.detail === "staff-document-processing") {
      render();
      if (pendingOpenId) {
        const id = pendingOpenId; pendingOpenId = ""; open(id);
      }
    }
    else { if (confirmation.open) confirmation.close(); if (dialog.open) dialog.close(); }
  });
  document.addEventListener("portal:documentopen", (event) => {
    if (!context.current()) return;
    pendingOpenId = event.detail;
    context.navigate("staff-document-processing");
  });
  document.addEventListener("portal:studentreleases", (event) => {
    if (!context.current()) return;
    filters.reset(); studentScope = event.detail; tab = "history"; page = 1;
    context.navigate("staff-document-processing"); render();
  });
  document.addEventListener("portal:requestschanged", () => { if (context.current()) { render(); if (dialog.open) showDetails(); } });
  document.addEventListener("portal:appointmentschanged", () => { if (context.current()) render(); });
  document.addEventListener("portal:staffaccountchange", () => { filters.reset(); selected = ""; tab = "queue"; page = 1; render(); });
  document.addEventListener("portal:logout", () => {
    studentScope = ""; scopeNotice.textContent = "";
    if (confirmation.open) confirmation.close(); if (dialog.open) dialog.close();
    selected = ""; pendingOpenId = ""; $("document-details-body").replaceChildren(); $("document-rows").replaceChildren();
  });
  if (context.current()) render();
};
