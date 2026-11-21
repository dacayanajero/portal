"use strict";

window.initializeStaffAnnouncements = () => {
  const service = window.PortalAnnouncementService;
  const policy = window.PortalAnnouncementPolicy;
  const S = service.STATUS;
  const $ = (id) => document.getElementById(id);
  const filters = $("announcement-filters");
  const form = $("announcement-editor-form");
  const editor = $("announcement-editor");
  const details = $("announcement-details");
  const confirmation = $("announcement-confirm");
  let section = "active";
  let page = 1;
  let editing = null;
  let selected = "";
  let dirty = false;
  let baseline = "";
  let token = "";
  let confirmAction = null;
  let opener = null;
  let confirmOpener = null;
  let previewing = false;
  const el = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = String(text); if (className) item.className = className; return item; };
  const button = (text, handler) => { const item = el("button", text, "secondary-button"); item.type = "button"; item.addEventListener("click", handler); return item; };
  const date = window.PortalAnnouncementUI.date;
  const permissions = () => service.capabilities();
  const currentStaff = () => window.PortalStaffContext.current();
  const raw = () => Object.fromEntries(new FormData(form));
  const content = () => { const value = raw(); return service.validate({ ...value, scheduledAt: service.fromManila(value.scheduledAt), expiresAt: service.fromManila(value.expiresAt) }); };
  const option = (select, value) => select.append(new Option(value, value));
  policy.categories.forEach((value) => { option(filters.elements.category, value); option(form.elements.category, value); });
  policy.audiences.forEach((value) => { option(filters.elements.audience, value); option(form.elements.audience, value); });
  policy.priorities.forEach((value) => option(form.elements.priority, value));
  [S.DRAFT, S.SCHEDULED, S.PUBLISHED, S.ARCHIVED, ...(policy.approvalRequired ? [S.PENDING, S.APPROVED, S.REJECTED] : [])].forEach((value) => option(filters.elements.status, value));

  function filtered() {
    const values = Object.fromEntries(new FormData(filters));
    const query = String(values.query || "").trim().replace(/\s+/g, " ").toLowerCase();
    return service.list().filter((record) => (section === "archive" ? record.status === S.ARCHIVED : record.status !== S.ARCHIVED)
      && (!query || [record.id, record.title].some((value) => value.toLowerCase().replace(/\s+/g, " ").includes(query)))
      && (!values.category || record.category === values.category) && (!values.status || record.status === values.status)
      && (!values.audience || record.audience === values.audience)
      && (!values.from || service.toManila(record.createdAt).slice(0, 10) >= values.from)
      && (!values.to || record.createdAt && service.toManila(record.createdAt).slice(0, 10) <= values.to))
      .sort((a, b) => (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) * (values.sort === "oldest" ? -1 : 1));
  }
  function render() {
    if (!currentStaff()) return;
    try {
      const records = service.list(); const counts = service.summary(records);
      $("announcement-create").hidden = !permissions().includes("create");
      $("announcement-stats").replaceChildren();
      [["total", "Total Announcements", "announcement", "pending"], ["published", "Published Announcements", "check-circle", "ready"], ["draft", "Draft Announcements", "document", "processing"], ["scheduled", "Scheduled Announcements", "calendar-clock", "released"]].forEach(([key, label, icon, tone]) => {
        const card = el("article", undefined, `staff-stat-card staff-stat-${tone}`); const symbol = el("span", undefined, "staff-stat-icon");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "portal-icon"); svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#icon-${icon}`); svg.append(use); symbol.append(svg);
        card.append(symbol, el("p", label), el("strong", counts[key])); $("announcement-stats").append(card);
        if (key === "scheduled" && counts.due) card.append(el("small", `${counts.due} due — awaiting staff publication`));
      });
      $("announcement-list-heading").textContent = section === "archive" ? "Archived Announcements" : "Manage Announcements";
      document.querySelectorAll("[data-announcement-section]").forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.announcementSection === section)));
      const list = filtered(); const pages = Math.max(1, Math.ceil(list.length / 8)); page = Math.min(Math.max(1, page), pages);
      $("announcement-rows").replaceChildren();
      list.slice((page - 1) * 8, page * 8).forEach((record) => {
        const row = el("tr");
        const expired = record.status === S.PUBLISHED && record.expiresAt && record.expiresAt <= new Date().toISOString();
        const due = record.status === S.SCHEDULED && record.scheduledAt <= new Date().toISOString();
        [record.id, record.title, record.category, record.audience, record.author || "Not recorded", date(record.createdAt), record.status === S.SCHEDULED ? date(record.scheduledAt) : record.published ? date(record.published.publishedAt) : "Not published", `${record.status}${expired ? " · Expired" : due ? " · Due, awaiting staff publication" : ""}`].forEach((value) => row.append(el("td", value)));
        const action = el("td"); action.append(button("View / Manage", () => openDetails(record.id))); row.append(action); $("announcement-rows").append(row);
      });
      $("announcement-empty").hidden = list.length > 0;
      $("announcement-results").textContent = `${list.length} announcement${list.length === 1 ? "" : "s"}`;
      $("announcement-page").textContent = `Page ${page} of ${pages}`;
      $("announcement-prev").disabled = page <= 1; $("announcement-next").disabled = page >= pages;
    } catch (error) {
      $("announcement-feedback").textContent = error.message; $("announcement-rows").replaceChildren(); $("announcement-stats").replaceChildren();
    }
  }
  function discard() {
    if (!dirty) return true;
    if (!window.confirm("This announcement has unsaved changes. Discard them and leave the editor?")) return false;
    dirty = false; return true;
  }
  function openEditor(record = null) {
    try {
      if (record ? !service.editable(record) : !permissions().includes("create")) throw new Error("Your account cannot edit this announcement.");
      if (details.open) details.close();
      editing = record; token = window.crypto.randomUUID(); opener = document.activeElement;
      form.reset();
      ["title", "content", "category"].forEach((key) => { form.elements[key].value = record?.[key] || ""; });
      form.elements.audience.value = record?.audience || "All Students"; form.elements.priority.value = record?.priority || "Normal";
      form.elements.scheduledAt.value = service.toManila(record?.scheduledAt); form.elements.expiresAt.value = service.toManila(record?.expiresAt);
      $("announcement-editor-title").textContent = record ? `Edit ${record.id}` : "Create Announcement";
      $("announcement-save-draft").hidden = record?.status === S.PUBLISHED || record?.status === S.SCHEDULED;
      $("announcement-publish").hidden = !permissions().includes("publish");
      $("announcement-publish").textContent = record?.status === S.PUBLISHED ? "Publish Revision" : record?.status === S.SCHEDULED ? "Publish Due Announcement" : "Publish Now";
      $("announcement-schedule").hidden = !permissions().includes("publish") || record?.status === S.PUBLISHED;
      $("announcement-schedule").textContent = record?.status === S.SCHEDULED ? "Update Publication Schedule" : "Schedule Publication";
      $("announcement-editor-feedback").textContent = ""; dirty = false; baseline = JSON.stringify(raw());
      editor.showModal(); form.elements.title.focus();
    } catch (error) { $("announcement-feedback").textContent = error.message; }
  }
  function commit(action, data) {
    const saved = service.save(data, { id: editing?.id, revision: editing?.revision, action, confirmed: action !== "draft", token });
    editing = saved; dirty = false; baseline = JSON.stringify(raw());
    if (editor.open) editor.close();
    $("announcement-feedback").textContent = action === "publish" ? "Published to the general student feed in this browser. No external messages were sent." : action === "schedule" ? "Schedule saved in this browser. An authorized publisher must publish it when due; no backend scheduler is connected." : "Draft saved in this browser.";
    render();
  }
  function ask(title, summary, action, reason = false) {
    confirmAction = action; confirmOpener = document.activeElement;
    $("announcement-confirm-title").textContent = title; $("announcement-confirm-summary").textContent = summary;
    $("announcement-reason-label").hidden = !reason; $("announcement-reason").required = reason; $("announcement-reason").value = "";
    $("announcement-confirm-feedback").textContent = ""; confirmation.showModal(); $("announcement-confirm-cancel").focus();
  }
  function save(action) {
    if (!form.reportValidity()) return;
    try {
      const data = content();
      if (action === "draft") commit(action, data);
      else ask(action === "publish" ? editing?.status === S.PUBLISHED ? "Confirm published revision" : "Confirm publication" : "Confirm publication schedule", `${data.title} · ${data.category} · ${data.audience} · Priority: ${data.priority}. ${action === "schedule" ? `Scheduled for ${date(data.scheduledAt)} (Asia/Manila). This prototype will not publish automatically.` : "Publish this content to the general student feed in this browser?"}`, () => commit(action, data));
    } catch (error) { $("announcement-editor-feedback").textContent = error.message; }
  }
  function openDetails(id) {
    try {
      const record = service.get(id); if (!record) throw new Error("Announcement not found.");
      selected = id; previewing = false; if (!details.open) opener = document.activeElement;
      $("announcement-details-title").textContent = "Announcement Details";
      const display = record.published ? { ...record, publishedAt: record.published.publishedAt, publisher: record.published.publisher } : record;
      const body = $("announcement-details-body"); body.replaceChildren(window.PortalAnnouncementUI.card(display, { preview: !record.published }));
      body.append(el("p", `${record.id} · ${record.status} · Record revision ${record.revision} · Created by ${record.author || "Not recorded"} · ${date(record.createdAt)}`));
      if (record.scheduledAt) body.append(el("p", `Scheduled: ${date(record.scheduledAt)} (Asia/Manila). Publication requires authorized staff action in this prototype.`, "demo-note"));
      if (record.legacy) body.append(el("p", "Imported legacy notice. Original content was preserved as an unpublished draft pending authorized review.", "demo-note"));
      const actions = el("div", undefined, "announcement-actions");
      if (service.editable(record) && ![S.ARCHIVED, S.PENDING].includes(record.status)) actions.append(button(record.status === S.PUBLISHED ? "Revise Announcement" : "Edit Announcement", () => openEditor(record)));
      if (record.status === S.SCHEDULED && permissions().includes("publish")) actions.append(button("Cancel Scheduled Publication", () => transition(record, "cancelSchedule")));
      if ([S.DRAFT, S.REJECTED, S.APPROVED, S.PUBLISHED].includes(record.status) && permissions().includes("archive")) actions.append(button("Archive Announcement", () => transition(record, "archive")));
      if (policy.approvalRequired && [S.DRAFT, S.REJECTED].includes(record.status) && service.editable(record)) actions.append(button("Submit for Approval", () => transition(record, "submit")));
      if (policy.approvalRequired && record.status === S.PENDING && permissions().includes("approve")) actions.append(button("Approve Announcement", () => transition(record, "approve")), button("Reject Announcement", () => transition(record, "reject")));
      body.append(actions, el("h4", "Publishing and Editing History"));
      const history = el("ol", undefined, "announcement-audit");
      record.history.slice().reverse().forEach((event) => { const item = el("li"); const time = el("time", date(event.timestamp)); time.dateTime = event.timestamp; item.append(el("strong", event.action), time, el("small", `${event.actor} · ${event.previousStatus || "New"} → ${event.newStatus}`)); if (event.remarks) item.append(el("p", event.remarks)); history.append(item); }); body.append(history);
      body.append(el("h4", "Preserved Published Versions"));
      if (!record.versions.length) body.append(el("p", "No published versions recorded."));
      record.versions.slice().reverse().forEach((version) => { const detail = el("details"); detail.append(el("summary", `Version ${version.version} · ${date(version.publishedAt)} · ${version.publisher}`), window.PortalAnnouncementUI.card(version)); body.append(detail); });
      if (!details.open) details.showModal(); $("announcement-details-title").focus();
    } catch (error) { $("announcement-feedback").textContent = error.message; }
  }
  function transition(record, action) {
    ask(`Confirm ${action === "cancelSchedule" ? "schedule cancellation" : action}`, `${record.title} (${record.id}). This action is recorded in announcement history; content is preserved.`, () => {
      const saved = service.transition(record.id, record.revision, action, { confirmed: true, reason: $("announcement-reason").value });
      openDetails(saved.id); render();
    }, action === "reject");
  }
  form.addEventListener("input", () => { dirty = JSON.stringify(raw()) !== baseline; $("announcement-editor-feedback").textContent = ""; });
  form.addEventListener("submit", (event) => { event.preventDefault(); save("draft"); });
  $("announcement-publish").addEventListener("click", () => save("publish"));
  $("announcement-schedule").addEventListener("click", () => save("schedule"));
  $("announcement-preview").addEventListener("click", () => {
    if (!form.reportValidity()) return;
    try { const data = content(); previewing = true; $("announcement-details-title").textContent = "Student Announcement Preview"; $("announcement-details-body").replaceChildren(window.PortalAnnouncementUI.card({ ...data, publisher: currentStaff().profile?.fullName || currentStaff().account.fullName }, { preview: true })); details.showModal(); $("announcement-details-title").focus(); }
    catch (error) { $("announcement-editor-feedback").textContent = error.message; }
  });
  $("announcement-confirm-form").addEventListener("submit", (event) => {
    event.preventDefault(); const submit = $("announcement-confirm-submit"); submit.disabled = true;
    try { confirmAction?.(); confirmation.close(); }
    catch (error) { $("announcement-confirm-feedback").textContent = error.message; }
    finally { submit.disabled = false; }
  });
  $("announcement-confirm-cancel").addEventListener("click", () => confirmation.close());
  confirmation.addEventListener("close", () => { confirmAction = null; if (details.open) $("announcement-details-title").focus(); else if (editor.open && confirmOpener?.isConnected) confirmOpener.focus(); else $("staff-announcements-title").focus(); });
  $("announcement-editor-close").addEventListener("click", () => { if (discard()) editor.close(); });
  editor.addEventListener("cancel", (event) => { if (!discard()) event.preventDefault(); });
  editor.addEventListener("close", () => {
    if (!confirmation.open && !details.open && document.querySelector("#staff-screen").dataset.currentPage === "staff-announcements") $("staff-announcements-title").focus();
  });
  $("announcement-details-close").addEventListener("click", () => details.close());
  details.addEventListener("close", () => { if (editor.open) $("announcement-preview").focus(); else if (opener?.isConnected && opener.getClientRects().length) opener.focus(); else if (document.querySelector("#staff-screen").dataset.currentPage === "staff-announcements") $("staff-announcements-title").focus(); });
  $("announcement-create").addEventListener("click", () => openEditor());
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("input", () => { page = 1; render(); });
  filters.addEventListener("reset", () => setTimeout(() => { page = 1; render(); }, 0));
  $("announcement-prev").addEventListener("click", () => { page--; render(); }); $("announcement-next").addEventListener("click", () => { page++; render(); });
  document.querySelectorAll("[data-announcement-section]").forEach((control) => control.addEventListener("click", () => { section = control.dataset.announcementSection; page = 1; filters.elements.status.value = ""; render(); }));
  ["portal:staffbeforenavigate", "portal:staffbeforelogout"].forEach((name) => document.addEventListener(name, (event) => { if (editor.open && !discard()) event.preventDefault(); }));
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("portal:staffpagechange", (event) => { if (event.detail === "staff-announcements") render(); });
  document.addEventListener("portal:announcementschanged", () => {
    if (!currentStaff()) return;
    render();
    if (details.open && !previewing && selected && !confirmation.open) openDetails(selected);
    if (editor.open && editing) {
      try { if (service.get(editing.id)?.revision !== editing.revision) $("announcement-editor-feedback").textContent = "This record changed. Your editor content is preserved; reopen the latest version before saving."; } catch {}
    }
  });
  document.addEventListener("portal:logout", () => {
    dirty = false; editing = null; selected = ""; token = ""; section = "active"; page = 1;
    [confirmation, details, editor].forEach((dialog) => { if (dialog.open) dialog.close(); }); form.reset(); filters.reset();
    $("announcement-details-body").replaceChildren(); $("announcement-rows").replaceChildren(); $("announcement-stats").replaceChildren();
  });
  if (currentStaff()) render();
  // Refresh due/expiry indicators only; publishing is always an explicit operation.
  window.setInterval(() => { if (!document.hidden && !editor.open && currentStaff() && document.querySelector("#staff-screen").dataset.currentPage === "staff-announcements") render(); }, 30000);
};
