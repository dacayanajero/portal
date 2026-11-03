"use strict";

// Shared student-card renderer, also used by staff previews. No HTML parsing.
window.PortalAnnouncementUI = Object.freeze({
  date(value) {
    return !value || Number.isNaN(new Date(value).getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
  },
  shortDate(value) {
    return !value || Number.isNaN(new Date(value).getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value));
  },
  card(record, { full = true, preview = false } = {}) {
    const el = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
    const card = document.createElement("article"); card.className = "content-card portal-announcement-card";
    card.append(el("span", record.category || "Uncategorized", "announcement-tag"));
    if (record.priority && record.priority !== "Normal") card.append(el("span", record.priority, `announcement-priority announcement-priority-${record.priority === "Urgent" ? "urgent" : "important"}`));
    card.append(el("h3", record.title));
    const meta = document.createElement("div"); meta.className = "portal-announcement-meta";
    meta.append(el("span", preview ? "Preview — not published" : `Published ${window.PortalAnnouncementUI.date(record.publishedAt)}`), el("span", record.audience || "All Students"));
    if (preview) meta.append(el("span", record.scheduledAt ? `Planned publication ${window.PortalAnnouncementUI.date(record.scheduledAt)}` : "Publication time assigned on publishing"));
    if (record.publisher) meta.append(el("span", `${preview ? "Publisher (preview)" : "Published by"} ${record.publisher}`));
    card.append(meta, el("p", full ? record.content : `${record.content.slice(0, 240)}${record.content.length > 240 ? "…" : ""}`, "portal-announcement-content"));
    return card;
  },
});
