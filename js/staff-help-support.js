"use strict";

window.initializeStaffHelpSupport = () => {
  const tickets = window.PortalSupportService; const faqs = window.PortalFAQService; const ui = window.PortalSupportUI;
  const $ = (id) => document.getElementById(id); const filters = $("support-ticket-filters"); const faqFilters = $("staff-faq-filters"); const form = $("staff-faq-editor-form");
  const editor = $("staff-faq-editor"); const details = $("staff-faq-details");
  let tab = "tickets"; let page = 1; let faqPage = 1; let editing = null; let dirty = false; let baseline = ""; let token = "";
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const option = (select, value) => select.append(new Option(value, value));
  window.PortalSupportPolicy.categories.forEach((category) => { option(filters.elements.category, category); option(faqFilters.elements.category, category); option(form.elements.category, category); });
  Object.values(tickets.STATUS).forEach((status) => option(filters.elements.status, status)); window.PortalSupportPolicy.priorities.forEach((priority) => option(filters.elements.priority, priority));
  window.PortalRequestService.SERVICES.forEach((service) => option(form.elements.relatedService, service));
  function current() { return window.PortalStaffContext.current(); }
  function showTab(value) { tab = value; $("staff-support-tickets").hidden = value !== "tickets"; $("staff-support-faqs").hidden = value !== "faqs"; $("staff-support-knowledge").hidden = value !== "knowledge"; document.querySelectorAll("[data-support-tab]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.supportTab === value))); }
  function renderTickets() {
    const all = tickets.listStaff(); const summary = tickets.summary(all); const values = Object.fromEntries(new FormData(filters)); const query = normalize(values.query);
    const currentId = current().account.accountNumber;
    const previous = filters.elements.staff.value; filters.elements.staff.replaceChildren(new Option("All authorized assignments", ""), new Option("Assigned to me", "me"), new Option("Unassigned", "unassigned"));
    [...new Map(all.filter((ticket) => ticket.assignedStaffId).map((ticket) => [ticket.assignedStaffId, ticket.assignedStaff])).entries()].forEach(([number, name]) => filters.elements.staff.append(new Option(name, number))); if (previous && ![...filters.elements.staff.options].some((option) => option.value === previous)) filters.elements.staff.append(new Option(previous, previous)); filters.elements.staff.value = previous;
    $("support-stats").replaceChildren();
    [["total", "Total Inquiries", "chat", "pending"], ["open", "Open Tickets", "inbox", "pending"], ["progress", "In Progress", "clock", "processing"], ["resolved", "Resolved Tickets", "check-circle", "released"]].forEach(([key, label, icon, tone]) => {
      const card = ui.el("article", undefined, `staff-stat-card staff-stat-${tone}`); const symbol = ui.el("span", undefined, "staff-stat-icon"); const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true"); const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#icon-${icon}`); svg.append(use); symbol.append(svg); card.append(symbol, ui.el("p", label), ui.el("strong", summary[key])); $("support-stats").append(card);
    });
    $("support-stats-definition").textContent = `Your authorized scope: ${summary.open + summary.progress + summary.waiting} unresolved (${summary.waiting} Waiting for Student), ${summary.closed} Closed. Open/Resolved cards are current exact statuses; reopening returns to Open and preserves resolution history.`;
    const list = all.filter((ticket) => (!query || [ticket.id, ticket.studentName, ticket.studentNumber, ticket.subject].some((value) => normalize(value).includes(query))) && (!values.category || ticket.category === values.category) && (!values.status || ticket.status === values.status) && (!values.priority || ticket.priority === values.priority) && (!values.staff || (values.staff === "me" ? ticket.assignedStaffId === currentId : values.staff === "unassigned" ? !ticket.assignedStaffId : ticket.assignedStaffId === values.staff)) && (!values.from || window.PortalReportService.manilaDay(ticket.createdAt) >= values.from) && (!values.to || window.PortalReportService.manilaDay(ticket.createdAt) <= values.to)).sort((a, b) => (Date.parse(b.createdAt) - Date.parse(a.createdAt)) * (values.sort === "oldest" ? -1 : 1));
    const pages = Math.max(1, Math.ceil(list.length / 10)); page = Math.min(page, pages); $("support-ticket-rows").replaceChildren();
    list.slice((page - 1) * 10, page * 10).forEach((ticket) => { const row = ui.el("tr"); [ticket.id, ticket.studentName, ticket.studentNumber, ticket.subject, ticket.category, ui.date(ticket.createdAt), ticket.priority, ticket.status, ticket.assignedStaff || "Unassigned"].forEach((value) => row.append(ui.el("td", value))); const action = ui.el("td"); action.append(ui.button("View / Respond / Manage", () => ui.open(ticket.id))); row.append(action); $("support-ticket-rows").append(row); });
    $("support-ticket-empty").hidden = list.length > 0; $("support-ticket-count").textContent = `${list.length} authorized inquiries shown`; $("support-ticket-page").textContent = `Page ${page} of ${pages}`; $("support-ticket-prev").disabled = page <= 1; $("support-ticket-next").disabled = page >= pages;
  }
  function unpublished(record) { return record.published && ["question", "answer", "category", "relatedService"].some((field) => record[field] !== record.published[field]) || record.published && JSON.stringify(record.keywords) !== JSON.stringify(record.published.keywords); }
  function renderFAQs() {
    const records = faqs.list(); const values = Object.fromEntries(new FormData(faqFilters)); const query = faqs.normalize(values.query);
    const list = records.filter((record) => (!values.category || record.category === values.category) && (!values.status || record.status === values.status) && (!query || faqs.normalize([record.question, record.answer, ...record.keywords].join(" ")).includes(query)));
    const pages = Math.max(1, Math.ceil(list.length / 8)); faqPage = Math.min(faqPage, pages); $("staff-faq-rows").replaceChildren();
    list.slice((faqPage - 1) * 8, faqPage * 8).forEach((record) => { const row = ui.el("tr"); [record.id, record.question, record.category, `${record.answer.slice(0, 120)}${record.answer.length > 120 ? "…" : ""}`, `${record.status}${unpublished(record) ? " · Unpublished working changes" : ""}`, record.updatedBy, ui.date(record.updatedAt)].forEach((value) => row.append(ui.el("td", value))); const action = ui.el("td"); action.append(ui.button("View / Manage FAQ", () => { try { openFAQ(record.id); } catch (error) { $("staff-support-feedback").textContent = error.message; } })); row.append(action); $("staff-faq-rows").append(row); });
    $("staff-faq-empty").hidden = list.length > 0; $("staff-faq-count").textContent = `${list.length} FAQ records`; $("staff-faq-page").textContent = `Page ${faqPage} of ${pages}`; $("staff-faq-prev").disabled = faqPage <= 1; $("staff-faq-next").disabled = faqPage >= pages;
    $("staff-faq-create").hidden = !tickets.capabilities().includes("faqCreate"); $("staff-knowledge-list").replaceChildren();
    faqs.publicList().forEach((entry) => { const detail = ui.el("details"); detail.append(ui.el("summary", `${entry.question} · v${entry.version}`), ui.faqCard(entry), ui.el("p", `Keywords: ${entry.keywords.join(", ") || "None"}. Related service: ${entry.relatedService || "None"}.`, "support-faq-meta")); $("staff-knowledge-list").append(detail); });
  }
  function render() {
    if (!current()) return;
    try { renderTickets(); } catch (error) { $("staff-support-feedback").textContent = error.message; $("support-ticket-rows").replaceChildren(); $("support-stats").replaceChildren(); }
    try { renderFAQs(); } catch (error) { $("staff-support-feedback").textContent = error.message; $("staff-faq-rows").replaceChildren(); $("staff-knowledge-list").replaceChildren(); }
  }
  function input() { return Object.fromEntries(new FormData(form)); }
  function closeEditor() { if (dirty && !window.confirm("Discard unsaved FAQ changes?")) return false; dirty = false; editor.close(); return true; }
  function editFAQ(record = null) {
    if (!current() || !tickets.capabilities().includes("faqView") || !record && !tickets.capabilities().includes("faqCreate")) { $("staff-support-feedback").textContent = "FAQ editing is not authorized for this account."; return; }
    if (record && !faqs.editable(record)) { $("staff-support-feedback").textContent = "This FAQ is read-only for your account."; return; }
    if (details.open) details.close(); editing = record; token = crypto.randomUUID(); form.reset();
    ["question", "answer", "category", "relatedService"].forEach((key) => { form.elements[key].value = record?.[key] || ""; }); form.elements.keywords.value = record?.keywords.join(", ") || "";
    $("staff-faq-editor-title").textContent = record ? `Edit ${record.id}` : "Create FAQ"; $("staff-faq-editor-feedback").textContent = ""; $("staff-faq-publish").hidden = !tickets.capabilities().includes("faqPublish"); baseline = JSON.stringify(input()); dirty = false; editor.showModal(); form.elements.question.focus();
  }
  function saveFAQ(action) {
    if (!form.reportValidity()) return;
    try {
      const data = faqs.validate(input());
      const commit = () => { const saved = faqs.save(data, { id: editing?.id, revision: editing?.revision, token, action, confirmed: action === "publish" }); editing = saved; dirty = false; editor.close(); renderFAQs(); $("staff-support-feedback").textContent = action === "publish" ? "Published FAQ snapshot saved; student Help and the assistant use this version in this browser." : "Draft saved. Any previous published snapshot remains unchanged."; };
      if (action === "publish") ui.ask("Confirm FAQ Publication", `${data.question}. Publish this general portal guidance to students and the keyword-based assistant?`, commit, null); else commit();
    } catch (error) { $("staff-faq-editor-feedback").textContent = error.message; }
  }
  function openFAQ(faqId) {
    const record = faqs.get(faqId); if (!record) return;
    $("staff-faq-details-title").textContent = "FAQ Details & Versions"; const body = $("staff-faq-details-body"); body.replaceChildren(ui.faqCard(record, true), ui.el("p", `${record.id} · ${record.status}${unpublished(record) ? " · Has unpublished working changes" : ""}`));
    const actions = ui.el("div", undefined, "support-actions"); if (faqs.editable(record)) actions.append(ui.button("Edit FAQ", () => editFAQ(record)));
    if (record.status !== faqs.STATUS.ARCHIVED && tickets.capabilities().includes("faqArchive")) actions.append(ui.button("Archive FAQ", () => ui.ask("Archive FAQ", `${record.question}. Preserve versions and remove this entry from student Help and assistant matching?`, () => { faqs.archive(record.id, record.revision, true); details.close(); renderFAQs(); }, null)));
    body.append(actions, ui.el("h4", "Preserved published versions")); record.versions.slice().reverse().forEach((version) => { const item = ui.el("details"); item.append(ui.el("summary", `Version ${version.version} · ${ui.date(version.publishedAt)} · ${version.publisher}`), ui.faqCard(version)); body.append(item); });
    body.append(ui.el("h4", "FAQ activity history")); const history = ui.el("ol", undefined, "support-history"); record.history.slice().reverse().forEach((entry) => { const item = ui.el("li"); item.append(ui.el("strong", entry.action), ui.el("time", ui.date(entry.timestamp)), ui.el("small", entry.actor)); history.append(item); }); body.append(history); details.showModal(); $("staff-faq-details-title").focus();
  }
  document.querySelectorAll("[data-support-tab]").forEach((button) => button.addEventListener("click", () => { showTab(button.dataset.supportTab); render(); }));
  [filters, faqFilters].forEach((filter) => { filter.addEventListener("submit", (event) => event.preventDefault()); filter.addEventListener("input", () => { page = 1; faqPage = 1; render(); }); filter.addEventListener("reset", () => setTimeout(() => { page = 1; faqPage = 1; render(); }, 0)); });
  $("support-ticket-prev").addEventListener("click", () => { page--; renderTickets(); }); $("support-ticket-next").addEventListener("click", () => { page++; renderTickets(); }); $("staff-faq-prev").addEventListener("click", () => { faqPage--; renderFAQs(); }); $("staff-faq-next").addEventListener("click", () => { faqPage++; renderFAQs(); });
  $("staff-faq-create").addEventListener("click", () => editFAQ()); form.addEventListener("input", () => { dirty = JSON.stringify(input()) !== baseline; }); form.addEventListener("submit", (event) => { event.preventDefault(); saveFAQ("draft"); }); $("staff-faq-publish").addEventListener("click", () => saveFAQ("publish"));
  $("staff-faq-preview").addEventListener("click", () => { if (!form.reportValidity()) return; try { const data = faqs.validate(input()); $("staff-faq-details-title").textContent = "Unpublished FAQ Preview"; $("staff-faq-details-body").replaceChildren(ui.faqCard(data, true)); details.showModal(); $("staff-faq-details-title").focus(); } catch (error) { $("staff-faq-editor-feedback").textContent = error.message; } });
  $("staff-faq-editor-close").addEventListener("click", closeEditor); editor.addEventListener("cancel", (event) => { if (dirty && !window.confirm("Discard unsaved FAQ changes?")) event.preventDefault(); else dirty = false; });
  editor.addEventListener("close", () => { if (!$("support-confirm-dialog").open && !details.open && current() && document.querySelector("#staff-screen").dataset.currentPage === "staff-help-support") $("staff-help-support-title").focus(); });
  $("staff-faq-details-close").addEventListener("click", () => details.close()); details.addEventListener("close", () => { if (editor.open) $("staff-faq-preview").focus(); });
  $("staff-knowledge-test").addEventListener("submit", (event) => { event.preventDefault(); $("staff-knowledge-answer").textContent = faqs.answer(event.target.elements.question.value); });
  ["portal:staffbeforenavigate", "portal:staffbeforelogout"].forEach((name) => document.addEventListener(name, (event) => { if (editor.open && dirty) { if (!window.confirm("Discard unsaved FAQ changes before leaving?")) event.preventDefault(); else dirty = false; } }));
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("portal:staffpagechange", (event) => { if (event.detail === "staff-help-support") render(); });
  document.addEventListener("portal:supportchanged", () => { if (current()) render(); }); document.addEventListener("portal:faqschanged", () => { if (current()) { try { renderFAQs(); } catch (error) { $("staff-support-feedback").textContent = error.message; $("staff-faq-rows").replaceChildren(); $("staff-knowledge-list").replaceChildren(); } } });
  document.addEventListener("portal:supporttab", (event) => { if (!current()) return; showTab(event.detail); window.PortalStaffContext.navigate("staff-help-support"); });
  document.querySelectorAll("[data-support-shortcut]").forEach((button) => button.addEventListener("click", () => { if (!current()) return; showTab(button.dataset.supportShortcut); if (button.dataset.supportShortcut === "tickets") { filters.reset(); filters.elements.status.value = tickets.STATUS.OPEN; } window.PortalStaffContext.navigate("staff-help-support"); }));
  document.addEventListener("portal:logout", () => { dirty = false; editing = null; page = 1; faqPage = 1; tab = "tickets"; if (editor.open) editor.close(); if (details.open) details.close(); form.reset(); filters.reset(); faqFilters.reset(); ["support-ticket-rows", "support-stats", "staff-faq-rows", "staff-knowledge-list", "staff-knowledge-answer", "staff-faq-details-body", "staff-support-feedback"].forEach((id) => $(id).replaceChildren()); showTab("tickets"); });
  if (current()) render();
};
