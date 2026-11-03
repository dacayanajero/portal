"use strict";

(() => {
  const STORAGE_KEY = "rtu.portal.appointments.v1";
  const REQUEST_KEY = "rtu.portal.requests.v1";
  const DEFAULT_CAPACITY = 1;
  const OPERATING_START = "08:00";
  const OPERATING_END = "17:00";
  const LATEST_START = "16:00";
  const SLOT_MINUTES = 60;
  const MANILA_TIMEZONE = "Asia/Manila";

  const STATUS = Object.freeze({
    PENDING: "Pending Confirmation",
    SCHEDULED: "Scheduled",
    CHECKED_IN: "Checked In",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No Show",
  });

  const STATUSES = Object.freeze(Object.values(STATUS));
  const ACTIVE_STATUSES = Object.freeze([STATUS.PENDING, STATUS.SCHEDULED, STATUS.CHECKED_IN]);
  const TERMINAL_STATUSES = Object.freeze([STATUS.COMPLETED, STATUS.CANCELLED, STATUS.NO_SHOW]);

  const STATUS_META = Object.freeze({
    [STATUS.PENDING]: { tone: "pending", description: "Awaiting staff confirmation" },
    [STATUS.SCHEDULED]: { tone: "scheduled", description: "Confirmed and scheduled" },
    [STATUS.CHECKED_IN]: { tone: "checked-in", description: "Student has checked in" },
    [STATUS.COMPLETED]: { tone: "completed", description: "Appointment completed" },
    [STATUS.CANCELLED]: { tone: "cancelled", description: "Appointment cancelled" },
    [STATUS.NO_SHOW]: { tone: "no-show", description: "Student did not attend" },
  });

  const TRANSITIONS = Object.freeze({
    [STATUS.PENDING]: Object.freeze([STATUS.SCHEDULED, STATUS.CANCELLED]),
    [STATUS.SCHEDULED]: Object.freeze([STATUS.CHECKED_IN, STATUS.COMPLETED, STATUS.CANCELLED, STATUS.NO_SHOW]),
    [STATUS.CHECKED_IN]: Object.freeze([STATUS.COMPLETED, STATUS.CANCELLED, STATUS.NO_SHOW]),
    [STATUS.COMPLETED]: Object.freeze([]),
    [STATUS.CANCELLED]: Object.freeze([]),
    [STATUS.NO_SHOW]: Object.freeze([]),
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isStatus(value) {
    return STATUSES.includes(value);
  }

  function statusMeta(status) {
    return STATUS_META[status] || { tone: "pending", description: "" };
  }

  function statusTone(status) {
    return statusMeta(status).tone;
  }

  function allowedTransitions(status) {
    return TRANSITIONS[status] || [];
  }

  function canTransition(from, to) {
    return allowedTransitions(from).includes(to);
  }

  function requiresReason(status) {
    return [STATUS.CANCELLED, STATUS.NO_SHOW].includes(status);
  }

  function manilaDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: MANILA_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function manilaDateTime() {
    const date = manilaDate();
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: MANILA_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    return `${date}T${time}`;
  }

  function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  }

  function validTime(value) {
    return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
  }

  function toMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function fromMinutes(total) {
    const hours = String(Math.floor(total / 60)).padStart(2, "0");
    const minutes = String(total % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function normalizeTime(value) {
    if (!validTime(value)) return "";
    return value;
  }

  function readStoredList() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeAll(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  function appointmentFromRequest(request) {
    const appointment = request?.appointment || {};
    const date = typeof appointment.date === "string" ? appointment.date : "";
    const start = typeof appointment.start === "string" ? appointment.start : "";
    const end = typeof appointment.end === "string" ? appointment.end : "";
    const timeRange = typeof appointment.timeRange === "string" ? appointment.timeRange : "";
    const display = typeof appointment.display === "string" ? appointment.display : "";
    if (!date || !start) return null;
    return {
      requestId: request.id,
      studentNumber: request.studentNumber,
      studentName: request.studentName,
      serviceType: request.documentType,
      date,
      start: normalizeTime(start),
      end: normalizeTime(end) || fromMinutes(toMinutes(start) + SLOT_MINUTES),
      timeRange,
      display,
      bookingDate: request.submittedAt,
    };
  }

  function normalizeRecord(record, request) {
    const appointment = record || {};
    const base = appointmentFromRequest(request) || {};
    const date = validDate(appointment.date || base.date) ? (appointment.date || base.date) : base.date;
    const start = validTime(appointment.start || base.start) ? (appointment.start || base.start) : base.start;
    const end = validTime(appointment.end || base.end) ? (appointment.end || base.end) : (start ? fromMinutes(toMinutes(start) + SLOT_MINUTES) : "");
    const history = Array.isArray(appointment.history) ? appointment.history : [];
    const rescheduleHistory = Array.isArray(appointment.rescheduleHistory) ? appointment.rescheduleHistory : [];
    const normalized = {
      id: typeof appointment.id === "string" && appointment.id.trim() ? appointment.id.trim() : "",
      requestId: typeof (appointment.requestId || base.requestId) === "string" ? (appointment.requestId || base.requestId) : "",
      studentNumber: typeof (appointment.studentNumber || base.studentNumber) === "string" ? (appointment.studentNumber || base.studentNumber) : "",
      studentName: typeof (appointment.studentName || base.studentName) === "string" ? (appointment.studentName || base.studentName) : "",
      serviceType: typeof (appointment.serviceType || base.serviceType) === "string" ? (appointment.serviceType || base.serviceType) : "",
      date,
      start,
      end,
      timeRange: typeof (appointment.timeRange || base.timeRange) === "string" ? (appointment.timeRange || base.timeRange) : (start && end ? `${start} - ${end}` : ""),
      display: typeof (appointment.display || base.display) === "string" ? (appointment.display || base.display) : "",
      bookingDate: typeof (appointment.bookingDate || base.bookingDate) === "string" ? (appointment.bookingDate || base.bookingDate) : (request?.submittedAt || new Date().toISOString()),
      status: isStatus(appointment.status) ? appointment.status : STATUS.PENDING,
      createdAt: typeof appointment.createdAt === "string" && !Number.isNaN(new Date(appointment.createdAt).getTime()) ? appointment.createdAt : (request?.submittedAt || new Date().toISOString()),
      updatedAt: typeof appointment.updatedAt === "string" && !Number.isNaN(new Date(appointment.updatedAt).getTime()) ? appointment.updatedAt : (request?.submittedAt || new Date().toISOString()),
      confirmedBy: typeof appointment.confirmedBy === "string" ? appointment.confirmedBy : "",
      confirmedAt: typeof appointment.confirmedAt === "string" ? appointment.confirmedAt : "",
      checkedInBy: typeof appointment.checkedInBy === "string" ? appointment.checkedInBy : "",
      checkedInAt: typeof appointment.checkedInAt === "string" ? appointment.checkedInAt : "",
      completedBy: typeof appointment.completedBy === "string" ? appointment.completedBy : "",
      completedAt: typeof appointment.completedAt === "string" ? appointment.completedAt : "",
      cancelledBy: typeof appointment.cancelledBy === "string" ? appointment.cancelledBy : "",
      cancelledAt: typeof appointment.cancelledAt === "string" ? appointment.cancelledAt : "",
      cancelReason: typeof appointment.cancelReason === "string" ? appointment.cancelReason : "",
      noShowBy: typeof appointment.noShowBy === "string" ? appointment.noShowBy : "",
      noShowAt: typeof appointment.noShowAt === "string" ? appointment.noShowAt : "",
      rescheduleHistory: rescheduleHistory.map((entry) => ({
        from: { date: entry?.from?.date || "", start: entry?.from?.start || "", end: entry?.from?.end || "" },
        to: { date: entry?.to?.date || "", start: entry?.to?.start || "", end: entry?.to?.end || "" },
        reason: typeof entry?.reason === "string" ? entry.reason : "",
        staff: typeof entry?.staff === "string" ? entry.staff : "",
        timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : "",
      })),
      history: history.map((entry) => ({
        action: typeof entry?.action === "string" ? entry.action : "Status Updated",
        previousStatus: typeof entry?.previousStatus === "string" ? entry.previousStatus : "",
        newStatus: isStatus(entry?.newStatus) ? entry.newStatus : (isStatus(appointment.status) ? appointment.status : STATUS.PENDING),
        actor: typeof entry?.actor === "string" ? entry.actor : "",
        actorRole: entry?.actorRole === "staff" ? "staff" : "",
        remarks: typeof entry?.remarks === "string" ? entry.remarks : "",
        timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : "",
      })),
      demo: appointment.demo !== false,
    };
    if (!normalized.history.length) {
      normalized.history.push({
        action: "Appointment Booked",
        previousStatus: "",
        newStatus: normalized.status,
        actor: normalized.studentName,
        actorRole: "student",
        remarks: "Created from a student document request. Browser-local demo only.",
        timestamp: normalized.createdAt,
      });
    }
    return normalized;
  }

  function nextId(records, year) {
    const prefix = `APT-${year}-`;
    const maximum = records.reduce((highest, record) => {
      if (!record.id.startsWith(prefix)) return highest;
      const value = Number(record.id.slice(prefix.length));
      return Number.isInteger(value) && value > highest ? value : highest;
    }, 0);
    return `${prefix}${String(maximum + 1).padStart(4, "0")}`;
  }

  function readAll() {
    const service = window.PortalRequestService;
    const requests = service ? service.listAll() : [];
    const stored = readStoredList();
    const byRequest = new Map((stored || []).map((record) => [record.requestId, record]));
    let changed = false;
    const records = [];
    requests.forEach((request) => {
      const base = appointmentFromRequest(request);
      if (!base) return;
      if (byRequest.has(request.id)) {
        records.push(normalizeRecord(byRequest.get(request.id), request));
      } else {
        const now = new Date().toISOString();
        records.push(normalizeRecord({
          id: nextId(records.concat(Array.from(byRequest.values())), new Date(base.bookingDate).getFullYear()),
          ...base,
          status: STATUS.PENDING,
          createdAt: now,
          updatedAt: now,
          history: [{
            action: "Appointment Booked",
            previousStatus: "",
            newStatus: STATUS.PENDING,
            actor: base.studentName,
            actorRole: "student",
            remarks: "Created from a student document request. Browser-local demo only.",
            timestamp: now,
          }],
        }, request));
        changed = true;
      }
    });
    const validRequestIds = new Set(requests.map((request) => request.id));
    const extras = (stored || []).filter((record) => !validRequestIds.has(record.requestId));
    extras.forEach((record) => records.push(normalizeRecord(record, null)));
    if (changed) writeAll(records);
    return records.sort((first, second) => {
      const firstKey = `${first.date}T${first.start}`;
      const secondKey = `${second.date}T${second.start}`;
      return firstKey.localeCompare(secondKey);
    });
  }

  function listAll() {
    return readAll();
  }

  function listForStudent(studentNumber) {
    const number = String(studentNumber || "").trim();
    if (!number) return [];
    return listAll().filter((appointment) => appointment.studentNumber === number);
  }

  function get(id) {
    return listAll().find((appointment) => appointment.id === id) || null;
  }

  function getByRequest(requestId) {
    return listAll().find((appointment) => appointment.requestId === requestId) || null;
  }

  function validateSlot(date, start, end, excludeId = "") {
    if (!validDate(date)) throw new Error("Choose a valid appointment date.");
    if (!validTime(start) || !validTime(end)) throw new Error("Choose a valid appointment time.");
    if (date < manilaDate()) throw new Error("Appointment dates cannot be in the past.");
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    if (startMinutes < toMinutes(OPERATING_START) || endMinutes > toMinutes(OPERATING_END)) throw new Error("Appointments must be between 8:00 AM and 5:00 PM.");
    if (startMinutes > toMinutes(LATEST_START)) throw new Error("The latest appointment start time is 4:00 PM.");
    if (endMinutes - startMinutes !== SLOT_MINUTES) throw new Error("Appointments must be exactly one hour.");
    const overlapping = listAll().filter((appointment) => (
      appointment.id !== excludeId
      && appointment.date === date
      && ACTIVE_STATUSES.includes(appointment.status)
      && toMinutes(appointment.start) < endMinutes
      && startMinutes < toMinutes(appointment.end)
    ));
    if (overlapping.length >= DEFAULT_CAPACITY) throw new Error("This time slot is no longer available.");
    return true;
  }

  function updateRecord(id, updater, actor) {
    const currentAccount = window.PortalStaffContext?.current()?.account;
    if (actor?.role !== "staff" || !String(actor?.name || "").trim() || currentAccount?.role !== "staff" || actor.accountNumber !== currentAccount.accountNumber) throw new Error("Only an active authorized staff member can perform this action.");
    const all = listAll();
    const index = all.findIndex((appointment) => appointment.id === id);
    if (index === -1) throw new Error("This appointment could not be found.");
    const current = all[index];
    const updated = updater(clone(current), actor);
    updated.updatedAt = new Date().toISOString();
    all[index] = normalizeRecord(updated, null);
    const persisted = writeAll(all);
    document.dispatchEvent(new CustomEvent("portal:appointmentschanged", { detail: { appointment: clone(all[index]), persisted } }));
    return { appointment: clone(all[index]), persisted };
  }

  function confirmAppointment(id, actor, remarks = "") {
    return updateRecord(id, (appointment, staffActor) => {
      if (appointment.status !== STATUS.PENDING) throw new Error("Only appointments awaiting confirmation can be confirmed.");
      const note = String(remarks || "").trim();
      const now = new Date().toISOString();
      appointment.status = STATUS.SCHEDULED;
      appointment.confirmedBy = staffActor.name;
      appointment.confirmedAt = now;
      appointment.staffRemarks = note || appointment.staffRemarks;
      appointment.history = [...appointment.history, {
        action: "Appointment Confirmed",
        previousStatus: STATUS.PENDING,
        newStatus: STATUS.SCHEDULED,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: note || "Appointment confirmed by staff.",
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function checkIn(id, actor) {
    return updateRecord(id, (appointment, staffActor) => {
      if (appointment.status !== STATUS.SCHEDULED) throw new Error("Only scheduled appointments can be checked in.");
      const now = new Date().toISOString();
      appointment.status = STATUS.CHECKED_IN;
      appointment.checkedInBy = staffActor.name;
      appointment.checkedInAt = now;
      appointment.history = [...appointment.history, {
        action: "Student Checked In",
        previousStatus: STATUS.SCHEDULED,
        newStatus: STATUS.CHECKED_IN,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: "Student arrived and checked in.",
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function completeAppointment(id, actor, remarks = "") {
    return updateRecord(id, (appointment, staffActor) => {
      if (appointment.status !== STATUS.CHECKED_IN) throw new Error("Only checked-in appointments can be completed.");
      const now = new Date().toISOString();
      const note = String(remarks || "").trim();
      appointment.status = STATUS.COMPLETED;
      appointment.completedBy = staffActor.name;
      appointment.completedAt = now;
      if (note) appointment.staffRemarks = note;
      appointment.history = [...appointment.history, {
        action: "Appointment Completed",
        previousStatus: STATUS.CHECKED_IN,
        newStatus: STATUS.COMPLETED,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: note || "Appointment completed.",
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function markNoShow(id, actor, reason = "") {
    return updateRecord(id, (appointment, staffActor) => {
      if (appointment.status !== STATUS.SCHEDULED && appointment.status !== STATUS.CHECKED_IN) throw new Error("Only scheduled or checked-in appointments can be marked as no-show.");
      const appointmentEnd = new Date(`${appointment.date}T${appointment.end}:00`);
      if (!Number.isNaN(appointmentEnd.getTime()) && new Date() < appointmentEnd) throw new Error("An appointment cannot be marked as no-show before its scheduled end time.");
      const why = String(reason || "").trim();
      if (why.length > 500) throw new Error("Use at most 500 characters for the no-show reason.");
      const now = new Date().toISOString();
      appointment.status = STATUS.NO_SHOW;
      appointment.noShowBy = staffActor.name;
      appointment.noShowAt = now;
      if (why) appointment.staffRemarks = why;
      appointment.history = [...appointment.history, {
        action: "Marked No Show",
        previousStatus: appointment.status === STATUS.NO_SHOW ? appointment.status : (appointment.checkedInAt ? STATUS.CHECKED_IN : STATUS.SCHEDULED),
        newStatus: STATUS.NO_SHOW,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: why || "Student did not attend the appointment.",
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function cancelAppointment(id, actor, reason) {
    const why = String(reason || "").trim();
    if (!why) throw new Error("Enter a reason before cancelling this appointment.");
    if (why.length > 500) throw new Error("Use at most 500 characters for the cancellation reason.");
    return updateRecord(id, (appointment, staffActor) => {
      if (![STATUS.PENDING, STATUS.SCHEDULED, STATUS.CHECKED_IN].includes(appointment.status)) throw new Error("This appointment cannot be cancelled.");
      const now = new Date().toISOString();
      appointment.status = STATUS.CANCELLED;
      appointment.cancelledBy = staffActor.name;
      appointment.cancelledAt = now;
      appointment.cancelReason = why;
      appointment.history = [...appointment.history, {
        action: "Appointment Cancelled",
        previousStatus: appointment.status === STATUS.CANCELLED ? appointment.status : appointment.status,
        newStatus: STATUS.CANCELLED,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: why,
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function rescheduleAppointment(id, actor, newDate, newStart, newEnd, reason) {
    const why = String(reason || "").trim();
    if (!why) throw new Error("Enter a reason before rescheduling this appointment.");
    if (why.length > 500) throw new Error("Use at most 500 characters for the rescheduling reason.");
    validateSlot(newDate, newStart, newEnd, id);
    return updateRecord(id, (appointment, staffActor) => {
      if (![STATUS.PENDING, STATUS.SCHEDULED].includes(appointment.status)) throw new Error("Only pending or scheduled appointments can be rescheduled.");
      const now = new Date().toISOString();
      const previous = { date: appointment.date, start: appointment.start, end: appointment.end };
      appointment.rescheduleHistory = [...appointment.rescheduleHistory, {
        from: previous,
        to: { date: newDate, start: newStart, end: newEnd },
        reason: why,
        staff: staffActor.name,
        timestamp: now,
      }];
      appointment.date = newDate;
      appointment.start = newStart;
      appointment.end = newEnd;
      appointment.timeRange = `${newStart} - ${newEnd}`;
      appointment.display = `${newDate} · ${newStart} - ${newEnd}`;
      appointment.history = [...appointment.history, {
        action: "Appointment Rescheduled",
        previousStatus: appointment.status,
        newStatus: appointment.status,
        actor: staffActor.name,
        actorRole: "staff",
        remarks: `Moved from ${previous.date} ${previous.start}-${previous.end} to ${newDate} ${newStart}-${newEnd}. ${why}`,
        timestamp: now,
      }];
      return appointment;
    }, actor);
  }

  function summary() {
    const records = listAll();
    const today = manilaDate();
    const counts = {
      total: records.length,
      today: records.filter((record) => record.date === today && ACTIVE_STATUSES.includes(record.status)).length,
      upcoming: records.filter((record) => record.date > today && ACTIVE_STATUSES.includes(record.status)).length,
      completed: records.filter((record) => record.status === STATUS.COMPLETED).length,
      cancelled: records.filter((record) => record.status === STATUS.CANCELLED).length,
      noShow: records.filter((record) => record.status === STATUS.NO_SHOW).length,
      checkedIn: records.filter((record) => record.status === STATUS.CHECKED_IN).length,
      pending: records.filter((record) => record.status === STATUS.PENDING).length,
      scheduled: records.filter((record) => record.status === STATUS.SCHEDULED).length,
    };
    return counts;
  }

  function availability(date, start, end) {
    if (!validDate(date) || !validTime(start) || !validTime(end)) return { booked: 0, capacity: DEFAULT_CAPACITY, remaining: DEFAULT_CAPACITY, status: "Unavailable" };
    const booked = listAll().filter((appointment) => (
      appointment.date === date
      && ACTIVE_STATUSES.includes(appointment.status)
      && toMinutes(appointment.start) < toMinutes(end)
      && toMinutes(start) < toMinutes(appointment.end)
    )).length;
    const remaining = Math.max(0, DEFAULT_CAPACITY - booked);
    let status = "Available";
    if (date < manilaDate()) status = "Unavailable";
    else if (remaining === 0) status = "Fully Booked";
    else if (remaining < DEFAULT_CAPACITY) status = "Limited Slots";
    return { booked, capacity: DEFAULT_CAPACITY, remaining, status };
  }

  function actorName(actor) {
    return String(actor?.name || actor?.fullName || "").trim();
  }

  function sourceInfo() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return { available: true };
      const records = JSON.parse(raw);
      return { available: Array.isArray(records) && records.every((record) => record && typeof record.id === "string" && typeof record.requestId === "string" && isStatus(record.status)) };
    } catch { return { available: false }; }
  }

  window.PortalAppointmentService = Object.freeze({
    sourceInfo,
    STORAGE_KEY,
    STATUS,
    STATUSES,
    STATUS_META,
    MANILA_TIMEZONE,
    OPERATING_START,
    OPERATING_END,
    LATEST_START,
    SLOT_MINUTES,
    DEFAULT_CAPACITY,
    isStatus,
    statusMeta,
    statusTone,
    allowedTransitions,
    canTransition,
    requiresReason,
    manilaDate,
    manilaDateTime,
    validDate,
    validTime,
    toMinutes,
    fromMinutes,
    listAll,
    listForStudent,
    get,
    getByRequest,
    validateSlot,
    confirmAppointment,
    checkIn,
    completeAppointment,
    markNoShow,
    cancelAppointment,
    rescheduleAppointment,
    summary,
    availability,
  });

  document.addEventListener("portal:requestschanged", () => {
    try { readAll(); } catch {}
    document.dispatchEvent(new CustomEvent("portal:appointmentschanged", { detail: { source: "requests" } }));
  });
})();
