"use strict";

(() => {
  const STORAGE_KEY = "rtu.portal.support.tickets.v1";
  const STATUS = Object.freeze({ OPEN: "Open", PROGRESS: "In Progress", WAITING: "Waiting for Student", RESOLVED: "Resolved", CLOSED: "Closed" });
  const TRANSITIONS = Object.freeze({ Open: [STATUS.PROGRESS], [STATUS.PROGRESS]: [STATUS.WAITING, STATUS.RESOLVED], [STATUS.WAITING]: [STATUS.PROGRESS], Resolved: [STATUS.CLOSED, STATUS.OPEN], Closed: [STATUS.OPEN] });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}-${window.crypto.randomUUID()}`;
  const policy = () => window.PortalSupportPolicy;
  function staff() {
    const current = window.PortalStaffContext?.current();
    if (current?.account?.role !== "staff") throw new Error("Authorized staff access is required.");
    return { id: current.account.accountNumber, name: current.profile?.fullName || current.account.fullName, role: "staff" };
  }
  function capabilitiesFor(number) { return [...(policy().accountCapabilities[number] || policy().defaultCapabilities)]; }
  function capabilities() { return capabilitiesFor(staff().id); }
  function requireCapability(capability) { const actor = staff(); if (!capabilities().includes(capability)) throw new Error(`Your account does not have support ${capability} permission.`); return actor; }
  function student() {
    const snapshot = window.PortalProfile?.snapshot(); const account = snapshot?.account;
    if (account?.role !== "student") throw new Error("Sign in as a student to access your support tickets.");
    return { id: account.accountNumber, name: snapshot.values?.fullName || account.fullName, email: snapshot.values?.email || account.email || "", role: "student" };
  }
  function text(value, max, label, required = true) {
    const result = typeof value === "string" ? value.trim() : "";
    if (required && !result || result.length > max) throw new Error(`${label}${required ? " is required and" : ""} must be at most ${max.toLocaleString()} characters.`);
    return result;
  }
  function read() {
    let records;
    try { records = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch { throw new Error("Support records could not be read in this browser."); }
    if (!Array.isArray(records) || records.some((record) => !record || typeof record.id !== "string" || typeof record.studentNumber !== "string" || !Object.values(STATUS).includes(record.status) || !Number.isInteger(record.revision) || !Array.isArray(record.messages) || !Array.isArray(record.notes) || !Array.isArray(record.history) || !Array.isArray(record.notifications) || !Array.isArray(record.resolutions))) throw new Error("Saved support records are invalid; they have not been overwritten.");
    if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate support identifiers require review.");
    return records;
  }
  function write(records) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { throw new Error("Support changes could not be saved. Browser storage is unavailable or full; no delivery is confirmed."); }
    document.dispatchEvent(new Event("portal:supportchanged")); document.dispatchEvent(new Event("portal:notificationschanged"));
  }
  function canView(ticket, actor = staff()) {
    const caps = capabilitiesFor(actor.id);
    return caps.includes("viewAll") || caps.includes("viewAssigned") && ticket.assignedStaffId === actor.id;
  }
  function event(ticket, action, actor, previousStatus = ticket.status, remarks = "", publicVisible = true) {
    const record = { id: id("ACT"), action, actor: actor.name, actorId: actor.id, role: actor.role, timestamp: now(), previousStatus, newStatus: ticket.status, remarks, publicVisible };
    ticket.history.push(record); return record;
  }
  function notify(ticket, action, role, targets, reference) {
    [...new Set(targets)].filter(Boolean).forEach((targetId) => {
      const referenceId = `${reference}:${role}:${targetId}`;
      if (!ticket.notifications.some((notice) => notice.id === referenceId)) ticket.notifications.push({ id: referenceId, ticketId: ticket.id, targetRole: role, targetId, label: `${action} · ${ticket.id}`, timestamp: now(), read: false, mandatory: ticket.priority === "Urgent" || role === "staff" && ["Support inquiry assigned to you", "Support inquiry reopened"].includes(action) });
    });
  }
  function eligibleStaff() {
    staff();
    return window.PortalAccounts.listStaff().filter((account) => { const caps = capabilitiesFor(account.accountNumber); return (caps.includes("viewAll") || caps.includes("viewAssigned")) && caps.includes("reply"); });
  }
  function staffTargets(ticket) {
    return [ticket.assignedStaffId || "support-inbox"];
  }
  // An unassigned event goes to the authorized queue, not an invented staff identity.
  function studentTargets(ticket) {
    return staffTargets(ticket);
  }
  function projection(ticket, isStaff = false) {
    const result = { id: ticket.id, studentName: ticket.studentName, studentNumber: ticket.studentNumber, subject: ticket.subject, category: ticket.category, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, status: ticket.status, priority: ticket.priority, assignedStaffId: ticket.assignedStaffId, assignedStaff: ticket.assignedStaff, requestId: ticket.requestId, appointmentId: ticket.appointmentId, revision: ticket.revision, description: ticket.messages[0]?.text || "", lastResponseAt: ticket.messages.filter((message) => message.role === "staff").at(-1)?.timestamp || "", messages: ticket.messages.map(({ id: messageId, text, timestamp, sender, role }) => ({ id: messageId, text, timestamp, sender, role })), resolutions: ticket.resolutions.map(({ summary, timestamp, actor }) => ({ summary, timestamp, actor })), history: ticket.history.filter((entry) => isStaff || entry.publicVisible).map(({ id: eventId, action, actor, role, timestamp, previousStatus, newStatus, remarks }) => ({ id: eventId, action, actor, role, timestamp, previousStatus, newStatus, remarks })) };
    if (isStaff && capabilities().includes("note")) result.notes = ticket.notes.map(({ text, timestamp, sender }) => ({ text, timestamp, sender }));
    if (!isStaff) delete result.assignedStaffId;
    if (isStaff && capabilities().includes("studentContact")) result.email = ticket.email;
    return clone(result);
  }
  function listStaff() {
    const actor = staff(); if (!capabilities().some((capability) => ["viewAll", "viewAssigned"].includes(capability))) throw new Error("Your account cannot view support tickets.");
    return read().filter((ticket) => canView(ticket, actor)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((ticket) => projection(ticket, true));
  }
  function getStaff(ticketId) { return listStaff().find((ticket) => ticket.id === ticketId) || null; }
  function listStudent() { const owner = student(); return read().filter((ticket) => ticket.studentNumber === owner.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((ticket) => projection(ticket)); }
  function getStudent(ticketId) { return listStudent().find((ticket) => ticket.id === ticketId) || null; }
  function validateLinks(input, owner) {
    const requestId = String(input.requestId || ""); const appointmentId = String(input.appointmentId || "");
    if (requestId && !window.PortalRequestService.getForStudent(requestId, owner.id)) throw new Error("The related request is not available to your account.");
    if (appointmentId && window.PortalAppointmentService.get(appointmentId)?.studentNumber !== owner.id) throw new Error("The related appointment is not available to your account.");
    return { requestId, appointmentId };
  }
  function create(input, token) {
    const owner = student(); const records = read();
    const existing = token && records.find((ticket) => ticket.studentNumber === owner.id && ticket.creationToken === token);
    if (existing) return projection(existing);
    const subject = text(input.subject, 160, "Subject"); const description = text(input.description, 5000, "Description");
    if (!policy().categories.includes(input.category)) throw new Error("Select a configured inquiry category.");
    const ticket = { id: id("SUP"), studentNumber: owner.id, studentName: owner.name, email: owner.email, subject, category: input.category, ...validateLinks(input, owner), createdAt: now(), updatedAt: now(), status: STATUS.OPEN, priority: "Normal", assignedStaffId: "", assignedStaff: "", revision: 1, creationToken: token || id("SUB"), messages: [{ id: id("MSG"), text: description, sender: owner.name, senderId: owner.id, role: "student", timestamp: now() }], notes: [], history: [], resolutions: [], notifications: [] };
    const activity = event(ticket, "Ticket Created", owner, ""); notify(ticket, "New support inquiry", "staff", studentTargets(ticket), activity.id);
    records.unshift(ticket); write(records); return projection(ticket);
  }
  function mutate(ticketId, expectedRevision, actor, apply) {
    const records = read(); const ticket = records.find((record) => record.id === ticketId);
    if (!ticket || (actor.role === "student" ? ticket.studentNumber !== actor.id : !canView(ticket, actor))) throw new Error("This ticket is unavailable to your account.");
    const result = apply(ticket, true);
    if (result === false) return projection(ticket, actor.role === "staff");
    if (ticket.revision !== expectedRevision) throw new Error("This ticket changed. Refresh its conversation before saving; keep your unsent text.");
    apply(ticket, false); ticket.updatedAt = now(); ticket.revision++; write(records);
    return projection(ticket, actor.role === "staff");
  }
  function reply(ticketId, body, options = {}) {
    const actor = options.internal ? requireCapability("note") : window.PortalProfile?.snapshot()?.account?.role === "student" ? student() : requireCapability("reply");
    const message = text(body, options.internal ? 2000 : 5000, options.internal ? "Internal note" : "Reply");
    return mutate(ticketId, options.revision, actor, (ticket, checkOnly) => {
      const messages = options.internal ? ticket.notes : ticket.messages;
      if (options.token && messages.some((entry) => entry.token === options.token && entry.senderId === actor.id && entry.role === actor.role)) return false;
      if ([STATUS.RESOLVED, STATUS.CLOSED].includes(ticket.status)) throw new Error("Reopen this ticket before adding another reply or note.");
      if (checkOnly) return true;
      const record = { id: id("MSG"), text: message, sender: actor.name, senderId: actor.id, role: actor.role, timestamp: now(), token: options.token || id("SUB") }; messages.push(record);
      const activity = event(ticket, options.internal ? "Internal Note Added" : actor.role === "staff" ? "Staff Replied" : "Student Replied", actor, ticket.status, "", !options.internal);
      if (!options.internal) {
        if (actor.role === "staff") notify(ticket, "Staff replied to your inquiry", "student", [ticket.studentNumber], activity.id);
        else {
          if (ticket.status === STATUS.WAITING) { const previous = ticket.status; ticket.status = STATUS.PROGRESS; event(ticket, "Student Information Received", actor, previous); }
          notify(ticket, "Student replied to support inquiry", "staff", studentTargets(ticket), activity.id);
        }
      }
    });
  }
  function update(ticketId, changes, options = {}) {
    const actor = staff();
    return mutate(ticketId, options.revision, actor, (ticket, checkOnly) => {
      if (ticket.status === STATUS.CLOSED) throw new Error("Reopen this ticket before changing assignment or priority.");
      let assignee = null;
      if (changes.assignedStaffId !== undefined) {
        requireCapability("assign");
        assignee = changes.assignedStaffId ? eligibleStaff().find((entry) => entry.accountNumber === changes.assignedStaffId) : null;
        if (changes.assignedStaffId && !assignee) throw new Error("Choose an eligible provisioned staff account.");
      }
      if (changes.priority !== undefined) { requireCapability("manage"); if (!policy().priorities.includes(changes.priority)) throw new Error("Choose a configured priority."); }
      const assignmentChanged = changes.assignedStaffId !== undefined && changes.assignedStaffId !== ticket.assignedStaffId;
      const priorityChanged = changes.priority !== undefined && changes.priority !== ticket.priority;
      if (!assignmentChanged && !priorityChanged) return false;
      if (checkOnly) return true;
      if (assignmentChanged) { ticket.assignedStaffId = assignee?.accountNumber || ""; ticket.assignedStaff = assignee?.fullName || ""; const activity = event(ticket, "Staff Assignment Updated", actor, ticket.status, ticket.assignedStaff ? `Assigned to ${ticket.assignedStaff}` : "Assignment cleared"); if (assignee) notify(ticket, "Support inquiry assigned to you", "staff", [assignee.accountNumber], activity.id); }
      if (priorityChanged) { ticket.priority = changes.priority; event(ticket, "Priority Updated", actor, ticket.status, ticket.priority); }
    });
  }
  function transition(ticketId, target, options = {}) {
    const actor = window.PortalProfile?.snapshot()?.account?.role === "student" ? student() : staff();
    if (options.confirmed !== true) throw new Error("Confirm the ticket status action first.");
    const reason = text(options.reason, 2000, "Remarks", false);
    return mutate(ticketId, options.revision, actor, (ticket, checkOnly) => {
      if (!TRANSITIONS[ticket.status]?.includes(target)) throw new Error(`A ${ticket.status} ticket cannot move to ${target}.`);
      if (actor.role === "student") { if (ticket.status !== STATUS.RESOLVED || target !== STATUS.OPEN || !policy().allowStudentReopenResolved) throw new Error("Students may only reopen their own eligible resolved tickets."); }
      else {
        requireCapability(target === STATUS.RESOLVED ? "resolve" : target === STATUS.CLOSED ? "close" : target === STATUS.OPEN ? "reopen" : "manage");
        if (ticket.status === STATUS.CLOSED && !policy().allowStaffReopenClosed) throw new Error("Reopening closed tickets is not configured.");
      }
      if (checkOnly) return true;
      const previous = ticket.status; ticket.status = target;
      const action = target === STATUS.OPEN ? "Ticket Reopened" : target === STATUS.RESOLVED ? "Ticket Resolved" : target === STATUS.CLOSED ? "Ticket Closed" : "Status Changed";
      const activity = event(ticket, action, actor, previous, reason);
      if (target === STATUS.RESOLVED) ticket.resolutions.push({ id: id("RES"), timestamp: now(), actor: actor.name, actorId: actor.id, summary: reason });
      if (target === STATUS.OPEN) notify(ticket, "Support inquiry reopened", "staff", actor.role === "student" ? studentTargets(ticket) : staffTargets(ticket), activity.id);
      else if ([STATUS.WAITING, STATUS.RESOLVED, STATUS.CLOSED].includes(target)) notify(ticket, action, "student", [ticket.studentNumber], activity.id);
    });
  }
  function related(ticketId) {
    const ticket = getStaff(ticketId); if (!ticket) throw new Error("This ticket is unavailable to your account.");
    const request = ticket.requestId && window.PortalRequestService.get(ticket.requestId);
    const appointment = ticket.appointmentId && window.PortalAppointmentService.get(ticket.appointmentId);
    return { request: request && request.studentNumber === ticket.studentNumber ? { id: request.id, documentType: request.documentType, status: request.status } : null, appointment: appointment && appointment.studentNumber === ticket.studentNumber ? { id: appointment.id, date: appointment.date, start: appointment.start, end: appointment.end, serviceType: appointment.serviceType, status: appointment.status } : null };
  }
  function summary(records = listStaff()) { return { total: records.length, open: records.filter((ticket) => ticket.status === STATUS.OPEN).length, progress: records.filter((ticket) => ticket.status === STATUS.PROGRESS).length, resolved: records.filter((ticket) => ticket.status === STATUS.RESOLVED).length, waiting: records.filter((ticket) => ticket.status === STATUS.WAITING).length, closed: records.filter((ticket) => ticket.status === STATUS.CLOSED).length }; }
  function notifications() {
    const actor = window.PortalProfile?.snapshot()?.account?.role === "student" ? student() : staff();
    return read().filter((ticket) => actor.role === "student" ? ticket.studentNumber === actor.id : canView(ticket, actor)).flatMap((ticket) => ticket.notifications.filter((notice) => notice.targetRole === actor.role && (notice.targetId === actor.id || actor.role === "staff" && notice.targetId === "support-inbox" && capabilities().includes("viewAll"))).map(({ id: noticeId, label, timestamp, read, readBy, mandatory }) => ({ id: `support:${noticeId}`, source: "support", ticketId: ticket.id, title: label, timestamp, unread: !read && !(readBy || []).includes(actor.id), mandatory: Boolean(mandatory || ticket.priority === "Urgent" || actor.role === "staff" && (label.startsWith("Support inquiry assigned to you") || label.startsWith("Support inquiry reopened"))) })));
  }
  function markRead(noticeId) {
    const actor = window.PortalProfile?.snapshot()?.account?.role === "student" ? student() : staff(); const records = read();
    for (const ticket of records) {
      if (actor.role === "student" ? ticket.studentNumber !== actor.id : !canView(ticket, actor)) continue;
      const notice = ticket.notifications.find((entry) => `support:${entry.id}` === noticeId && entry.targetRole === actor.role && (entry.targetId === actor.id || actor.role === "staff" && entry.targetId === "support-inbox" && capabilities().includes("viewAll")));
      if (notice) { if (notice.targetId === "support-inbox") { if (!(notice.readBy || []).includes(actor.id)) { notice.readBy = [...(notice.readBy || []), actor.id]; write(records); } } else if (!notice.read) { notice.read = true; write(records); } return; }
    }
    throw new Error("This support update is unavailable to your account.");
  }
  function analytics(range = {}) {
    const records = listStaff(); const dates = window.PortalReportService.validateFilters({ start: range.start, end: range.end }); const start = Date.parse(`${dates.start}T00:00:00+08:00`); const end = Date.parse(`${dates.end}T23:59:59.999+08:00`);
    const stamp = window.PortalReportService.timestamp;
    const inRange = (value) => { const time = stamp(value); return time !== null && time >= start && time <= end && time <= Date.now(); };
    const cohort = records.filter((ticket) => inRange(ticket.createdAt));
    const mean = (pairs) => { const values = pairs.filter(([from, to]) => stamp(from) !== null && stamp(to) !== null && stamp(to) >= stamp(from) && stamp(to) <= Date.now()).map(([from, to]) => (stamp(to) - stamp(from)) / 3600000); return { hours: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, eligible: values.length, excluded: pairs.length - values.length }; };
    const resolved = records.filter((ticket) => ticket.resolutions.some((resolution) => inRange(resolution.timestamp)));
    return { available: true, ...summary(cohort), byCategory: policy().categories.map((category) => ({ label: category, value: cohort.filter((ticket) => ticket.category === category).length })), resolvedDuringPeriod: resolved.length, firstResponse: mean(cohort.map((ticket) => [ticket.createdAt, ticket.messages.find((message) => message.role === "staff")?.timestamp || ""])), resolution: mean(resolved.map((ticket) => [ticket.createdAt, ticket.resolutions.filter((entry) => inRange(entry.timestamp)).at(-1).timestamp])) };
  }
  window.addEventListener("storage", (entry) => { if (entry.key === null || entry.key === STORAGE_KEY) { document.dispatchEvent(new Event("portal:supportchanged")); document.dispatchEvent(new Event("portal:notificationschanged")); } });
  window.PortalSupportService = Object.freeze({ STATUS, TRANSITIONS, capabilities, eligibleStaff, listStaff, getStaff, listStudent, getStudent, create, reply, update, transition, related, summary, notifications, markRead, analytics });
})();
