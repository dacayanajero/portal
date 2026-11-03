"use strict";

window.initializeSupportUI = () => {
  const service = window.PortalSupportService;
  const $ = (id) => document.getElementById(id);
  const dialog = $("support-conversation-dialog"); const confirmation = $("support-confirm-dialog");
  let selected = ""; let pendingOpen = ""; let confirmAction = null; let opener = null; let token = "";
  const drafts = new Map();
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
  const button = (label, handler) => { const item = el("button", label, "secondary-button"); item.type = "button"; item.addEventListener("click", handler); return item; };
  const date = (value) => window.PortalReportService.timestamp(value) === null ? "Not recorded" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
  const staffRole = () => window.PortalStaffContext.current()?.account?.role === "staff";
  function ask(title, summary, callback, reasonLabel = "Remarks or resolution summary (optional)") {
    $("support-confirm-title").textContent = title; $("support-confirm-summary").textContent = summary; $("support-confirm-reason-label").hidden = reasonLabel === null; if (reasonLabel !== null) $("support-confirm-reason-label").firstChild.textContent = reasonLabel;
    $("support-confirm-reason").value = ""; $("support-confirm-feedback").textContent = ""; confirmAction = callback; confirmation.showModal(); $("support-confirm-cancel").focus();
  }
  function captureDraft() {
    const input = $("support-reply-text"); if (selected && input) drafts.set(selected, { text: input.value, mode: $("support-reply-mode")?.value || "reply" });
  }
  function getTicket() { return staffRole() ? service.getStaff(selected) : service.getStudent(selected); }
  function render() {
    captureDraft(); const ticket = getTicket(); if (!ticket) throw new Error("This ticket is unavailable to your account.");
    const isStaff = staffRole(); const caps = isStaff ? service.capabilities() : [];
    $("support-conversation-title").textContent = `${ticket.subject} · ${ticket.id}`;
    const body = $("support-conversation-body"); body.replaceChildren();
    const info = el("dl", undefined, "support-info-grid");
    [["Student", ticket.studentName], ["Student number", ticket.studentNumber], ["Email", ticket.email], ["Category", ticket.category], ["Submitted", date(ticket.createdAt)], ["Status", ticket.status], ["Priority", ticket.priority], ["Assigned staff", ticket.assignedStaff || "Unassigned"]].forEach(([label, value]) => { if (value === undefined) return; const group = el("div"); group.append(el("dt", label), el("dd", value)); info.append(group); }); body.append(info);
    if (ticket.requestId || ticket.appointmentId) {
      const related = el("section"); related.append(el("h4", "Related records"));
      if (isStaff) {
        const records = service.related(ticket.id);
        if (records.request) related.append(el("p", `${records.request.id} · ${records.request.documentType} · ${records.request.status}`), button("View Request", () => { dialog.close(); window.PortalStaffContext.openRequest(records.request.id); }));
        if (records.appointment) related.append(el("p", `${records.appointment.id} · ${records.appointment.date} · ${records.appointment.start}–${records.appointment.end} · ${records.appointment.serviceType} · ${records.appointment.status}`), button("View Appointment", () => { dialog.close(); document.dispatchEvent(new CustomEvent("portal:appointmentopen", { detail: records.appointment.id })); }));
        if (!records.request && !records.appointment) related.append(el("p", "Related source records are no longer available."));
      } else related.append(el("p", [ticket.requestId, ticket.appointmentId].filter(Boolean).join(" · ")), button("Open My Request", () => { dialog.close(); location.hash = "#/my-request"; }));
      body.append(related);
    }
    const messages = el("ol", undefined, "support-messages");
    ticket.messages.forEach((message) => { const item = el("li", undefined, `support-message${message.role === "staff" ? " is-staff" : ""}`); item.append(el("strong", message.sender), el("small", `${message.role} · ${date(message.timestamp)}`), el("p", message.text)); messages.append(item); }); body.append(el("h4", "Support conversation"), messages);
    if (ticket.notes) {
      const notes = el("section", undefined, "support-notes"); notes.append(el("h4", "Internal staff notes — not visible to students"));
      ticket.notes.forEach((note) => { const item = el("div", undefined, "support-note"); item.append(el("p", note.text), el("small", `${note.sender} · ${date(note.timestamp)}`)); notes.append(item); }); if (!ticket.notes.length) notes.append(el("p", "No internal notes recorded.")); body.append(notes);
    }
    if (![service.STATUS.RESOLVED, service.STATUS.CLOSED].includes(ticket.status) && (!isStaff || caps.includes("reply") || caps.includes("note"))) {
      const form = el("form"); form.id = "support-reply-form";
      if (isStaff) { const modeLabel = el("label", "Response visibility"); const mode = el("select"); mode.id = "support-reply-mode"; if (caps.includes("reply")) mode.append(new Option("Reply to Student — visible to the student", "reply")); if (caps.includes("note")) mode.append(new Option("Internal Staff Note — staff only", "note")); modeLabel.append(mode); form.append(modeLabel); mode.value = drafts.get(selected)?.mode || mode.options[0].value; }
      const label = el("label", "Message"); const input = el("textarea"); input.id = "support-reply-text"; input.required = true; input.maxLength = 5000; input.rows = 4; input.value = drafts.get(selected)?.text || ""; label.append(input);
      const submit = el("button", isStaff ? "Save Response / Note" : "Send Reply", "primary-button"); submit.type = "submit"; form.append(label, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault(); submit.disabled = true;
        try { service.reply(selected, input.value, { revision: ticket.revision, token, internal: $("support-reply-mode")?.value === "note" }); drafts.delete(selected); token = crypto.randomUUID(); if ($("support-reply-text")) $("support-reply-text").value = ""; render(); $("support-conversation-feedback").textContent = "Saved in this browser. No external delivery is claimed."; }
        catch (error) { $("support-conversation-feedback").textContent = error.message; }
        finally { submit.disabled = false; }
      }); body.append(form);
    }
    if (isStaff && ticket.status !== service.STATUS.CLOSED && (caps.includes("assign") || caps.includes("manage"))) {
      const controls = el("form"); const changes = {};
      if (caps.includes("assign")) { const label = el("label", "Assigned staff (eligible provisioned demo accounts)"); const select = el("select"); select.append(new Option("Unassigned", "")); service.eligibleStaff().forEach((account) => select.append(new Option(account.fullName, account.accountNumber))); select.value = ticket.assignedStaffId; label.append(select); controls.append(label); changes.assignedStaffId = select; }
      if (caps.includes("manage")) { const label = el("label", "Ticket priority (explicit staff choice)"); const select = el("select"); window.PortalSupportPolicy.priorities.forEach((priority) => select.append(new Option(priority, priority))); select.value = ticket.priority; label.append(select); controls.append(label); changes.priority = select; }
      const submit = el("button", "Save Assignment / Priority", "secondary-button"); submit.type = "submit"; controls.append(submit); controls.addEventListener("submit", (event) => { event.preventDefault(); try { service.update(selected, Object.fromEntries(Object.entries(changes).map(([key, control]) => [key, control.value])), { revision: ticket.revision }); $("support-conversation-feedback").textContent = "Assignment/priority saved in this browser."; } catch (error) { $("support-conversation-feedback").textContent = error.message; } }); body.append(controls);
    }
    const actions = el("div", undefined, "support-actions");
    (service.TRANSITIONS[ticket.status] || []).forEach((target) => {
      const cap = target === service.STATUS.RESOLVED ? "resolve" : target === service.STATUS.CLOSED ? "close" : target === service.STATUS.OPEN ? "reopen" : "manage";
      if (isStaff ? !caps.includes(cap) : ticket.status !== service.STATUS.RESOLVED || !window.PortalSupportPolicy.allowStudentReopenResolved) return;
      const label = target === service.STATUS.RESOLVED ? "Mark as Resolved" : target === service.STATUS.CLOSED ? "Close Ticket" : target === service.STATUS.OPEN ? "Reopen Ticket" : `Move to ${target}`;
      actions.append(button(label, () => ask(label, `${ticket.id} · ${ticket.subject}. Academic requests and appointments will not be changed.`, (reason) => { service.transition(selected, target, { revision: ticket.revision, confirmed: true, reason }); $("support-conversation-feedback").textContent = "Ticket status saved in this browser."; }, "Resolution summary / remarks (visible to the student, optional)")));
    }); body.append(actions);
    if (ticket.resolutions.length) { body.append(el("h4", "Preserved resolution summaries")); ticket.resolutions.forEach((resolution) => body.append(el("p", `${date(resolution.timestamp)} · ${resolution.actor} · ${resolution.summary || "No summary provided"}`))); }
    const history = el("ol", undefined, "support-history"); ticket.history.slice().reverse().forEach((entry) => { const row = el("li"); row.append(el("strong", entry.action), el("time", date(entry.timestamp)), el("small", `${entry.actor} · ${entry.previousStatus || "New"} → ${entry.newStatus}`)); if (entry.remarks) row.append(el("p", entry.remarks)); history.append(row); }); body.append(el("h4", "Support activity history"), history);
  }
  function open(ticketId) {
    captureDraft(); if (selected !== ticketId) $("support-conversation-body").replaceChildren(); selected = ticketId; token = crypto.randomUUID(); opener = document.activeElement; $("support-conversation-feedback").textContent = "";
    try { render(); if (!dialog.open) dialog.showModal(); $("support-conversation-title").focus(); }
    catch (error) { if (dialog.open) dialog.close(); $("support-conversation-body").replaceChildren(); selected = ""; const feedback = document.querySelector(staffRole() ? "#staff-support-feedback" : "#student-support-feedback"); if (feedback) feedback.textContent = error.message; }
    if (dialog.open) { try { service.notifications().filter((notice) => notice.ticketId === ticketId && notice.unread).forEach((notice) => service.markRead(notice.id)); } catch { $("support-conversation-feedback").textContent = "Conversation loaded, but its notification read state could not be saved."; } }
  }
  function focusPageHeading() {
    const screen = document.querySelector(staffRole() ? "#staff-screen" : "#dashboard-screen");
    screen?.querySelector(`[data-view="${screen.dataset.currentPage}"] h2`)?.focus();
  }
  $("support-conversation-close").addEventListener("click", () => dialog.close()); dialog.addEventListener("close", () => { captureDraft(); if (opener?.getClientRects().length) opener.focus(); else if (!document.querySelector(".portal-dialog[open]")) focusPageHeading(); });
  $("support-confirm-cancel").addEventListener("click", () => confirmation.close());
  $("support-confirm-form").addEventListener("submit", (event) => { event.preventDefault(); const submit = $("support-confirm-submit"); submit.disabled = true; try { confirmAction?.($("support-confirm-reason").value); confirmation.close(); } catch (error) { $("support-confirm-feedback").textContent = error.message; } finally { submit.disabled = false; } });
  confirmation.addEventListener("close", () => { confirmAction = null; if (dialog.open) $("support-conversation-title").focus(); else if ($("staff-faq-editor")?.open) $("staff-faq-editor-title").focus(); else if ($("staff-faq-details")?.open) $("staff-faq-details-title").focus(); else if (!document.querySelector(".portal-dialog[open]")) focusPageHeading(); });
  document.addEventListener("portal:supportchanged", () => { if (dialog.open) { try { render(); } catch (error) { $("support-conversation-feedback").textContent = error.message; $("support-conversation-body").replaceChildren(); $("support-conversation-title").textContent = "Support conversation unavailable"; dialog.close(); } } });
  document.addEventListener("portal:supportticketopen", (event) => {
    pendingOpen = event.detail;
    const page = staffRole() ? "staff-help-support" : "help";
    const screen = document.querySelector(staffRole() ? "#staff-screen" : "#dashboard-screen");
    if (screen.dataset.currentPage === page) { const ticketId = pendingOpen; pendingOpen = ""; open(ticketId); }
    else if (staffRole()) window.PortalStaffContext.navigate(page); else location.hash = "#/help";
  });
  ["portal:staffpagechange", "portal:pagechange"].forEach((name) => document.addEventListener(name, (event) => { if (["help", "staff-help-support"].includes(event.detail) && pendingOpen) { const ticketId = pendingOpen; pendingOpen = ""; open(ticketId); } }));
  document.addEventListener("portal:logout", () => { selected = ""; pendingOpen = ""; drafts.clear(); if (dialog.open) dialog.close(); if (confirmation.open) confirmation.close(); $("support-conversation-body").replaceChildren(); $("support-conversation-title").textContent = "Support conversation"; $("support-conversation-feedback").textContent = ""; $("support-confirm-summary").textContent = ""; $("support-confirm-reason").value = ""; });
  function faqCard(entry, preview = false, compact = false) {
    const card = el("article"); if (!compact) card.append(el("h4", entry.question)); card.append(el("p", entry.answer, "support-faq-answer")); if (!compact) card.append(el("p", `${entry.category} · ${preview ? "Preview — unpublished changes" : `Published version ${entry.version || 1} · ${entry.publisher || "Portal guide"}`}`, "support-faq-meta"));
    const routes = { "Grade Slip": "#/services/grade-slip", "Registration Form": "#/services/registration-form", "ID Printing": "#/services/id-printing", "Transcript of Records": "#/services", "Certificate of Enrollment": "#/services" };
    if (!preview && window.PortalProfile?.snapshot()?.account?.role === "student" && routes[entry.relatedService]) { const link = el("a", `Open ${entry.relatedService}`, "secondary-button"); link.href = routes[entry.relatedService]; card.append(link); }
    return card;
  }
  window.PortalSupportUI = Object.freeze({ open, ask, el, button, date, faqCard });
};
