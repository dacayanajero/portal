"use strict";

// Supabase-backed adapter for the existing synchronous rendering components.
// All persistent writes are performed in Supabase. Browser-local demo requests
// are intentionally NOT imported; they were never official/shared records.
(() => {
  const baseRequests = window.PortalRequestService;
  const baseAppointments = window.PortalAppointmentService;
  const api = window.PortalSupabaseApi;
  const holder = window.PortalSupabase;
  if (!baseRequests || !baseAppointments || !api || !holder?.configured) {
    throw new Error("Supabase request integration requires the configured client and existing services.");
  }

  window.PortalSupabaseRequestsActive = true;

  let requestRows = [];
  let appointmentRows = [];
  let viewerId = null;
  let revision = 0;
  let loading = null;
  let lastLoadError = "";
  const clone = value => JSON.parse(JSON.stringify(value));
  const client = () => holder.client;
  const err = ({ error }) => { if (error) throw new Error(error.message || String(error)); };
  const hhmm = value => String(value || "").slice(0, 5);
  const dateLabel = value => {
    if (!value) return "";
    const date = new Date(value + "T12:00:00");
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };
  const detailsObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const currentRole = () => window.PortalAccounts?.sessionInfo()?.role || null;
  const studentNumber = () => window.PortalProfile?.snapshot()?.account?.accountNumber || "";
  const staffAccount = () => window.PortalStaffContext?.current()?.account;

  function changeEvents() {
    document.dispatchEvent(new CustomEvent("portal:requestschanged", { detail: { persisted: true, source: "supabase" } }));
    document.dispatchEvent(new CustomEvent("portal:appointmentschanged", { detail: { persisted: true, source: "supabase" } }));
  }

  function clear() {
    revision++;
    viewerId = null;
    requestRows = [];
    appointmentRows = [];
    loading = null;
    lastLoadError = "";
    changeEvents();
  }

  function appointmentFromDb(row, req, history = []) {
    const date = row.appt_date || "";
    const start = hhmm(row.start_time);
    const end = hhmm(row.end_time);
    const name = req?.studentName || "";
    return {
      id: row.id, dbId: row.id, requestId: req?.id || "",
      studentNumber: row.student_number || req?.studentNumber || "",
      studentName: name, serviceType: req?.documentType || "",
      date, start, end, timeRange: start && end ? start + " - " + end : "",
      display: dateLabel(date) + " · " + start + " - " + end,
      bookingDate: row.created_at, createdAt: row.created_at, updatedAt: row.updated_at,
      status: row.status, confirmedBy: "", confirmedAt: "",
      checkedInBy: "", checkedInAt: "", completedBy: "", completedAt: "",
      cancelledBy: "", cancelledAt: row.status === "Cancelled" ? row.updated_at : "",
      cancelReason: row.reason || "", noShowBy: "", noShowAt: "",
      staffRemarks: row.reason || "", history, rescheduleHistory: [], demo: false,
    };
  }

  function requestFromDb(row, appointment, history = []) {
    const savedDetails = detailsObject(row.details);
    const aDate = appointment?.appt_date || savedDetails.appointmentDate || "";
    const aStart = hhmm(appointment?.start_time || savedDetails.appointmentStart);
    const aEnd = hhmm(appointment?.end_time || savedDetails.appointmentEnd);
    const range = savedDetails.appointmentTimeRange || (aStart && aEnd ? aStart + " - " + aEnd : "");
    const submittedAt = row.created_at;
    return {
      id: row.reference_no, dbId: row.id, referenceNo: row.reference_no,
      studentNumber: row.student_number, studentName: row.student_name,
      program: row.program || "", yearLevel: row.year_level || "", semester: row.semester || "",
      documentType: row.document_type, purpose: row.purpose, details: clone(savedDetails),
      appointment: {
        date: aDate, dateLabel: savedDetails.appointmentDateLabel || dateLabel(aDate),
        start: aStart, end: aEnd, timeRange: range,
        display: aDate ? (savedDetails.appointmentDateLabel || dateLabel(aDate)) + " · " + range : "",
      },
      submittedAt, updatedAt: row.updated_at, status: row.status,
      assignedStaff: row.assigned_staff_name || "", reviewDate: row.review_date || "",
      staffRemarks: row.staff_remarks || "", correctionReason: row.correction_reason || "",
      rejectionReason: row.rejection_reason || "", studentCorrectionNote: row.student_correction_note || "",
      correctionSubmittedAt: row.correction_submitted_at || "", approvedAt: row.approved_at || "",
      processingStartedAt: row.processing_started_at || "", readyAt: row.ready_at || "",
      releasedAt: row.released_at || "", releasedBy: row.released_by || "",
      releaseVerification: row.release_verification || "",
      processing: { checks: detailsObject(row.processing?.checks), notes: row.processing?.notes || [], events: [] },
      notifications: [], recipientVerification: null, recipientVerifications: [],
      release: row.release || null, cancelledAt: row.cancelled_at || "",
      cancelledBy: row.cancelled_by || "", cancelReason: row.cancel_reason || "",
      history: history.length ? history : [{ action: "Request Submitted", previousStatus: "",
        newStatus: row.status, actor: row.student_name, actorRole: "student",
        remarks: "", timestamp: submittedAt }],
      demo: false, legacyDemo: false, source: "Supabase",
    };
  }

  function auditEntries(entries, entity, id) {
    return entries.filter(item => item.entity === entity && item.entity_id === id)
      .map(item => ({
        action: item.action, previousStatus: item.previous_status || "",
        newStatus: item.new_status || "", actor: item.actor_name || "",
        actorRole: item.actor_role === "student" ? "student" : "staff",
        staff: item.actor_role === "staff" ? (item.actor_name || "") : "",
        remarks: item.remarks || "", timestamp: item.created_at,
      }));
  }

  async function refresh() {
    const stamp = ++revision;
    loading = (async () => {
      const { data: authData, error: authError } = await client().auth.getUser();
      if (authError) throw new Error(authError.message);
      if (!authData?.user?.id) throw new Error("Sign in to load requests.");
      const authId = authData.user.id;
      const [rs, as, hs] = await Promise.all([
        client().from("requests").select("*").order("created_at", { ascending: false }),
        client().from("appointments").select("*").order("appt_date", { ascending: true }),
        client().from("audit_log").select("*").order("created_at", { ascending: true }).limit(1000),
      ]);
      err(rs); err(as); err(hs);
      if (stamp !== revision) return;
      const apptByRequest = new Map((as.data || []).map(row => [row.request_id, row]));
      const audit = hs.data || [];
      const remoteRequests = (rs.data || []).map(row =>
        requestFromDb(row, apptByRequest.get(row.id), auditEntries(audit, "request", row.id)));
      const byDbId = new Map(remoteRequests.map(row => [row.dbId, row]));
      const remoteAppointments = (as.data || []).map(row =>
        appointmentFromDb(row, byDbId.get(row.request_id), auditEntries(audit, "appointment", row.id)));
      viewerId = authId;
      requestRows = remoteRequests;
      appointmentRows = remoteAppointments;
      lastLoadError = "";
      changeEvents();
    })();
    try { await loading; }
    catch (error) {
      if (stamp === revision) {
        lastLoadError = error.message;
        document.dispatchEvent(new CustomEvent("portal:requestsyncerror", { detail: { message: error.message } }));
      }
      throw error;
    } finally {
      if (stamp === revision) loading = null;
    }
  }

  function listAll() { return clone(requestRows); }
  function get(id) { return clone(requestRows.find(row => row.id === id || row.dbId === id) || null); }
  function listForStudent(number) {
    if (currentRole() !== "student" || studentNumber() !== String(number || "")) return [];
    return listAll().filter(row => row.studentNumber === number).map(studentView);
  }
  function studentView(row) {
    const view = clone(row);
    delete view.processing; delete view.recipientVerification; delete view.recipientVerifications;
    delete view.releaseVerification;
    return view;
  }
  function getForStudent(id, number) {
    return listForStudent(number).find(row => row.id === id || row.dbId === id) || null;
  }
  async function create({ student, document: documentType, purpose, details = {} } = {}) {
    if (currentRole() !== "student" || !student || student.accountNumber !== studentNumber()) {
      throw new Error("Sign in as the requesting student.");
    }
    if (!documentType || !String(purpose || "").trim()) throw new Error("Select a document and enter a purpose.");
    const a = detailsObject(details);
    const hasDate = Boolean(a.appointmentDate);
    const appointment = hasDate ? {
      date: a.appointmentDate, start: a.appointmentStart, end: a.appointmentEnd,
    } : null;
    if (hasDate && (!appointment.start || !appointment.end)) throw new Error("Choose an appointment time.");
    // The database function creates both rows in one transaction. A failed
    // appointment cannot leave behind an orphan document request.
    const result = await api.submitRequest({ documentType, purpose: String(purpose).trim(), details: a, appointment });
    if (!result) throw new Error("Supabase did not return a saved request.");
    const dbId = result.request_id || result.id;
    const ref = result.request_reference_no || result.reference_no;
    if (!ref) throw new Error("Supabase did not return a request reference.");
    let saved;
    try {
      await refresh();
      saved = get(dbId) || get(ref);
    } catch (error) {
      console.warn("Request saved, but refreshing the list failed:", error);
    }
    if (!saved) {
      const now = result.created_at || new Date().toISOString();
      saved = requestFromDb({
        id: dbId, reference_no: ref, created_at: now, updated_at: now,
        student_number: student.accountNumber, student_name: student.fullName,
        program: student.program, year_level: student.yearLevel, semester: student.semester,
        document_type: documentType, purpose, details: a, status: "Pending Review",
      }, appointment && { appt_date: appointment.date, start_time: appointment.start, end_time: appointment.end });
      requestRows = [saved, ...requestRows.filter(item => item.dbId !== dbId)];
      changeEvents();
    }
    return clone(saved);
  }

  function dbIdFor(id) {
    const row = requestRows.find(item => item.id === id || item.dbId === id);
    if (!row) throw new Error("Request not loaded. Refresh your dashboard.");
    return row.dbId;
  }
  function staffOnly(actor) {
    const signed = staffAccount();
    if (currentRole() !== "staff" || !signed || signed.accountNumber !== actor?.accountNumber) {
      throw new Error("Staff sign-in required for this action.");
    }
  }

  async function updateStatus(id, status, actor, options = {}) {
    staffOnly(actor);
    const current = get(id);
    if (!current || !baseRequests.canTransition(current.status, status)) throw new Error("Invalid request status transition.");
    if (status === "Ready for Pickup") {
      const result = await client().rpc("mark_request_ready", { p_request_id: dbIdFor(id) });
      err(result);
      await refresh();
      return { request: get(id), persisted: true };
    }
    if (status === "Released") {
      throw new Error("Recipient verification and final document release require a separately authorized workflow.");
    }
    const reason = String(options.reason || "").trim();
    const values = { status };
    if (status === "Needs Correction") values.correction_reason = reason;
    if (status === "Rejected") values.rejection_reason = reason;
    if (status === "Cancelled") values.cancel_reason = reason;
    if (options.remarks) values.staff_remarks = String(options.remarks);
    const result = await client().from("requests").update(values)
      .eq("id", dbIdFor(id)).select("id").single();
    err(result);
    await refresh();
    return { request: get(id), persisted: true };
  }

  async function studentResubmit(id, actor, note) {
    if (currentRole() !== "student" || studentNumber() !== actor?.accountNumber) throw new Error("Student sign-in required.");
    const old = getForStudent(id, actor.accountNumber);
    if (!old || old.status !== "Needs Correction") throw new Error("The request is not waiting for corrections.");
    const result = await client().from("requests").update({
      status: "Pending Review", student_correction_note: String(note || "").trim(),
    }).eq("id", dbIdFor(id)).select("id").single();
    err(result);
    await refresh();
    return { request: getForStudent(id, actor.accountNumber), persisted: true };
  }

  async function studentCancel(id, actor, reason) {
    if (currentRole() !== "student" || studentNumber() !== actor?.accountNumber) throw new Error("Student sign-in required.");
    const old = getForStudent(id, actor.accountNumber);
    if (!old || !baseRequests.canStudentCancel(old.status)) throw new Error("This request cannot be cancelled.");
    const why = String(reason || "").trim();
    if (!why) throw new Error("Enter a reason for cancellation.");
    // Atomic RPC cancels the appointment too, freeing the capacity.
    const result = await client().rpc("cancel_document_request_and_appointment", { p_request_id: dbIdFor(id), p_reason: why });
    err(result);
    await refresh();
    return { request: getForStudent(id, actor.accountNumber), persisted: true };
  }

  async function savePreparationCheck(id, itemId, checked, actor) {
    staffOnly(actor);
    const request = get(id);
    if (!request || request.status !== "Processing") throw new Error("The request must be Processing to update preparation checks.");
    const policy = window.PortalDocumentPolicy;
    const configured = policy?.services?.[request.documentType];
    if (!configured?.configured || !configured.items.some(item => item.id === itemId)) {
      throw new Error("This preparation check is not configured.");
    }
    const result = await client().rpc("save_request_preparation_check", {
      p_request_id: dbIdFor(id),
      p_check_id: itemId,
      p_checked: Boolean(checked),
      p_policy_version: policy.version,
    });
    err(result);
    await refresh();
    return { request: get(id), persisted: true };
  }

  function unsupported() {
    throw new Error("This action requires a later server-side workflow migration. No changes were saved.");
  }

  function listAppointments() { return clone(appointmentRows); }
  function getAppointment(id) { return clone(appointmentRows.find(a => a.id === id) || null); }
  function getByRequest(id) { return clone(appointmentRows.find(a => a.requestId === id) || null); }
  function appointmentsForStudent(number) {
    if (currentRole() !== "student" || studentNumber() !== String(number || "")) return [];
    return listAppointments().filter(a => a.studentNumber === number);
  }
  function apptSummary() {
    const rows = listAppointments(), today = baseAppointments.manilaDate();
    const active = row => ["Pending Confirmation", "Scheduled", "Checked In"].includes(row.status);
    return { total: rows.length,
      today: rows.filter(r => r.date === today && active(r)).length,
      upcoming: rows.filter(r => r.date > today && active(r)).length,
      completed: rows.filter(r => r.status === "Completed").length,
      cancelled: rows.filter(r => r.status === "Cancelled").length,
      noShow: rows.filter(r => r.status === "No Show").length,
      checkedIn: rows.filter(r => r.status === "Checked In").length,
      pending: rows.filter(r => r.status === "Pending Confirmation").length,
      scheduled: rows.filter(r => r.status === "Scheduled").length };
  }
  function availability(date, start, end) {
    // RLS intentionally hides other students' bookings. This display is only
    // tentative; the database enforces actual capacity on submission.
    const booked = appointmentRows.filter(r => r.date === date &&
      ["Pending Confirmation", "Scheduled", "Checked In"].includes(r.status) &&
      baseAppointments.toMinutes(r.start) < baseAppointments.toMinutes(end) &&
      baseAppointments.toMinutes(start) < baseAppointments.toMinutes(r.end)).length;
    return { booked, capacity: 1, remaining: Math.max(0, 1 - booked),
      status: booked ? "Fully Booked" : "Available (subject to confirmation)" };
  }
  function validateSlot(date, start, end) {
    if (!baseAppointments.validDate(date) || !baseAppointments.validTime(start) || !baseAppointments.validTime(end)) {
      throw new Error("Select a valid appointment date and time.");
    }
    if (date < baseAppointments.manilaDate()) throw new Error("Choose a future appointment date.");
    if (baseAppointments.toMinutes(end) - baseAppointments.toMinutes(start) !== baseAppointments.SLOT_MINUTES) {
      throw new Error("Appointments must last one hour.");
    }
    if (start < baseAppointments.OPERATING_START || start > baseAppointments.LATEST_START || end > baseAppointments.OPERATING_END) {
      throw new Error("Appointment must be within office hours.");
    }
    // Always recheck on the database; locally known bookings are not complete.
    return true;
  }

  async function modifyAppointment(id, actor, status, reason = "", schedule = null) {
    staffOnly(actor);
    const existing = getAppointment(id);
    if (!existing) throw new Error("Appointment not loaded. Refresh the page.");
    const values = { status };
    if (reason) values.reason = String(reason);
    if (schedule) {
      values.appt_date = schedule.date;
      values.start_time = schedule.start;
      values.end_time = schedule.end;
      if (!reason) throw new Error("A reason is required for rescheduling.");
    }
    const result = await client().from("appointments").update(values)
      .eq("id", existing.dbId).select("id").single();
    err(result);
    await refresh();
    return { appointment: getAppointment(id), persisted: true };
  }
  const appointmentAdapter = Object.freeze({
    ...baseAppointments,
    listAll: listAppointments, listForStudent: appointmentsForStudent,
    get: getAppointment, getByRequest, summary: apptSummary, availability, validateSlot,
    sourceInfo: () => ({ available: !lastLoadError, backend: "supabase", error: lastLoadError }),
    confirmAppointment: (id, actor, remarks) => modifyAppointment(id, actor, "Scheduled", remarks),
    checkIn: (id, actor) => modifyAppointment(id, actor, "Checked In"),
    completeAppointment: (id, actor, remarks) => modifyAppointment(id, actor, "Completed", remarks),
    markNoShow: (id, actor, reason) => modifyAppointment(id, actor, "No Show", reason),
    cancelAppointment: (id, actor, reason) => modifyAppointment(id, actor, "Cancelled", reason),
    rescheduleAppointment: (id, actor, date, start, end, reason) =>
      modifyAppointment(id, actor, getAppointment(id)?.status, reason, { date, start, end }),
  });

  const requestAdapter = Object.freeze({
    ...baseRequests, listAll, listForStudent, get, getForStudent, create, refresh,
    updateStatus, studentResubmit, studentCancel,
    savePreparationCheck, addProcessingNote: unsupported, verifyRecipient: unsupported,
    sourceInfo: () => ({ available: !lastLoadError, backend: "supabase", error: lastLoadError }),
    summary: (rows = listAll()) => baseRequests.summary(rows),
  });

  window.PortalRequestService = requestAdapter;
  window.PortalAppointmentService = appointmentAdapter;
  document.addEventListener("portal:login", () => { clear(); void refresh().catch(error => {
    console.error("Could not load Supabase requests:", error.message);
  }); });
  document.addEventListener("portal:logout", clear);
  document.addEventListener("portal:sessioninvalidated", clear);
})();
