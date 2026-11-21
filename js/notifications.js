"use strict";

// Adapter over existing sources. It does not persist/copy an inbox dataset.
window.PortalNotifications = (() => {
  // Derived staff tasks have no persisted notification row of their own.
  // Remember acknowledgement of each task state per staff account/browser;
  // operational queues still show pending tasks until staff completes them.
  const dismissalKey = staff => staff?.id ? "rtu.portal.dismissedAttention."+staff.id : null;
  const attentionKey = notice => notice.id+"@"+notice.timestamp;
  function dismissed(staff) {
    const key=dismissalKey(staff);
    if(!key) return new Set();
    try { const values=JSON.parse(localStorage.getItem(key)||"[]"); return new Set(Array.isArray(values)?values:[]); }
    catch { return new Set(); }
  }
  function dismiss(staff, notices) {
    const key=dismissalKey(staff);
    if(!key || !notices.length) return;
    const entries=dismissed(staff);
    notices.forEach(n=>entries.add(attentionKey(n)));
    localStorage.setItem(key,JSON.stringify([...entries].slice(-1000)));
  }
  function state() {
    const student = window.PortalProfile?.snapshot()?.account;
    const staff = window.PortalStaffContext?.current()?.account;
    const items = []; const unavailable = [];
    const read = (name, getter) => { try { items.push(...getter()); } catch { unavailable.push(name); } };
    if (student?.role === "student") {
      read("Announcements", () => window.PortalAnnouncementService.notifications().map((notice) => ({ ...notice, source: "announcements" })));
      read("Private support updates", () => window.PortalSupportService.notifications());
    } else if (staff?.role === "staff") {
      read("Request attention", () => window.PortalRequestService.listAll().filter((request) => [window.PortalRequestService.STATUS.PENDING, window.PortalRequestService.STATUS.CORRECTION].includes(request.status)).map((request) => ({ id: `request:${request.id}`, source: "requests", requestId: request.id, title: `Request needs review · ${request.id}`, timestamp: (request.history || []).filter(e=>e.newStatus===request.status).at(-1)?.timestamp || request.updatedAt, unread: true, attention: true })));
      read("Assigned processing tasks", () => window.PortalRequestService.listAll().filter((request) => {
        const status = window.PortalRequestService.STATUS;
        const latest = (request.history || []).filter((entry) => entry.staffId && [status.APPROVED, status.PROCESSING, status.READY].includes(entry.newStatus)).at(-1);
        return [status.PROCESSING, status.READY].includes(request.status) && latest?.staffId === staff.accountNumber;
      }).map((request) => ({ id: `processing:${request.id}:${request.status}`, source: "processing", requestId: request.id, title: `Assigned document · ${request.id} · ${request.status}`, timestamp: (request.history || []).filter(e=>e.newStatus===request.status).at(-1)?.timestamp || request.updatedAt, unread: true, attention: true })));
      if (window.PortalSupportService.capabilities().some((capability) => ["viewAll", "viewAssigned"].includes(capability))) read("Support updates", () => window.PortalSupportService.notifications());
    }
    if (student?.role === "student" || staff?.role === "staff") read("Database notifications", () => window.PortalRealtime?.list() || []);
    // A pending-request alert and its database notice describe the same task.
    // Keep the database notice available, but avoid double-counting staff attention.
    const dbRefs = new Set(items.filter(n => n.source === "database" && n.refTable === "requests").map(n => n.refId));
    const acknowledged=dismissed(staff);
    const deduped=items.filter(n=>!n.attention || (!acknowledged.has(attentionKey(n)) && (n.source!=="requests" || !dbRefs.has(window.PortalRequestService.get(n.requestId)?.dbId))));
    return { items: deduped.sort((a,b)=>Number(Boolean(b.unread))-Number(Boolean(a.unread)) || (Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0) || a.id.localeCompare(b.id)), unavailable };
  }
  function list() { return state().items; }
  function visible(items, preferences = {}) {
    return items.filter((notice) => notice.mandatory || (notice.source === "database" && notice.kind === "request" ? preferences.requestAlerts !== false : notice.source === "requests" ? preferences.requestAlerts !== false : notice.source === "processing" ? preferences.processingAlerts !== false : notice.source === "support" ? preferences.supportAlerts !== false : notice.source === "announcements" ? preferences.announcementAlerts !== false : true));
  }
  async function open(noticeId) {
    const notice = list().find((entry) => entry.id === noticeId); if (!notice) throw new Error("This update is unavailable to your account.");
    const staff=window.PortalStaffContext?.current()?.account;
    if (notice.source === "database") {
      await window.PortalRealtime.markRead(notice.dbId);
      const student = window.PortalProfile?.snapshot()?.account;
      if (student?.role === "student") location.hash = "#/my-request";
      else if (notice.refTable === "requests" && window.PortalRequestService.get(notice.refId)) window.PortalStaffContext.openRequest(window.PortalRequestService.get(notice.refId).id);
      else if (notice.refTable === "appointments") location.hash = "#/staff/appointments";
      return;
    }
    if (notice.source === "support") { window.PortalSupportService.markRead(notice.id); document.dispatchEvent(new CustomEvent("portal:supportticketopen", { detail: notice.ticketId })); }
    else if (notice.source === "announcements") { await window.PortalAnnouncementService.markRead(notice.announcementId); document.dispatchEvent(new CustomEvent("portal:announcementopen", { detail: notice.announcementId })); }
    else if (notice.source === "processing") document.dispatchEvent(new CustomEvent("portal:documentopen", { detail: notice.requestId }));
    else window.PortalStaffContext.openRequest(notice.requestId);
    if (notice.attention) dismiss(staff,[notice]);
    document.dispatchEvent(new Event("portal:notificationschanged"));
  }
  return Object.freeze({ state, list, visible, open });
})();

window.initializePortalNotifications = () => {
  const dialog = document.querySelector("#portal-notifications-dialog");
  const rows = document.querySelector("#portal-notifications-list");
  const feedback = document.querySelector("#portal-notifications-feedback");
  let opener = null;
  let studentAlerts = true;
  let staffAlerts = true;
  function render() {
    const state = window.PortalNotifications.state();
    const student = window.PortalProfile?.snapshot()?.account;
    const staff = window.PortalStaffContext?.current()?.account;
    let preferences = student?.role === "student" ? { announcementAlerts: studentAlerts } : { requestAlerts: staffAlerts };
    if (staff?.role === "staff" && window.PortalStaffAccountService) { try { preferences = window.PortalStaffAccountService.preferences(); } catch {} }
    const visibleItems = window.PortalNotifications.visible(state.items, preferences).filter(notice=>notice.unread);
    const unread = visibleItems.filter((notice) => notice.unread).length;
    const header = student?.role === "student" ? document.querySelector("#dashboard-screen .notification-button") : staff?.role === "staff" ? document.querySelector("#staff-notification-button") : null;
    if (header) {
      header.querySelector("span").textContent = String(unread); header.querySelector("span").hidden = !unread;
      header.setAttribute("aria-label", `Notifications, ${unread} unread or requiring attention${state.unavailable.length ? "; some sources unavailable" : ""}`);
    }
    rows.replaceChildren(); feedback.textContent = state.unavailable.length ? `Unavailable notification sources: ${state.unavailable.join(", ")}.` : "";
    if (!visibleItems.length) { const empty = document.createElement("li"); empty.textContent = state.items.some(n=>n.unread) ? "Some unread alerts are disabled in Settings." : "You’re all caught up. No unread notifications."; rows.append(empty); }
    visibleItems.forEach((notice) => {
      const row = document.createElement("li"); const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button";
      button.textContent = `${notice.unread ? "Unread / attention · " : ""}${notice.title}`;
      button.addEventListener("click", async () => { button.disabled=true; try { await window.PortalNotifications.open(notice.id); if (dialog.open) dialog.close(); render(); } catch (error) { feedback.textContent = error.message; } finally { button.disabled=false; } });
      const source = document.createElement("small"); source.textContent = notice.source === "database" ? (notice.body || "Account notification") : notice.source === "support" ? `Private support update${notice.mandatory ? " · Required operational notice" : ""}` : ["requests", "processing"].includes(notice.source) ? "Staff task · open to dismiss the alert; the task remains in its queue" : "General published announcement";
      row.append(button, source); rows.append(row);
    });
  }
  document.querySelectorAll("#dashboard-screen .notification-button, #staff-notification-button").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault(); event.stopImmediatePropagation(); opener = button; render(); dialog.showModal(); document.querySelector("#portal-notifications-title").focus();
  }, true));
  document.querySelector("#portal-notifications-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (opener?.getClientRects().length) opener.focus(); });
  ["portal:notificationschanged", "portal:announcementschanged", "portal:requestschanged", "portal:accountchange", "portal:staffaccountchange", "portal:staffpreferencesupdated"].forEach((name) => document.addEventListener(name, render));
  document.addEventListener("portal:announcementpreferences", (event) => { studentAlerts = event.detail.enabled; render(); });
  document.addEventListener("portal:staffnotificationpreferences", (event) => { staffAlerts = event.detail.enabled; render(); });
  document.addEventListener("portal:logout", () => { if (dialog.open) dialog.close(); rows.replaceChildren(); feedback.textContent = ""; });
  const student = window.PortalProfile?.snapshot()?.account; const staff = window.PortalStaffContext?.current()?.account;
  try { if (student) studentAlerts = JSON.parse(localStorage.getItem(window.PortalAccounts.preferencesKey(student)) || "{}").announcementAlerts !== false; if (staff) staffAlerts = JSON.parse(localStorage.getItem(window.PortalAccounts.preferencesKey(staff)) || "{}").requestAlerts !== false; } catch {}
  render();
};
