"use strict";

window.initializeStudentAnnouncements = () => {
  const service = window.PortalAnnouncementService;
  const ui = window.PortalAnnouncementUI;
  const $ = (id) => document.getElementById(id);
  const dialog = $("student-announcement-details");
  const header = document.querySelector("#dashboard-screen .notification-button");
  let alerts = true;
  let opener = null;
  let selected = "";
  let pendingOpenId = "";
  const el = (tag, text, className) => { const item = document.createElement(tag); item.textContent = text; if (className) item.className = className; return item; };
  const button = (label, callback) => { const item = el("button", label, "secondary-button"); item.type = "button"; item.addEventListener("click", callback); return item; };
  const icon = (name, className = "") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `portal-icon${className ? ` ${className}` : ""}`);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${name}`);
    svg.append(use);
    return svg;
  };
  const categoryMeta = (category) => ({
    "Academic Services": { label: "Academic", tone: "academic", icon: "icon-calendar" },
    "Document Requests": { label: "Administrative", tone: "administrative", icon: "icon-document" },
    "Office Announcements": { label: "Administrative", tone: "administrative", icon: "icon-document" },
    "Appointment Advisories": { label: "Advisory", tone: "administrative", icon: "icon-calendar-clock" },
    "System Maintenance": { label: "Reminder", tone: "reminder", icon: "icon-bell" },
    "General Announcements": { label: "General", tone: "general", icon: "icon-announcement" },
  })[category] || { label: category || "Announcement", tone: "general", icon: "icon-announcement" };
  const metaItem = (name, text) => {
    const item = document.createElement("span"); item.className = "announcement-feed-meta-item";
    item.append(icon(name), document.createTextNode(text));
    return item;
  };
  function feedCard(record) {
    const meta = categoryMeta(record.category);
    const card = document.createElement("article"); card.className = `announcement-feed-card is-${meta.tone}`;
    const iconWrap = document.createElement("span"); iconWrap.className = "announcement-feed-icon"; iconWrap.append(icon(meta.icon));
    const link = document.createElement("a"); link.className = "announcement-feed-body"; link.href = "#/announcements";
    link.addEventListener("click", (event) => { event.preventDefault(); open(record.id); });
    const kicker = document.createElement("div"); kicker.className = "announcement-feed-kicker";
    kicker.append(el("span", meta.label, "announcement-feed-category"));
    if (record.priority && record.priority !== "Normal") kicker.append(el("span", record.priority, `announcement-feed-priority announcement-feed-priority-${record.priority === "Urgent" ? "urgent" : "important"}`));
    const metaRow = document.createElement("div"); metaRow.className = "announcement-feed-meta";
    metaRow.append(metaItem("icon-calendar", ui.shortDate(record.publishedAt)), metaItem("icon-user", record.publisher || "Office of the Registrar"));
    link.append(kicker, el("h3", record.title, "announcement-feed-title"), el("p", record.content, "announcement-feed-summary"), metaRow);
    card.append(iconWrap, link);
    return card;
  }
  function account() { return window.PortalProfile.snapshot().account; }
  function loadPreferences() {
    const student = account(); if (student?.role !== "student") return;
    try { alerts = JSON.parse(localStorage.getItem(window.PortalAccounts.preferencesKey(student)) || "{}").announcementAlerts !== false; } catch { alerts = true; }
  }
  function open(id) {
    if (document.querySelector("#dashboard-screen").dataset.currentPage !== "announcements") {
      pendingOpenId = id; location.hash = "#/announcements"; return;
    }
    try {
      const record = service.publicGet(id); if (!record) throw new Error("This announcement is no longer available in the active feed.");
      opener = document.activeElement; selected = id;
      $("student-announcement-detail-title").textContent = record.title;
      $("student-announcement-detail-body").replaceChildren(ui.card(record));
      if (!dialog.open) dialog.showModal(); $("student-announcement-detail-title").focus();
      service.markRead(id);
    } catch (error) { $("student-announcement-feedback").textContent = error.message; }
  }
  function render() {
    if (account()?.role !== "student") return;
    try {
      const feed = service.publicFeed(); const notifications = service.notifications();
      const unread = window.PortalNotifications ? window.PortalNotifications.list().filter((item) => item.unread && (item.source !== "announcements" || alerts)).length : alerts ? notifications.filter((item) => item.unread).length : 0;
      header.querySelector("span").textContent = String(unread); header.querySelector("span").hidden = !unread;
      const notificationLabel = window.PortalNotifications ? "Notifications" : "Announcements";
      header.setAttribute("aria-label", unread ? `${notificationLabel}, ${unread} unread notification${unread === 1 ? "" : "s"}` : notificationLabel);
      const query = $("announcement-search").value.trim().toLowerCase();
      const newestFirst = $("announcement-sort").value !== "oldest";
      const visible = feed.filter((record) => !query || [record.title, record.content, record.category, record.publisher].join(" ").toLowerCase().includes(query)).sort((a, b) => (newestFirst ? -1 : 1) * (new Date(a.publishedAt) - new Date(b.publishedAt)));
      $("student-announcement-feed").replaceChildren(...visible.map(feedCard));
      $("student-announcement-empty").hidden = visible.length > 0;
      $("student-announcement-empty").textContent = feed.length ? "No announcements match your search." : "No published announcements are available right now.";
      $("latest-announcements").hidden = !feed.length;
      $("latest-announcements-list").replaceChildren();
      feed.slice(0, 3).forEach((record) => { const item = document.createElement("article"); item.append(el("strong", record.title), el("p", `${record.category} · ${ui.date(record.publishedAt)}`), button("View Details", () => open(record.id))); $("latest-announcements-list").append(item); });
      if (dialog.open) {
        const current = service.publicGet(selected);
        if (!current) { dialog.close(); $("student-announcement-feedback").textContent = "This announcement has expired or is no longer in the active feed."; }
        else { $("student-announcement-detail-title").textContent = current.title; $("student-announcement-detail-body").replaceChildren(ui.card(current)); }
      }
    } catch (error) {
      $("student-announcement-feedback").textContent = error.message;
      $("student-announcement-feed").replaceChildren(); $("latest-announcements").hidden = true;
      if (dialog.open) dialog.close();
      header.querySelector("span").hidden = true;
    }
  }
  $("announcement-search").addEventListener("input", render);
  $("announcement-sort").addEventListener("change", render);
  $("student-announcement-back").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { selected = ""; if (opener?.isConnected && !opener.closest("[hidden]")) opener.focus(); else if (!document.querySelector('[data-view="announcements"]').hidden) $("announcements-title").focus(); });
  document.addEventListener("portal:announcementpreferences", (event) => { alerts = event.detail.enabled; render(); });
  document.addEventListener("portal:accountchange", () => { loadPreferences(); render(); });
  document.addEventListener("portal:pagechange", (event) => {
    if (["announcements", "dashboard"].includes(event.detail)) render();
    if (event.detail === "announcements" && pendingOpenId) { const id = pendingOpenId; pendingOpenId = ""; open(id); }
  });
  document.addEventListener("portal:announcementschanged", render);
  document.addEventListener("portal:notificationschanged", render);
  document.addEventListener("portal:announcementopen", (event) => open(event.detail));
  window.addEventListener("storage", (event) => { if (event.key?.startsWith("rtu.portal.settings.")) { loadPreferences(); render(); } });
  // Visibility/expiry refresh only. This never publishes scheduled announcements.
  window.setInterval(() => { if (!document.hidden) render(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  document.addEventListener("portal:logout", () => {
    if (dialog.open) dialog.close(); selected = ""; pendingOpenId = ""; alerts = true;
    ["student-announcement-feed", "student-announcement-detail-body", "latest-announcements-list", "student-announcement-feedback"].forEach((id) => $(id).replaceChildren());
    header.querySelector("span").textContent = "0"; header.querySelector("span").hidden = true; $("latest-announcements").hidden = true;
  });
  loadPreferences(); render();
};
