"use strict";

// Adapter over existing sources. It does not persist/copy an inbox dataset.
window.PortalNotifications = (() => {
  function state() {
    const student = window.PortalProfile?.snapshot()?.account;
    const staff = window.PortalStaffContext?.current()?.account;
    const items = []; const unavailable = [];
    const read = (name, getter) => { try { items.push(...getter()); } catch { unavailable.push(name); } };
    if (student?.role === "student") {
      read("Announcements", () => window.PortalAnnouncementService.notifications().map((notice) => ({ ...notice, source: "announcements" })));
      read("Private support updates", () => window.PortalSupportService.notifications());
    } else if (staff?.role === "staff") {
      read("Request attention", () => window.PortalRequestService.listAll().filter((request) => [window.PortalRequestService.STATUS.PENDING, window.PortalRequestService.STATUS.CORRECTION].includes(request.status)).map((request) => ({ id: `request:${request.id}`, source: "requests", requestId: request.id, title: `Request needs review · ${request.id}`, timestamp: request.updatedAt, unread: true, attention: true })));
      read("Assigned processing tasks", () => window.PortalRequestService.listAll().filter((request) => {
        const status = window.PortalRequestService.STATUS;
        const latest = (request.history || []).filter((entry) => entry.staffId && [status.APPROVED, status.PROCESSING, status.READY].includes(entry.newStatus)).at(-1);
        return [status.PROCESSING, status.READY].includes(request.status) && latest?.staffId === staff.accountNumber;
      }).map((request) => ({ id: `processing:${request.id}:${request.status}`, source: "processing", requestId: request.id, title: `Assigned document · ${request.id} · ${request.status}`, timestamp: request.updatedAt, unread: true, attention: true })));
      if (window.PortalSupportService.capabilities().some((capability) => ["viewAll", "viewAssigned"].includes(capability))) read("Support updates", () => window.PortalSupportService.notifications());
    }
    return { items: items.sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)), unavailable };
  }
  function list() { return state().items; }
  function visible(items, preferences = {}) {
    return items.filter((notice) => notice.mandatory || (notice.source === "requests" ? preferences.requestAlerts !== false : notice.source === "processing" ? preferences.processingAlerts !== false : notice.source === "support" ? preferences.supportAlerts !== false : notice.source === "announcements" ? preferences.announcementAlerts !== false : true));
  }
  function open(noticeId) {
    const notice = list().find((entry) => entry.id === noticeId); if (!notice) throw new Error("This update is unavailable to your account.");
    if (notice.source === "support") { window.PortalSupportService.markRead(notice.id); document.dispatchEvent(new CustomEvent("portal:supportticketopen", { detail: notice.ticketId })); }
    else if (notice.source === "announcements") document.dispatchEvent(new CustomEvent("portal:announcementopen", { detail: notice.announcementId }));
    else if (notice.source === "processing") document.dispatchEvent(new CustomEvent("portal:documentopen", { detail: notice.requestId }));
    else window.PortalStaffContext.openRequest(notice.requestId);
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
    const visibleItems = window.PortalNotifications.visible(state.items, preferences);
    const unread = visibleItems.filter((notice) => notice.unread).length;
    const header = student?.role === "student" ? document.querySelector("#dashboard-screen .notification-button") : staff?.role === "staff" ? document.querySelector("#staff-notification-button") : null;
    if (header) {
      header.querySelector("span").textContent = String(unread); header.querySelector("span").hidden = !unread;
      header.setAttribute("aria-label", `Notifications, ${unread} unread or requiring attention${state.unavailable.length ? "; some sources unavailable" : ""}`);
    }
    rows.replaceChildren(); feedback.textContent = state.unavailable.length ? `Unavailable notification sources: ${state.unavailable.join(", ")}.` : "";
    if (!visibleItems.length) { const empty = document.createElement("li"); empty.textContent = state.items.length ? "Some optional alerts are disabled in Settings. Your records remain available in their portal pages." : "No in-app updates are available."; rows.append(empty); }
    visibleItems.forEach((notice) => {
      const row = document.createElement("li"); const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button";
      button.textContent = `${notice.unread ? "Unread / attention · " : ""}${notice.title}`;
      button.addEventListener("click", () => { try { dialog.close(); window.PortalNotifications.open(notice.id); } catch (error) { feedback.textContent = error.message; } });
      const source = document.createElement("small"); source.textContent = notice.source === "support" ? `Private support update${notice.mandatory ? " · Required operational notice" : ""}` : ["requests", "processing"].includes(notice.source) ? "Staff attention; remains until its source state changes" : "General published announcement";
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
