"use strict";

(() => {
  const requests = window.PortalRequestService;
  const appointments = window.PortalAppointmentService;
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const text = (value, max = 254) => typeof value === "string" && value.length <= max ? value.trim() : "";
  const fields = ["fullName", "email", "program", "yearLevel", "semester"];

  function requireStaff() {
    if (window.PortalStaffContext?.current()?.account?.role !== "staff") throw new Error("Authorized staff access is required.");
  }
  function unique(list, key) { return [...new Map(list.map((item) => [item[key], item])).values()]; }
  function directory() {
    requireStaff();
    // Project only the minimal fields needed by this workspace. Never return raw accounts.
    return unique(window.PortalAccounts.listRegisteredStudents(), "accountNumber").map((account) => {
      let saved = null;
      let profileUnavailable = false;
      try {
        const raw = window.localStorage.getItem(`rtu.portal.profile.${encodeURIComponent(account.accountNumber)}`);
        if (raw !== null) {
          saved = JSON.parse(raw);
          if (!saved || !Number.isFinite(saved.updatedAt) || saved.updatedAt <= 0 || Number.isNaN(new Date(saved.updatedAt).getTime()) || !saved.profile || typeof saved.profile !== "object" || Array.isArray(saved.profile)) {
            saved = null; profileUnavailable = true;
          }
        }
      } catch { profileUnavailable = true; }
      const result = { studentNumber: account.accountNumber, source: "Browser-local student registration / self-reported profile", profileUnavailable, provenance: {} };
      fields.forEach((field) => {
        const savedValue = saved?.profile?.[field];
        result[field] = typeof savedValue === "string" && savedValue.length <= 254 ? savedValue.trim() : text(account[field]);
        result.provenance[field] = typeof savedValue === "string" && savedValue.length <= 254 ? "Self-reported saved profile" : "Self-reported registration";
      });
      result.profileUpdatedAt = saved ? new Date(saved.updatedAt).toISOString() : "";
      result.missingFields = fields.filter((field) => !result[field]);
      result.completeness = result.missingFields.length ? "Additional Information Needed" : "Profile Information Available";
      result.enrollment = "Official enrollment verification is not connected.";
      return result;
    });
  }
  function shared() {
    return { requests: unique(requests.listAll(), "id"), appointments: unique(appointments.listAll(), "id") };
  }
  function isUpcoming(appointment) {
    const now = appointments.manilaDateTime();
    return [appointments.STATUS.PENDING, appointments.STATUS.SCHEDULED, appointments.STATUS.CHECKED_IN].includes(appointment.status)
      && `${appointment.date}T${appointment.start}` > now;
  }
  function summary(students, data) {
    const known = new Set(students.map((student) => student.studentNumber));
    const count = (list) => new Set(list.map((entry) => entry.studentNumber).filter((number) => known.has(number))).size;
    return {
      total: known.size,
      active: count(data.requests.filter((request) => requests.isActive(request.status))),
      upcoming: count(data.appointments.filter(isUpcoming)),
      released: count(data.requests.filter((request) => request.status === requests.STATUS.RELEASED)),
    };
  }
  function search(options = {}) {
    requireStaff();
    const all = directory();
    const data = shared();
    const query = normalize(options.query);
    const filtered = all.filter((student) => (!query || [student.studentNumber, student.fullName, student.program].some((value) => normalize(value).includes(query)))
      && ["program", "yearLevel", "semester"].every((field) => !options[field] || normalize(student[field]) === normalize(options[field])));
    const sortKey = options.sort === "number" ? "studentNumber" : "fullName";
    filtered.sort((a, b) => a[sortKey].localeCompare(b[sortKey], "en", { numeric: true, sensitivity: "base" }) || a.studentNumber.localeCompare(b.studentNumber));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(options.pageSize)) || 10));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, Math.trunc(Number(options.page)) || 1));
    const activeCounts = new Map();
    data.requests.filter((request) => requests.isActive(request.status)).forEach((request) => activeCounts.set(request.studentNumber, (activeCounts.get(request.studentNumber) || 0) + 1));
    return {
      students: filtered.slice((page - 1) * pageSize, page * pageSize).map((student) => ({ ...student, activeRequests: activeCounts.get(student.studentNumber) || 0 })),
      total: filtered.length, page, pages, summary: summary(all, data),
      facets: Object.fromEntries(["program", "yearLevel", "semester"].map((field) => [field, [...new Set(all.map((student) => student[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b))])),
    };
  }
  function get(studentNumber) {
    requireStaff();
    const student = directory().find((entry) => entry.studentNumber === studentNumber);
    if (!student) return null;
    const data = shared();
    const relatedRequests = data.requests.filter((request) => request.studentNumber === studentNumber).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const relatedAppointments = data.appointments.filter((appointment) => appointment.studentNumber === studentNumber).sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate));
    // Limit histories to lifecycle information; internal preparation/identity data is unnecessary here.
    const requestViews = relatedRequests.map((request) => ({ id: request.id, documentType: request.documentType, submittedAt: request.submittedAt, purpose: request.purpose, status: request.status, history: request.history.map(({ action, timestamp, newStatus, actor }) => ({ action, timestamp, status: newStatus, actor })) }));
    const appointmentViews = relatedAppointments.map((appointment) => ({ id: appointment.id, requestId: appointment.requestId, serviceType: appointment.serviceType, date: appointment.date, start: appointment.start, end: appointment.end, status: appointment.status, bookingDate: appointment.bookingDate, upcoming: isUpcoming(appointment), history: appointment.history.map(({ action, timestamp, actor }) => ({ action, timestamp, actor })) }));
    const releases = relatedRequests.filter((request) => request.status === requests.STATUS.RELEASED).map((request) => ({ requestId: request.id, reference: request.release?.reference || "", documentType: request.release?.documentType || request.documentType, copies: request.release?.copies || null, timestamp: request.release?.timestamp || request.releasedAt, actor: request.release?.actor || request.releasedBy, recipientType: request.release?.recipientType || "", legacy: !request.release })).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const timeline = [
      ...requestViews.flatMap((request) => request.history.map((event, index) => ({ ...event, id: `request:${request.id}:${index}`, reference: request.id, type: "Request" }))),
      ...appointmentViews.flatMap((appointment) => appointment.history.map((event, index) => ({ ...event, id: `appointment:${appointment.id}:${index}`, reference: appointment.id, type: "Appointment" }))),
    ].filter((event) => event.timestamp && !Number.isNaN(new Date(event.timestamp).getTime())).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { student, requests: requestViews, appointments: appointmentViews, releases, timeline };
  }
  function reportingAttributes() {
    requireStaff();
    return directory().map(({ studentNumber, program }) => ({ studentNumber, program }));
  }
  window.PortalStudentRecordService = Object.freeze({ search, get, reportingAttributes });
})();
