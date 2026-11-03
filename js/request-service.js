"use strict";

(() => {
  const STORAGE_KEY = "rtu.portal.requests.v1";
  const LEGACY_STAFF_KEY = "rtu.portal.staff.requests";

  const STATUS = Object.freeze({
    PENDING: "Pending Review",
    CORRECTION: "Needs Correction",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    PROCESSING: "Processing",
    READY: "Ready for Pickup",
    RELEASED: "Released",
    CANCELLED: "Cancelled",
  });

  const STATUSES = Object.freeze(Object.values(STATUS));

  const STATUS_META = Object.freeze({
    [STATUS.PENDING]: { tone: "pending", description: "Awaiting staff review" },
    [STATUS.CORRECTION]: { tone: "correction", description: "Student action required" },
    [STATUS.APPROVED]: { tone: "approved", description: "Approved for processing" },
    [STATUS.REJECTED]: { tone: "rejected", description: "Request rejected" },
    [STATUS.PROCESSING]: { tone: "processing", description: "Document being prepared" },
    [STATUS.READY]: { tone: "ready", description: "Ready for student pickup" },
    [STATUS.RELEASED]: { tone: "released", description: "Document released" },
    [STATUS.CANCELLED]: { tone: "cancelled", description: "Request cancelled" },
  });

  const TRANSITIONS = Object.freeze({
    [STATUS.PENDING]: Object.freeze([STATUS.CORRECTION, STATUS.APPROVED, STATUS.REJECTED, STATUS.CANCELLED]),
    [STATUS.CORRECTION]: Object.freeze([STATUS.PENDING, STATUS.CANCELLED]),
    [STATUS.APPROVED]: Object.freeze([STATUS.PROCESSING, STATUS.CANCELLED]),
    [STATUS.REJECTED]: Object.freeze([]),
    [STATUS.PROCESSING]: Object.freeze([STATUS.READY]),
    [STATUS.READY]: Object.freeze([STATUS.RELEASED]),
    [STATUS.RELEASED]: Object.freeze([]),
    [STATUS.CANCELLED]: Object.freeze([]),
  });

  const SERVICES = Object.freeze([
    "Grade Slip",
    "Registration Form",
    "ID Printing",
    "Transcript of Records",
    "Certificate of Enrollment",
  ]);

  const DOCUMENT_ALIASES = Object.freeze({
    gradeslip: "Grade Slip",
    "grade slip": "Grade Slip",
    "registration form": "Registration Form",
    regiform: "Registration Form",
    "id printing": "ID Printing",
    "transcript of records": "Transcript of Records",
    tor: "Transcript of Records",
    "certificate of enrollment": "Certificate of Enrollment",
    coe: "Certificate of Enrollment",
  });

  const ACTION_LABELS = Object.freeze({
    [STATUS.APPROVED]: "Approved by Staff",
    [STATUS.CORRECTION]: "Correction Requested",
    [STATUS.REJECTED]: "Request Rejected",
    [STATUS.PROCESSING]: "Processing Started",
    [STATUS.READY]: "Ready for Pickup",
    [STATUS.RELEASED]: "Document Released",
    [STATUS.CANCELLED]: "Request Cancelled",
  });

  let memory = [];
  let memoryAuthoritative = false;
  let migrationAttempted = false;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeDocument(value) {
    const text = String(value || "").trim();
    return DOCUMENT_ALIASES[text.toLowerCase()] || text;
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

  function statusDescription(status) {
    return statusMeta(status).description;
  }

  function allowedTransitions(status) {
    return TRANSITIONS[status] || [];
  }

  function canTransition(from, to) {
    return allowedTransitions(from).includes(to);
  }

  function isActive(status) {
    return ![STATUS.REJECTED, STATUS.RELEASED, STATUS.CANCELLED].includes(status);
  }

  function requiresReason(status) {
    return [STATUS.CORRECTION, STATUS.REJECTED, STATUS.CANCELLED].includes(status);
  }

  function canStudentCancel(status) {
    return [STATUS.PENDING, STATUS.CORRECTION].includes(status);
  }

  function validDate(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function normalizeHistory(history, request) {
    if (Array.isArray(history)) {
      return history.filter((entry) => entry && typeof entry.action === "string" && validDate(entry.timestamp)).map((entry) => ({
        action: entry.action,
        previousStatus: typeof entry.previousStatus === "string" ? entry.previousStatus : "",
        newStatus: isStatus(entry.newStatus) ? entry.newStatus : request.status,
        actor: typeof entry.actor === "string" ? entry.actor : "",
        actorRole: entry.actorRole === "staff" || entry.actorRole === "student" ? entry.actorRole : "",
        staff: typeof entry.staff === "string" ? entry.staff : "",
        staffId: typeof entry.staffId === "string" ? entry.staffId : "",
        remarks: typeof entry.remarks === "string" ? entry.remarks : "",
        timestamp: entry.timestamp,
      }));
    }
    return [{
      action: "Request Submitted",
      previousStatus: "",
      newStatus: request.status,
      actor: request.studentName || "",
      actorRole: "student",
      staff: "",
      remarks: "",
      timestamp: request.submittedAt,
    }];
  }

  function normalizeRecord(record) {
    const details = record.details && typeof record.details === "object" && !Array.isArray(record.details) ? record.details : {};
    const appointment = record.appointment && typeof record.appointment === "object" ? record.appointment : {};
    const normalized = {
      id: record.id,
      studentNumber: record.studentNumber,
      studentName: record.studentName,
      program: typeof record.program === "string" ? record.program : "",
      yearLevel: typeof record.yearLevel === "string" ? record.yearLevel : "",
      semester: typeof record.semester === "string" ? record.semester : "",
      documentType: normalizeDocument(record.documentType || record.service || record.document),
      purpose: typeof record.purpose === "string" ? record.purpose : "",
      details: clone(details),
      appointment: {
        date: typeof appointment.date === "string" ? appointment.date : "",
        dateLabel: typeof appointment.dateLabel === "string" ? appointment.dateLabel : "",
        start: typeof appointment.start === "string" ? appointment.start : "",
        end: typeof appointment.end === "string" ? appointment.end : "",
        timeRange: typeof appointment.timeRange === "string" ? appointment.timeRange : "",
        display: typeof appointment.display === "string" ? appointment.display : "",
      },
      submittedAt: record.submittedAt,
      updatedAt: validDate(record.updatedAt) ? record.updatedAt : record.submittedAt,
      status: record.status,
      assignedStaff: typeof record.assignedStaff === "string" ? record.assignedStaff : "",
      reviewDate: typeof record.reviewDate === "string" ? record.reviewDate : "",
      staffRemarks: typeof record.staffRemarks === "string" ? record.staffRemarks : "",
      correctionReason: typeof record.correctionReason === "string" ? record.correctionReason : "",
      rejectionReason: typeof record.rejectionReason === "string" ? record.rejectionReason : "",
      studentCorrectionNote: typeof record.studentCorrectionNote === "string" ? record.studentCorrectionNote : "",
      correctionSubmittedAt: typeof record.correctionSubmittedAt === "string" ? record.correctionSubmittedAt : "",
      approvedAt: typeof record.approvedAt === "string" ? record.approvedAt : "",
      processingStartedAt: typeof record.processingStartedAt === "string" ? record.processingStartedAt : "",
      readyAt: typeof record.readyAt === "string" ? record.readyAt : "",
      releasedAt: typeof record.releasedAt === "string" ? record.releasedAt : "",
      releasedBy: typeof record.releasedBy === "string" ? record.releasedBy : "",
      releaseVerification: typeof record.releaseVerification === "string" ? record.releaseVerification : "",
      processing: {
        checks: record.processing?.checks && typeof record.processing.checks === "object" ? clone(record.processing.checks) : {},
        notes: Array.isArray(record.processing?.notes) ? clone(record.processing.notes) : [],
        events: Array.isArray(record.processing?.events) ? clone(record.processing.events) : [],
      },
      notifications: Array.isArray(record.notifications) ? clone(record.notifications) : [],
      recipientVerification: record.recipientVerification && typeof record.recipientVerification === "object" ? clone(record.recipientVerification) : null,
      recipientVerifications: Array.isArray(record.recipientVerifications) ? clone(record.recipientVerifications) : [],
      release: record.release && typeof record.release === "object" ? clone(record.release) : null,
      cancelledAt: typeof record.cancelledAt === "string" ? record.cancelledAt : "",
      cancelledBy: typeof record.cancelledBy === "string" ? record.cancelledBy : "",
      cancelReason: typeof record.cancelReason === "string" ? record.cancelReason : "",
      demo: record.demo !== false,
      legacyDemo: Boolean(record.legacyDemo),
      source: typeof record.source === "string" ? record.source : "Student Portal (browser-local demo)",
    };
    normalized.history = normalizeHistory(record.history, normalized);
    return normalized;
  }

  function isStoredRecord(record) {
    return Boolean(
      record
      && typeof record.id === "string"
      && record.id.trim()
      && typeof record.studentNumber === "string"
      && record.studentNumber.trim()
      && typeof record.studentName === "string"
      && record.studentName.trim()
      && typeof record.documentType === "string"
      && record.documentType.trim()
      && typeof record.purpose === "string"
      && typeof record.submittedAt === "string"
      && validDate(record.submittedAt)
      && isStatus(record.status)
    );
  }

  function readStoredList() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const seen = new Set();
      return parsed.filter(isStoredRecord).filter((record) => {
        if (seen.has(record.id)) return false;
        seen.add(record.id);
        return true;
      }).map(normalizeRecord);
    } catch {
      return null;
    }
  }

  function writeAll(list, silent = false) {
    memory = clone(list);
    let persisted = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      persisted = true;
      memoryAuthoritative = false;
    } catch {
      persisted = false;
      memoryAuthoritative = true;
    }
    if (!silent) notifyChange(null, persisted);
    return persisted;
  }

  function notifyChange(request, persisted) {
    document.dispatchEvent(new CustomEvent("portal:requestschanged", {
      detail: { request: request ? clone(request) : null, requests: listAll(), persisted },
    }));
  }

  function legacyStatus(value) {
    const map = {
      Pending: STATUS.PENDING,
      "For Review": STATUS.PROCESSING,
      "Ready for Pickup": STATUS.READY,
      Completed: STATUS.RELEASED,
    };
    return map[value] || (isStatus(value) ? value : STATUS.PENDING);
  }

  function migrateLegacy() {
    if (migrationAttempted) return null;
    migrationAttempted = true;
    let legacy;
    try {
      legacy = JSON.parse(window.localStorage.getItem(LEGACY_STAFF_KEY) || "[]");
    } catch {
      return null;
    }
    if (!Array.isArray(legacy) || !legacy.length) return null;
    const imported = legacy.filter((record) => (
      record
      && typeof record.id === "string"
      && record.id.trim()
      && typeof record.studentName === "string"
      && typeof record.studentNumber === "string"
      && typeof record.service === "string"
      && validDate(record.submittedAt)
    )).map((record) => {
      const status = legacyStatus(record.status);
      const documentType = normalizeDocument(record.service);
      const timestamp = new Date().toISOString();
      return normalizeRecord({
        id: record.id,
        studentNumber: record.studentNumber,
        studentName: record.studentName,
        documentType,
        purpose: typeof record.purpose === "string" ? record.purpose : "",
        details: { studentNumber: record.studentNumber, fullName: record.studentName },
        appointment: { display: typeof record.schedule === "string" ? record.schedule : "" },
        submittedAt: record.submittedAt,
        updatedAt: record.submittedAt,
        status,
        demo: true,
        legacyDemo: true,
        source: "Phase A browser demo data",
        history: [
          {
            action: "Request Submitted",
            previousStatus: "",
            newStatus: STATUS.PENDING,
            actor: record.studentName,
            actorRole: "student",
            staff: "",
            remarks: "Phase A demo record.",
            timestamp: record.submittedAt,
          },
          {
            action: "Demo Record Imported",
            previousStatus: STATUS.PENDING,
            newStatus: status,
            actor: "Portal migration",
            actorRole: "staff",
            staff: "",
            remarks: "Imported from the Phase A staff request demo store.",
            timestamp,
          },
        ],
      });
    });
    if (!imported.length) return null;
    writeAll(imported, true);
    return imported;
  }

  function readAll() {
    if (memoryAuthoritative) return clone(memory);
    const stored = readStoredList();
    if (stored !== null) return stored;
    const migrated = migrateLegacy();
    if (migrated !== null) return migrated;
    return clone(memory);
  }

  function listAll() {
    return readAll().sort((first, second) => new Date(second.submittedAt) - new Date(first.submittedAt));
  }

  function listForStudent(studentNumber) {
    const number = String(studentNumber || "").trim();
    if (!number || !canReadStudent(number)) return [];
    return listAll().filter((request) => request.studentNumber === number).map(studentView);
  }

  function canReadStudent(studentNumber) {
    const staff = window.PortalStaffContext?.current()?.account;
    const student = window.PortalProfile?.snapshot()?.account;
    return staff?.role === "staff" || (student?.role === "student" && student.accountNumber === studentNumber);
  }

  function studentView(request) {
    const result = clone(request);
    delete result.processing;
    delete result.recipientVerification;
    delete result.recipientVerifications;
    delete result.releaseVerification;
    if (result.release) result.release = { reference: result.release.reference, timestamp: result.release.timestamp, copies: result.release.copies };
    return result;
  }

  function get(id) {
    return listAll().find((request) => request.id === id) || null;
  }

  function getForStudent(id, studentNumber) {
    const request = get(id);
    return request && canReadStudent(studentNumber) && request.studentNumber === studentNumber ? studentView(request) : null;
  }

  function nextId(requests, year) {
    const prefix = `REQ-${year}-`;
    const maximum = requests.reduce((highest, request) => {
      if (!request.id.startsWith(prefix)) return highest;
      const value = Number(request.id.slice(prefix.length));
      return Number.isInteger(value) && value > highest ? value : highest;
    }, 0);
    return `${prefix}${String(maximum + 1).padStart(4, "0")}`;
  }

  function appointmentFromDetails(details) {
    const date = typeof details.appointmentDate === "string" ? details.appointmentDate : "";
    const dateLabel = typeof details.appointmentDateLabel === "string" ? details.appointmentDateLabel : "";
    const start = typeof details.appointmentStart === "string" ? details.appointmentStart : "";
    const end = typeof details.appointmentEnd === "string" ? details.appointmentEnd : "";
    const timeRange = typeof details.appointmentTimeRange === "string" ? details.appointmentTimeRange : "";
    return {
      date,
      dateLabel,
      start,
      end,
      timeRange,
      display: [dateLabel || date, timeRange].filter(Boolean).join(" · "),
    };
  }

  function create({ student, document: documentName, purpose, details = {} }) {
    if (!student || typeof student.accountNumber !== "string" || !student.accountNumber.trim()) return null;
    if (typeof documentName !== "string" || !documentName.trim()) return null;
    if (typeof purpose !== "string" || !purpose.trim()) return null;
    const studentNumber = student.accountNumber.trim();
    const studentName = String(details.fullName || student.fullName || "").trim();
    if (!studentName) return null;
    const submittedAt = new Date().toISOString();
    const all = readAll();
    const request = normalizeRecord({
      id: nextId(all, new Date(submittedAt).getFullYear()),
      studentNumber,
      studentName,
      program: details.program || student.program || "",
      yearLevel: details.yearLevel || student.yearLevel || "",
      semester: details.semester || student.semester || "",
      documentType: normalizeDocument(documentName),
      purpose: purpose.trim(),
      details: clone(details),
      appointment: appointmentFromDetails(details),
      submittedAt,
      updatedAt: submittedAt,
      status: STATUS.PENDING,
      source: "Student Portal (browser-local demo)",
      demo: true,
      history: [{
        action: "Request Submitted",
        previousStatus: "",
        newStatus: STATUS.PENDING,
        actor: studentName,
        actorRole: "student",
        staff: "",
        remarks: "Submitted through the student portal. Browser-local demo only.",
        timestamp: submittedAt,
      }],
    });
    all.unshift(request);
    const persisted = writeAll(all, true);
    notifyChange(request, persisted);
    return clone(request);
  }

  function actionLabel(previousStatus, newStatus) {
    if (previousStatus === STATUS.CORRECTION && newStatus === STATUS.PENDING) return "Corrections Submitted";
    return ACTION_LABELS[newStatus] || "Status Updated";
  }

  function actorName(actor) {
    return String(actor?.name || actor?.fullName || "").trim();
  }

  function requireStaff(actor) {
    const current = window.PortalStaffContext?.current();
    if (actor?.role !== "staff" || !actorName(actor) || current?.account?.role !== "staff" || actor.accountNumber !== current.account.accountNumber) throw new Error("Only a signed-in authorized staff member can perform this action.");
  }

  function policyFor(request) {
    return window.PortalDocumentPolicy?.services[request.documentType];
  }

  function preparationComplete(request) {
    const policy = policyFor(request);
    return Boolean(policy?.configured && policy.items.length && policy.items.every((item) => !item.required || (
      request.processing?.checks?.[item.id]?.checked === true
      && request.processing.checks[item.id].version === window.PortalDocumentPolicy.version
    )));
  }

  function verificationComplete(request) {
    const policy = window.PortalDocumentPolicy;
    const verification = request.recipientVerification;
    return Boolean(policy?.verification.configured && verification
      && verification.version === policy.version
      && policy.verification.methods.some((method) => method.id === verification.methodId)
      && (verification.recipientType === "Requesting Student" || (policy.verification.allowRepresentative && verification.recipientType === "Authorized Representative"))
      && policy.verification.releaseChecks.every((item) => verification.requirements?.includes(item.id)));
  }

  // Internal audit data stays separate from the student-visible lifecycle history.
  function processingAction(id, actor, apply) {
    requireStaff(actor);
    const all = readAll();
    const index = all.findIndex((request) => request.id === id);
    if (index < 0) throw new Error("This request could not be found.");
    const request = all[index];
    if (![STATUS.PROCESSING, STATUS.READY].includes(request.status)) throw new Error("This action requires a Processing or Ready for Pickup request.");
    const now = new Date().toISOString();
    const event = apply(request, now);
    if (!event) return { request: clone(request), persisted: !memoryAuthoritative };
    request.updatedAt = now;
    request.processing.events = [...(request.processing.events || []), { ...event, timestamp: now, actor: actorName(actor), staffId: actor.accountNumber }];
    const persisted = writeAll(all, true);
    notifyChange(request, persisted);
    return { request: clone(request), persisted };
  }

  function savePreparationCheck(id, itemId, checked, actor) {
    return processingAction(id, actor, (request, now) => {
      const policy = policyFor(request);
      if (request.status !== STATUS.PROCESSING) throw new Error("Preparation checks can only change while Processing.");
      if (!policy?.configured || !policy.items.some((item) => item.id === itemId)) throw new Error("Preparation workflow requires approved configuration.");
      const checks = request.processing.checks || {};
      const wasComplete = preparationComplete(request);
      const previous = checks[itemId];
      if (previous?.checked === Boolean(checked) && previous.version === window.PortalDocumentPolicy.version) return null;
      request.processing.checks = { ...checks, [itemId]: { checked: Boolean(checked), timestamp: now, actor: actorName(actor), staffId: actor.accountNumber, version: window.PortalDocumentPolicy.version } };
      return { action: !wasComplete && preparationComplete(request) ? "Preparation Completed" : "Preparation Check Updated", remarks: `${policy.items.find((item) => item.id === itemId).label}: ${checked ? "complete" : "incomplete"}` };
    });
  }

  function addProcessingNote(id, text, actor) {
    const note = String(text || "").trim();
    if (!note || note.length > 1000) throw new Error("Enter an internal note of 1–1,000 characters.");
    return processingAction(id, actor, (request, now) => {
      request.processing.notes = [...(request.processing.notes || []), { id: `NOTE-${id}-${(request.processing.notes || []).length + 1}`, text: note, actor: actorName(actor), staffId: actor.accountNumber, timestamp: now }];
      return { action: "Internal Note Added", remarks: note };
    });
  }

  function verifyRecipient(id, input, actor) {
    return processingAction(id, actor, (request, now) => {
      if (request.status !== STATUS.READY) throw new Error("Only Ready for Pickup requests can be verified.");
      const policy = window.PortalDocumentPolicy;
      const method = policy?.verification.methods.find((entry) => entry.id === input.methodId);
      if (!policy?.verification.configured || !method) throw new Error("An approved identity verification method must be configured.");
      if (input.confirmed !== true) throw new Error("Confirm that recipient verification was actually completed.");
      const representative = input.recipientType === "Authorized Representative";
      if (input.recipientType !== "Requesting Student" && !representative) throw new Error("Choose a valid recipient type.");
      if (representative && !policy.verification.allowRepresentative) throw new Error("Representative collection is not configured.");
      const recipientName = representative ? String(input.recipientName || "").trim() : request.studentName;
      if (!recipientName || recipientName.length > 150) throw new Error("Enter a recipient name of at most 150 characters.");
      const requirements = policy.verification.releaseChecks.map((item) => item.id);
      if (!requirements.every((key) => input.requirements?.includes(key))) throw new Error("Complete configured release requirements.");
      if (verificationComplete(request)) throw new Error("Recipient verification is already recorded. Release or close this request.");
      const reference = `VER-${id}-${(request.processing.events || []).length + 1}`;
      request.recipientVerification = { reference, recipientType: input.recipientType, recipientName, methodId: method.id, methodLabel: method.label, requirements, timestamp: now, actor: actorName(actor), staffId: actor.accountNumber, version: policy.version };
      request.recipientVerifications = [...request.recipientVerifications, clone(request.recipientVerification)];
      return { action: "Recipient Verified", remarks: `${input.recipientType} · ${method.label}`, reference };
    });
  }

  function requireOwner(request, actor) {
    const current = window.PortalProfile?.snapshot()?.account;
    if (actor?.role !== "student" || current?.role !== "student" || current.accountNumber !== actor.accountNumber || actor.accountNumber !== request.studentNumber) {
      throw new Error("You can only update your own requests.");
    }
  }

  function updateStatus(id, newStatus, actor, options = {}) {
    requireStaff(actor);
    if (!isStatus(newStatus)) throw new Error("Choose a valid request status.");
    const all = readAll();
    const index = all.findIndex((request) => request.id === id);
    if (index === -1) throw new Error("This request could not be found.");
    const request = all[index];
    if (!canTransition(request.status, newStatus)) {
      throw new Error(`A request that is ${request.status} cannot be moved to ${newStatus}.`);
    }
    const reason = String(options.reason || "").trim();
    const remarks = String(options.remarks || "").trim();
    if (requiresReason(newStatus) && !reason) {
      throw new Error(newStatus === STATUS.CORRECTION ? "Describe the information the student needs to correct." : newStatus === STATUS.REJECTED ? "Enter a reason for rejecting this request." : "Enter a reason for cancelling this request.");
    }
    if (newStatus === STATUS.READY && !preparationComplete(request)) throw new Error("Complete all required checks under the current approved preparation configuration.");
    if (newStatus === STATUS.RELEASED && (!verificationComplete(request) || options.handoverConfirmed !== true || request.release)) throw new Error("Release requires recorded recipient verification and explicit confirmation of the actual document handover.");
    const now = new Date().toISOString();
    const staffName = actorName(actor);
    const updated = {
      ...request,
      status: newStatus,
      updatedAt: now,
      assignedStaff: staffName,
    };
    if (newStatus === STATUS.APPROVED) {
      updated.reviewDate = now;
      updated.approvedAt = now;
      if (remarks) updated.staffRemarks = remarks;
    } else if (newStatus === STATUS.CORRECTION) {
      updated.reviewDate = now;
      updated.correctionReason = reason;
      updated.staffRemarks = reason;
    } else if (newStatus === STATUS.REJECTED) {
      updated.reviewDate = now;
      updated.rejectionReason = reason;
      updated.staffRemarks = reason;
    } else if (newStatus === STATUS.PROCESSING) {
      updated.processingStartedAt = now;
    } else if (newStatus === STATUS.READY) {
      updated.readyAt = now;
    } else if (newStatus === STATUS.RELEASED) {
      updated.releasedAt = now;
      updated.releasedBy = staffName;
      updated.releaseVerification = request.recipientVerification.reference;
      updated.release = {
        reference: `REL-${request.id}`, requestId: request.id,
        studentName: request.studentName, documentType: request.documentType,
        copies: request.details.copies || null,
        recipientType: request.recipientVerification.recipientType,
        recipientName: request.recipientVerification.recipientName,
        verificationReference: request.recipientVerification.reference,
        timestamp: now, actor: staffName, staffId: actor.accountNumber, handoverConfirmed: true,
      };
    } else if (newStatus === STATUS.CANCELLED) {
      updated.cancelledAt = now;
      updated.cancelledBy = staffName;
      updated.cancelReason = reason;
    }
    updated.history = [...request.history, {
      action: actionLabel(request.status, newStatus),
      previousStatus: request.status,
      newStatus,
      actor: staffName,
      actorRole: "staff",
      staff: staffName,
      staffId: actor.accountNumber,
      remarks: [STATUS.PROCESSING, STATUS.READY, STATUS.RELEASED].includes(newStatus) ? "" : reason || remarks,
      timestamp: now,
    }];
    if ([STATUS.PROCESSING, STATUS.READY, STATUS.RELEASED].includes(newStatus)) {
      const message = newStatus === STATUS.READY
        ? `Your ${request.documentType} request is ready for pickup. Please review your appointment details and follow the university's collection instructions.`
        : newStatus === STATUS.PROCESSING ? `Processing has started for your ${request.documentType} request.`
          : `Your ${request.documentType} request has been recorded as released after staff confirmed handover.`;
      updated.notifications = [...request.notifications, { id: `${id}-${statusTone(newStatus)}`, message, timestamp: now }];
    }
    all[index] = updated;
    const persisted = writeAll(all, true);
    notifyChange(updated, persisted);
    return { request: clone(updated), persisted };
  }

  function studentResubmit(id, actor, note) {
    const all = readAll();
    const index = all.findIndex((request) => request.id === id);
    if (index === -1) throw new Error("This request could not be found.");
    const request = all[index];
    requireOwner(request, actor);
    if (request.status !== STATUS.CORRECTION) throw new Error("This request is not waiting for corrections.");
    const correction = String(note || "").trim();
    if (!correction) throw new Error("Describe the correction before resubmitting.");
    if (correction.length > 500) throw new Error("Use at most 500 characters for correction details.");
    const now = new Date().toISOString();
    const updated = {
      ...request,
      status: STATUS.PENDING,
      updatedAt: now,
      studentCorrectionNote: correction,
      correctionSubmittedAt: now,
      history: [...request.history, {
        action: "Corrections Submitted",
        previousStatus: STATUS.CORRECTION,
        newStatus: STATUS.PENDING,
        actor: request.studentName,
        actorRole: "student",
        staff: "",
        remarks: correction,
        timestamp: now,
      }],
    };
    all[index] = updated;
    const persisted = writeAll(all, true);
    notifyChange(updated, persisted);
    return { request: clone(updated), persisted };
  }

  function studentCancel(id, actor, reason = "") {
    const all = readAll();
    const index = all.findIndex((request) => request.id === id);
    if (index === -1) throw new Error("This request could not be found.");
    const request = all[index];
    requireOwner(request, actor);
    if (!canStudentCancel(request.status)) throw new Error("Only requests that are pending review or awaiting corrections can be cancelled.");
    const why = String(reason || "").trim();
    if (!why) throw new Error("Enter a reason before cancelling this request.");
    if (why.length > 500) throw new Error("Use at most 500 characters for the cancellation reason.");
    const now = new Date().toISOString();
    const updated = {
      ...request,
      status: STATUS.CANCELLED,
      updatedAt: now,
      cancelledAt: now,
      cancelledBy: request.studentName,
      cancelReason: why,
      history: [...request.history, {
        action: "Request Cancelled",
        previousStatus: request.status,
        newStatus: STATUS.CANCELLED,
        actor: request.studentName,
        actorRole: "student",
        staff: "",
        remarks: why,
        timestamp: now,
      }],
    };
    all[index] = updated;
    const persisted = writeAll(all, true);
    notifyChange(updated, persisted);
    return { request: clone(updated), persisted };
  }

  function summary(requests = listAll()) {
    const counts = { total: requests.length };
    STATUSES.forEach((status) => { counts[status] = 0; });
    requests.forEach((request) => { counts[request.status] += 1; });
    counts.pending = counts[STATUS.PENDING];
    counts.processing = counts[STATUS.PROCESSING];
    counts.ready = counts[STATUS.READY];
    counts.released = counts[STATUS.RELEASED];
    counts.correction = counts[STATUS.CORRECTION];
    return counts;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    notifyChange(null, true);
  });

  function sourceInfo() {
    if (memoryAuthoritative) return { available: true, memoryOnly: true, invalidRecords: 0 };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return { available: true, memoryOnly: false, invalidRecords: 0 };
      const records = JSON.parse(raw);
      return { available: Array.isArray(records), memoryOnly: false, invalidRecords: Array.isArray(records) ? records.filter((record) => !isStoredRecord(record)).length : 0 };
    } catch { return { available: false, memoryOnly: false, invalidRecords: 0 }; }
  }

  window.PortalRequestService = Object.freeze({
    sourceInfo,
    STORAGE_KEY,
    STATUS,
    STATUSES,
    STATUS_META,
    SERVICES,
    isStatus,
    statusMeta,
    statusTone,
    statusDescription,
    allowedTransitions,
    canTransition,
    isActive,
    requiresReason,
    canStudentCancel,
    listAll,
    listForStudent,
    get,
    getForStudent,
    create,
    updateStatus,
    preparationComplete,
    verificationComplete,
    savePreparationCheck,
    addProcessingNote,
    verifyRecipient,
    studentResubmit,
    studentCancel,
    summary,
  });
})();
