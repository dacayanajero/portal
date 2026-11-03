"use strict";

window.initializeStudentHelp = () => {
  const support = window.PortalSupportService; const faq = window.PortalFAQService; const ui = window.PortalSupportUI;
  const $ = (id) => document.getElementById(id); const search = $("student-help-search"); const form = $("student-support-create-form"); const dialog = $("student-support-create-dialog");
  let page = 1; let token = crypto.randomUUID();
  const account = () => window.PortalProfile.snapshot().account;
  const groupIcons = Object.freeze({ "General Academic Services": "icon-document", "Document Requests": "icon-file-check", "Appointments": "icon-calendar-clock", "Student Records": "icon-folder", "Account and Login": "icon-user", "Portal Technical Support": "icon-settings" });
  const groupOrder = Object.freeze(["General Academic Services", "Document Requests", "Appointments", "Student Records", "Account and Login", "Portal Technical Support"]);
  const groupNames = () => [...groupOrder, ...window.PortalSupportPolicy.categories.filter((category) => !groupOrder.includes(category))];
  const icon = (name) => { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true"); const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#${name}`); svg.append(use); return svg; };
  window.PortalSupportPolicy.categories.forEach((category) => { form.elements.category.append(new Option(category, category)); });
  function renderFAQs() {
    if (account()?.role !== "student") return;
    try {
      const query = search.elements.query.value; const entries = faq.search(query); const container = $("student-help-faqs"); container.replaceChildren();
      groupNames().forEach((category) => {
        const matches = entries.filter((entry) => entry.category === category); if (!matches.length) return;
        const group = ui.el("section", undefined, "help-faq-group");
        const heading = ui.el("h3", category, "help-faq-heading"); heading.prepend(icon(groupIcons[category] || "icon-help"));
        const list = ui.el("div", undefined, "help-faq-group-list");
        matches.forEach((entry) => { const item = ui.el("details", undefined, "help-faq-item"); item.append(ui.el("summary", entry.question), ui.faqCard(entry, false, true)); list.append(item); });
        group.append(heading, list); container.append(group);
      });
      $("student-help-empty").hidden = entries.length > 0; $("student-help-feedback").textContent = query.trim() ? `${entries.length} published help ${entries.length === 1 ? "answer" : "answers"} found` : "";
    } catch (error) { $("student-help-feedback").textContent = error.message; $("student-help-faqs").replaceChildren(); }
  }
  function renderTickets() {
    if (account()?.role !== "student") return;
    try {
      const all = support.listStudent(); const pages = Math.max(1, Math.ceil(all.length / 6)); page = Math.min(page, pages); $("student-support-tickets").replaceChildren();
      all.slice((page - 1) * 6, page * 6).forEach((ticket) => { const card = ui.el("article", undefined, "support-ticket-card"); card.append(ui.el("h4", ticket.subject), ui.el("p", ticket.id), ui.el("span", ticket.status, "support-status"), ui.el("p", `${ticket.category} · Submitted ${ui.date(ticket.createdAt)} · Last staff response: ${ticket.lastResponseAt ? ui.date(ticket.lastResponseAt) : "No response recorded"}`), ui.button("View Conversation", () => ui.open(ticket.id))); $("student-support-tickets").append(card); });
      $("student-support-empty").hidden = all.length > 0; $("student-support-count").textContent = `${all.length} inquiries belonging to your account`; $("student-support-page").textContent = `Page ${page} of ${pages}`; $("student-support-prev").disabled = page <= 1; $("student-support-next").disabled = page >= pages;
    } catch (error) { $("student-support-feedback").textContent = error.message; $("student-support-tickets").replaceChildren(); }
  }
  function advisories() {
    if (account()?.role !== "student") return;
    try { const entries = window.PortalAnnouncementService.publicFeed().filter((entry) => ["Academic Services", "Appointment Advisories", "System Maintenance", "Document Requests"].includes(entry.category)).slice(0, 3); $("student-help-advisories").replaceChildren(); entries.forEach((entry) => $("student-help-advisories").append(ui.button(entry.title, () => document.dispatchEvent(new CustomEvent("portal:announcementopen", { detail: entry.id }))))); if (!entries.length) $("student-help-advisories").append(ui.el("p", "No current published service advisories.")); } catch { $("student-help-advisories").textContent = "Published advisories are currently unavailable."; }
  }
  $("student-contact-support").addEventListener("click", () => {
    const snapshot = window.PortalProfile.snapshot(); if (snapshot.account?.role !== "student") return;
    $("support-student-name").value = snapshot.values.fullName || snapshot.account.fullName; $("support-student-number").value = snapshot.account.accountNumber; $("support-student-email").value = snapshot.values.email || snapshot.account.email || "Not provided";
    const previousRequest = form.elements.requestId.value; const previousAppointment = form.elements.appointmentId.value;
    form.elements.requestId.replaceChildren(new Option("No related request", "")); window.PortalRequestService.listForStudent(snapshot.account.accountNumber).forEach((request) => form.elements.requestId.append(new Option(`${request.id} · ${request.documentType}`, request.id))); form.elements.requestId.value = previousRequest;
    form.elements.appointmentId.replaceChildren(new Option("No related appointment", "")); window.PortalAppointmentService.listForStudent(snapshot.account.accountNumber).forEach((appointment) => form.elements.appointmentId.append(new Option(`${appointment.id} · ${appointment.serviceType} · ${appointment.date}`, appointment.id))); form.elements.appointmentId.value = previousAppointment;
    $("student-support-create-feedback").textContent = ""; dialog.showModal(); form.elements.category.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault(); const submit = $("student-support-create-submit"); submit.disabled = true;
    try { const ticket = support.create(Object.fromEntries(new FormData(form)), token); token = crypto.randomUUID(); form.reset(); dialog.close(); page = 1; renderTickets(); $("student-support-feedback").textContent = `Inquiry ${ticket.id} saved in this browser. It was not sent to a university office.`; }
    catch (error) { $("student-support-create-feedback").textContent = error.message; } finally { submit.disabled = false; }
  });
  $("student-support-create-close").addEventListener("click", () => dialog.close()); dialog.addEventListener("close", () => $("student-contact-support").focus());
  search.addEventListener("submit", (event) => event.preventDefault()); search.addEventListener("input", renderFAQs);
  $("student-support-prev").addEventListener("click", () => { page--; renderTickets(); }); $("student-support-next").addEventListener("click", () => { page++; renderTickets(); });
  document.addEventListener("portal:pagechange", (event) => { if (event.detail === "help") { renderFAQs(); renderTickets(); advisories(); } }); document.addEventListener("portal:accountchange", () => { renderFAQs(); renderTickets(); advisories(); });
  document.addEventListener("portal:faqschanged", renderFAQs); document.addEventListener("portal:supportchanged", renderTickets); document.addEventListener("portal:announcementschanged", advisories);
  document.addEventListener("portal:logout", () => { page = 1; token = crypto.randomUUID(); form.reset(); search.reset(); if (dialog.open) dialog.close(); ["student-help-faqs", "student-support-tickets", "student-help-advisories", "student-support-feedback", "student-help-feedback"].forEach((id) => $(id).replaceChildren()); });
  renderFAQs(); renderTickets(); advisories();
};
