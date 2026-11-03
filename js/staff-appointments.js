"use strict";

window.initializeStaffAppointments = () => {
  const service = window.PortalAppointmentService;
  const requestService = window.PortalRequestService;
  const context = window.PortalStaffContext;
  const staffScreen = document.querySelector("#staff-screen");

  const todayCount = document.querySelector("#staff-appointments-today");
  const upcomingCount = document.querySelector("#staff-appointments-upcoming");
  const completedCount = document.querySelector("#staff-appointments-completed");
  const cancelledCount = document.querySelector("#staff-appointments-cancelled");
  const visibleCount = document.querySelector("#staff-appointments-visible-count");
  const calendar = document.querySelector("#staff-appointment-calendar");
  const calendarLabel = document.querySelector("#staff-appointment-calendar-label");
  const calendarEmpty = document.querySelector("#staff-appointment-calendar-empty");
  const viewButtons = [...document.querySelectorAll("[data-appointment-view]")];
  const prevButton = document.querySelector("#staff-appointment-prev");
  const todayButton = document.querySelector("#staff-appointment-today");
  const nextButton = document.querySelector("#staff-appointment-next");

  const searchInput = document.querySelector("#staff-appointments-search");
  const dateFilter = document.querySelector("#staff-appointments-date");
  const serviceFilter = document.querySelector("#staff-appointments-service");
  const statusFilter = document.querySelector("#staff-appointments-status");
  const sortSelect = document.querySelector("#staff-appointments-sort");
  const resetButton = document.querySelector("#staff-appointments-reset");
  const feedback = document.querySelector("#staff-appointments-feedback");
  const rows = document.querySelector("#staff-appointments-rows");
  const empty = document.querySelector("#staff-appointments-empty");
  const emptyTitle = document.querySelector("#staff-appointments-empty-title");
  const emptyText = document.querySelector("#staff-appointments-empty-text");
  const pagination = document.querySelector("#staff-appointments-pagination");
  const resultCount = document.querySelector("#staff-appointments-result-count");
  const pageLabel = document.querySelector("#staff-appointments-page-label");
  const previousPageButton = document.querySelector("#staff-appointments-prev");
  const nextPageButton = document.querySelector("#staff-appointments-next");

  const detailsDialog = document.querySelector("#staff-appointment-details-dialog");
  const detailsTitle = document.querySelector("#staff-appointment-details-title");
  const detailsService = document.querySelector("#staff-appointment-details-service");
  const detailsStudent = document.querySelector("#staff-appointment-details-student");
  const detailsStatus = document.querySelector("#staff-appointment-details-status");
  const studentName = document.querySelector("#staff-appointment-student-name");
  const studentNumber = document.querySelector("#staff-appointment-student-number");
  const studentProgram = document.querySelector("#staff-appointment-student-program");
  const studentYear = document.querySelector("#staff-appointment-student-year");
  const studentSemester = document.querySelector("#staff-appointment-student-semester");
  const appointmentId = document.querySelector("#staff-appointment-id");
  const appointmentRequest = document.querySelector("#staff-appointment-request");
  const appointmentService = document.querySelector("#staff-appointment-service");
  const appointmentDate = document.querySelector("#staff-appointment-date");
  const appointmentStart = document.querySelector("#staff-appointment-start");
  const appointmentEnd = document.querySelector("#staff-appointment-end");
  const appointmentStatusText = document.querySelector("#staff-appointment-status-text");
  const appointmentBooking = document.querySelector("#staff-appointment-booking");
  const appointmentRemarks = document.querySelector("#staff-appointment-remarks");
  const requestDocument = document.querySelector("#staff-appointment-request-document");
  const requestPurpose = document.querySelector("#staff-appointment-request-purpose");
  const requestStatus = document.querySelector("#staff-appointment-request-status");
  const openRequestButton = document.querySelector("#staff-appointment-open-request");
  const historyList = document.querySelector("#staff-appointment-history");
  const availabilityText = document.querySelector("#staff-appointment-availability");
  const actionsContainer = document.querySelector("#staff-appointment-actions");

  const actionDialog = document.querySelector("#staff-appointment-action-dialog");
  const actionForm = document.querySelector("#staff-appointment-action-form");
  const actionTitle = document.querySelector("#staff-appointment-action-title");
  const actionDescription = document.querySelector("#staff-appointment-action-description");
  const actionReasonLabel = document.querySelector("#staff-appointment-action-reason-label");
  const actionReason = document.querySelector("#staff-appointment-action-reason");
  const actionStatus = document.querySelector("#staff-appointment-action-status");
  const actionSubmit = document.querySelector("#staff-appointment-action-submit");
  const rescheduleFields = document.querySelector("#staff-appointment-reschedule-fields");
  const rescheduleDate = document.querySelector("#staff-appointment-reschedule-date");
  const rescheduleStart = document.querySelector("#staff-appointment-reschedule-start");

  const pageSize = 8;
  const actionConfig = Object.freeze({
    confirm: { title: "Confirm appointment", description: "Confirm this appointment and move it to Scheduled.", reasonLabel: "Staff remarks (optional)", required: false, reschedule: false, danger: false },
    checkin: { title: "Check in student", description: "Mark this student as checked in for the appointment.", reasonLabel: "Attendance remarks (optional)", required: false, reschedule: false, danger: false },
    complete: { title: "Complete appointment", description: "Mark this appointment as completed after attendance verification.", reasonLabel: "Completion remarks (optional)", required: false, reschedule: false, danger: false },
    noshow: { title: "Mark no show", description: "Mark this appointment as no-show. This should only be used after the appointment time has passed.", reasonLabel: "No-show notes (optional)", required: false, reschedule: false, danger: true },
    cancel: { title: "Cancel appointment", description: "Cancel this appointment and release its reserved slot.", reasonLabel: "Reason for cancellation", required: true, reschedule: false, danger: true },
    reschedule: { title: "Reschedule appointment", description: "Move this appointment to a new date and time slot.", reasonLabel: "Reason for rescheduling", required: true, reschedule: true, danger: false },
  });

  let view = "month";
  let cursor = new Date();
  let selectedDate = service.manilaDate();
  let query = "";
  let studentScope = "";
  let pendingOpenId = "";
  const scopeNotice = document.createElement("p");
  scopeNotice.className = "demo-note";
  feedback.before(scopeNotice);
  let dateQuery = "";
  let serviceQuery = "all";
  let statusQuery = "all";
  let sortOrder = "date-asc";
  let currentPage = 1;
  let selectedAppointmentId = "";
  let pendingAction = "";
  let feedbackTimer;

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }

  function appointmentDateLabel(value) {
    if (!value) return "Not scheduled";
    return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function setText(element, value) {
    element.textContent = value === "" || value === null || value === undefined ? "—" : String(value);
  }

  function setFeedback(message, error = false) {
    window.clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.classList.toggle("is-error", error);
    if (message && !error) {
      feedbackTimer = window.setTimeout(() => {
        feedback.textContent = "";
        feedback.classList.remove("is-error");
      }, 5000);
    }
  }

  function statusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `staff-status staff-status-${service.statusTone(status)}`;
    badge.textContent = status;
    return badge;
  }

  function staffActor() {
    const current = context.current();
    if (!current?.account) return null;
    return {
      role: "staff",
      accountNumber: current.account.accountNumber,
      name: current.profile?.fullName || current.account.fullName,
    };
  }

  function appointmentsForDate(date) {
    return scopedAppointments().filter((appointment) => appointment.date === date).sort((first, second) => first.start.localeCompare(second.start));
  }

  function renderSummary() {
    const counts = service.summary();
    setText(todayCount, counts.today);
    setText(upcomingCount, counts.upcoming);
    setText(completedCount, counts.completed);
    setText(cancelledCount, counts.cancelled);
  }

  function renderTimeOptions(select, selected) {
    select.replaceChildren();
    for (let minutes = service.toMinutes(service.OPERATING_START); minutes <= service.toMinutes(service.LATEST_START); minutes += service.SLOT_MINUTES) {
      const value = service.fromMinutes(minutes);
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `${value} - ${service.fromMinutes(minutes + service.SLOT_MINUTES)}`;
      option.selected = value === selected;
      select.append(option);
    }
  }

  function renderCalendar() {
    calendar.replaceChildren();
    if (view === "month") renderMonthCalendar();
    else if (view === "week") renderWeekCalendar();
    else renderDayCalendar();
    viewButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.appointmentView === view));
    });
  }

  function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderMonthCalendar() {
    const first = monthStart(cursor);
    const start = addDays(first, -first.getDay());
    const today = service.manilaDate();
    const grid = document.createElement("div");
    grid.className = "staff-appointment-month-grid";
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdays.forEach((label) => {
      const header = document.createElement("div");
      header.className = "staff-appointment-weekday";
      header.textContent = label;
      grid.append(header);
    });
    const countsByDate = new Map();
    scopedAppointments().forEach((appointment) => {
      countsByDate.set(appointment.date, (countsByDate.get(appointment.date) || 0) + 1);
    });
    for (let index = 0; index < 42; index += 1) {
      const date = addDays(start, index);
      const iso = isoDate(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "staff-appointment-day";
      if (date.getMonth() !== first.getMonth()) button.classList.add("is-outside");
      if (iso === today) button.classList.add("is-today");
      if (iso === selectedDate) button.classList.add("is-selected");
      const number = document.createElement("span");
      number.className = "staff-appointment-day-number";
      number.textContent = date.getDate();
      button.append(number);
      const count = countsByDate.get(iso) || 0;
      if (count) {
        const countLabel = document.createElement("span");
        countLabel.className = "staff-appointment-day-count";
        countLabel.textContent = `${count}`;
        button.append(countLabel);
      }
      button.addEventListener("click", () => {
        selectedDate = iso;
        dateFilter.value = iso;
        currentPage = 1;
        renderAll();
      });
      grid.append(button);
    }
    calendar.append(grid);
    calendarLabel.textContent = first.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }

  function renderWeekCalendar() {
    const start = addDays(cursor, -cursor.getDay());
    const today = service.manilaDate();
    const grid = document.createElement("div");
    grid.className = "staff-appointment-week-grid";
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(start, index);
      const iso = isoDate(date);
      const column = document.createElement("section");
      column.className = "staff-appointment-week-day";
      if (iso === today) column.classList.add("is-today");
      if (iso === selectedDate) column.classList.add("is-selected");
      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "staff-appointment-week-heading";
      heading.textContent = date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
      heading.addEventListener("click", () => {
        selectedDate = iso;
        dateFilter.value = iso;
        currentPage = 1;
        renderAll();
      });
      column.append(heading);
      appointmentsForDate(iso).forEach((appointment) => {
        const item = document.createElement("article");
        item.className = `staff-appointment-week-item staff-appointment-tone-${service.statusTone(appointment.status)}`;
        item.textContent = `${appointment.start} ${appointment.studentName} · ${appointment.serviceType}`;
        item.addEventListener("click", () => openAppointment(appointment.id));
        column.append(item);
      });
      grid.append(column);
    }
    calendar.append(grid);
    const end = addDays(start, 6);
    calendarLabel.textContent = `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  function renderDayCalendar() {
    const appointments = appointmentsForDate(selectedDate);
    calendarEmpty.hidden = appointments.length > 0;
    const list = document.createElement("div");
    list.className = "staff-appointment-day-list";
    appointments.forEach((appointment) => {
      const item = document.createElement("article");
      item.className = "staff-appointment-day-item";
      const time = document.createElement("strong");
      time.textContent = `${appointment.start} - ${appointment.end}`;
      const copy = document.createElement("div");
      const student = document.createElement("span");
      student.textContent = `${appointment.studentName} · ${appointment.studentNumber}`;
      const serviceType = document.createElement("span");
      serviceType.textContent = appointment.serviceType;
      copy.append(student, serviceType);
      const status = statusBadge(appointment.status);
      item.append(time, copy, status);
      item.addEventListener("click", () => openAppointment(appointment.id));
      list.append(item);
    });
    calendar.append(list);
    calendarLabel.textContent = appointmentDateLabel(selectedDate);
  }

  function filteredAppointments() {
    const text = query.trim().toLowerCase();
    const list = scopedAppointments().filter((appointment) => {
      const matchesSearch = !text || [appointment.id, appointment.studentName, appointment.studentNumber, appointment.serviceType].join(" ").toLowerCase().includes(text);
      const matchesDate = !dateQuery || appointment.date === dateQuery;
      const matchesService = serviceQuery === "all" || appointment.serviceType === serviceQuery;
      const matchesStatus = statusQuery === "all" || appointment.status === statusQuery;
      return matchesSearch && matchesDate && matchesService && matchesStatus;
    });
    if (sortOrder === "date-desc") return list.sort((first, second) => `${second.date}T${second.start}`.localeCompare(`${first.date}T${first.start}`));
    if (sortOrder === "student") return list.sort((first, second) => first.studentName.localeCompare(second.studentName, "en", { sensitivity: "base" }));
    return list.sort((first, second) => `${first.date}T${first.start}`.localeCompare(`${second.date}T${second.start}`));
  }

  function renderTable() {
    scopeNotice.textContent = studentScope ? `Appointments for student ${studentScope}. Use Reset filters to view all appointments.` : "";
    const filtered = filteredAppointments();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    rows.replaceChildren();
    visible.forEach((appointment) => {
      const row = document.createElement("tr");
      const reference = document.createElement("td");
      reference.className = "staff-ref";
      reference.textContent = appointment.id;
      const name = document.createElement("td");
      name.className = "staff-appointment-student-name";
      name.textContent = appointment.studentName;
      const number = document.createElement("td");
      number.textContent = appointment.studentNumber;
      const serviceType = document.createElement("td");
      serviceType.textContent = appointment.serviceType;
      const date = document.createElement("td");
      date.textContent = formatDate(appointment.date);
      const slot = document.createElement("td");
      slot.textContent = `${appointment.start} - ${appointment.end}`;
      const status = document.createElement("td");
      status.append(statusBadge(appointment.status));
      const action = document.createElement("td");
      action.className = "staff-table-action-cell";
      const view = document.createElement("button");
      view.type = "button";
      view.className = "staff-table-action";
      view.textContent = "View details";
      view.setAttribute("aria-label", `View details for appointment ${appointment.id}`);
      view.addEventListener("click", () => openAppointment(appointment.id));
      action.append(view);
      row.append(reference, name, number, serviceType, date, slot, status, action);
      rows.append(row);
    });
    visibleCount.textContent = String(filtered.length);
    empty.hidden = filtered.length > 0;
    pagination.hidden = filtered.length === 0;
    if (!filtered.length) {
      const noAppointments = service.listAll().length === 0;
      emptyTitle.textContent = noAppointments ? "No appointments yet" : "No matching appointments";
      emptyText.textContent = noAppointments
        ? "Student bookings from the portal will appear here."
        : "Try a different search term, date, service, status, or clear the filters.";
    }
    resultCount.textContent = filtered.length
      ? `Showing ${start + 1}-${Math.min(start + pageSize, filtered.length)} of ${filtered.length} appointment${filtered.length === 1 ? "" : "s"}`
      : "0 appointments";
    pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
    previousPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;
  }

  function renderAll() {
    renderSummary();
    renderCalendar();
    renderTable();
  }

  function requestForAppointment(appointment) {
    return requestService.get(appointment.requestId);
  }

  function renderHistory(appointment) {
    historyList.replaceChildren();
    appointment.history.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      const head = document.createElement("div");
      const action = document.createElement("strong");
      action.textContent = entry.action;
      const time = document.createElement("time");
      time.dateTime = entry.timestamp;
      time.textContent = formatDateTime(entry.timestamp);
      head.append(action, time);
      const transition = document.createElement("p");
      transition.textContent = `${entry.previousStatus || "New"} -> ${entry.newStatus}`;
      item.append(head, transition);
      if (entry.actor) {
        const actor = document.createElement("p");
        actor.className = "staff-appointment-history-actor";
        actor.textContent = `${entry.actor}${entry.actorRole ? ` · ${entry.actorRole}` : ""}`;
        item.append(actor);
      }
      if (entry.remarks) {
        const remarks = document.createElement("p");
        remarks.className = "staff-appointment-history-remarks";
        remarks.textContent = entry.remarks;
        item.append(remarks);
      }
      historyList.append(item);
    });
    if (appointment.rescheduleHistory.length) {
      appointment.rescheduleHistory.forEach((entry) => {
        const item = document.createElement("li");
        const head = document.createElement("div");
        const action = document.createElement("strong");
        action.textContent = "Rescheduling Record";
        const time = document.createElement("time");
        time.dateTime = entry.timestamp;
        time.textContent = formatDateTime(entry.timestamp);
        head.append(action, time);
        const detail = document.createElement("p");
        detail.textContent = `${entry.from.date} ${entry.from.start}-${entry.from.end} -> ${entry.to.date} ${entry.to.start}-${entry.to.end}`;
        const reason = document.createElement("p");
        reason.className = "staff-appointment-history-remarks";
        reason.textContent = `${entry.reason} · ${entry.staff}`;
        item.append(head, detail, reason);
        historyList.append(item);
      });
    }
  }

  function renderActions(appointment) {
    actionsContainer.replaceChildren();
    const actor = staffActor();
    const now = new Date();
    const actions = [];
    if (appointment.status === service.STATUS.PENDING) actions.push("confirm", "reschedule", "cancel");
    if (appointment.status === service.STATUS.SCHEDULED) {
      actions.push("checkin", "complete", "reschedule", "cancel");
      if (now >= new Date(`${appointment.date}T${appointment.end}:00`)) actions.push("noshow");
    }
    if (appointment.status === service.STATUS.CHECKED_IN) {
      actions.push("complete", "cancel", "noshow");
    }
    if (!actions.length) {
      const message = document.createElement("p");
      message.className = "staff-empty";
      message.textContent = "No further action is available for this appointment.";
      actionsContainer.append(message);
      return;
    }
    actions.forEach((actionName) => {
      if (actionName === "noshow" && !actions.includes("noshow")) return;
      const config = actionConfig[actionName];
      const button = document.createElement("button");
      button.type = "button";
      button.className = actionName === "cancel" || actionName === "noshow" ? "danger-button" : (actionName === "reschedule" ? "secondary-button" : "primary-button");
      button.textContent = actionName === "confirm" ? "Confirm Appointment"
        : actionName === "checkin" ? "Check In"
        : actionName === "complete" ? "Complete Appointment"
        : actionName === "noshow" ? "Mark No Show"
        : actionName === "cancel" ? "Cancel Appointment"
        : "Reschedule";
      button.addEventListener("click", () => openAction(actionName));
      actionsContainer.append(button);
    });
  }

  function openAppointment(id) {
    const appointment = service.get(id);
    if (!appointment) {
      setFeedback("This appointment could not be found.", true);
      return;
    }
    selectedAppointmentId = id;
    const request = requestForAppointment(appointment);
    const student = request ? { program: request.program, yearLevel: request.yearLevel, semester: request.semester } : {};
    detailsTitle.textContent = appointment.id;
    setText(detailsService, appointment.serviceType);
    setText(detailsStudent, `${appointment.studentName} · ${appointment.studentNumber}`);
    detailsStatus.replaceChildren(statusBadge(appointment.status));
    setText(studentName, appointment.studentName);
    setText(studentNumber, appointment.studentNumber);
    setText(studentProgram, student.program || "Not provided");
    setText(studentYear, student.yearLevel || "Not provided");
    setText(studentSemester, student.semester || "Not provided");
    setText(appointmentId, appointment.id);
    setText(appointmentRequest, appointment.requestId);
    setText(appointmentService, appointment.serviceType);
    setText(appointmentDate, appointmentDateLabel(appointment.date));
    setText(appointmentStart, appointment.start);
    setText(appointmentEnd, appointment.end);
    setText(appointmentStatusText, appointment.status);
    setText(appointmentBooking, formatDateTime(appointment.bookingDate));
    setText(appointmentRemarks, appointment.staffRemarks || appointment.cancelReason || "");
    setText(requestDocument, request?.documentType || "Not available");
    setText(requestPurpose, request?.purpose || "Not available");
    setText(requestStatus, request?.status || "Not available");
    renderHistory(appointment);
    const availability = service.availability(appointment.date, appointment.start, appointment.end);
    availabilityText.textContent = availability.status === "Availability not configured"
      ? "Availability not configured"
      : `${availability.status}: ${availability.booked} of ${availability.capacity} booked, ${availability.remaining} remaining.`;
    renderActions(appointment);
    const studentLink = document.createElement("button");
    studentLink.type = "button";
    studentLink.className = "secondary-button";
    studentLink.textContent = "View Student Record";
    studentLink.addEventListener("click", () => {
      detailsDialog.close();
      document.dispatchEvent(new CustomEvent("portal:studentrecordopen", { detail: { studentNumber: appointment.studentNumber, origin: { type: "appointment", id: appointment.id } } }));
    });
    actionsContainer.append(studentLink);
    if (request && [requestService.STATUS.APPROVED, requestService.STATUS.PROCESSING, requestService.STATUS.READY, requestService.STATUS.RELEASED].includes(request.status)) {
      const processingLink = document.createElement("button");
      processingLink.type = "button";
      processingLink.className = "secondary-button";
      processingLink.textContent = "Open Document Processing & Release";
      processingLink.addEventListener("click", () => {
        detailsDialog.close();
        document.dispatchEvent(new CustomEvent("portal:documentopen", { detail: request.id }));
      });
      actionsContainer.append(processingLink);
    }
    if (!detailsDialog.open) detailsDialog.showModal();
    detailsTitle.focus({ preventScroll: true });
  }

  function openAction(actionName) {
    const appointment = service.get(selectedAppointmentId);
    const config = actionConfig[actionName];
    if (!appointment || !config) return;
    pendingAction = actionName;
    actionForm.reset();
    actionTitle.textContent = config.title;
    actionDescription.textContent = config.description;
    actionReasonLabel.textContent = config.reasonLabel;
    actionReason.required = config.required;
    actionReason.setCustomValidity("");
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
    rescheduleFields.hidden = !config.reschedule;
    rescheduleDate.value = appointment.date;
    renderTimeOptions(rescheduleStart, appointment.start);
    actionSubmit.textContent = actionName === "confirm" ? "Confirm appointment"
      : actionName === "checkin" ? "Check in"
      : actionName === "complete" ? "Complete appointment"
      : actionName === "noshow" ? "Mark no show"
      : actionName === "cancel" ? "Cancel appointment"
      : "Reschedule appointment";
    actionSubmit.className = config.danger ? "danger-button" : "primary-button";
    actionDialog.showModal();
    if (config.reschedule) rescheduleDate.focus();
    else actionReason.focus();
  }

  async function handleActionSubmit(event) {
    event.preventDefault();
    if (!selectedAppointmentId || !pendingAction) return;
    const config = actionConfig[pendingAction];
    const actor = staffActor();
    if (!config || !actor) {
      actionStatus.textContent = "Your staff session could not be verified. Sign in again.";
      actionStatus.classList.add("is-error");
      return;
    }
    const reason = actionReason.value.trim();
    if (config.required && !reason) {
      actionReason.setCustomValidity("Enter the required reason before continuing.");
      actionReason.reportValidity();
      return;
    }
    actionReason.setCustomValidity("");
    actionSubmit.disabled = true;
    actionStatus.textContent = "Saving appointment update...";
    actionStatus.classList.remove("is-error");
    try {
      let result;
      if (pendingAction === "confirm") result = await service.confirmAppointment(selectedAppointmentId, actor, reason);
      else if (pendingAction === "checkin") result = await service.checkIn(selectedAppointmentId, actor);
      else if (pendingAction === "complete") result = await service.completeAppointment(selectedAppointmentId, actor, reason);
      else if (pendingAction === "noshow") result = await service.markNoShow(selectedAppointmentId, actor, reason);
      else if (pendingAction === "cancel") result = await service.cancelAppointment(selectedAppointmentId, actor, reason);
      else if (pendingAction === "reschedule") {
        const newDate = rescheduleDate.value;
        const newStart = rescheduleStart.value;
        const newEnd = service.fromMinutes(service.toMinutes(newStart) + service.SLOT_MINUTES);
        if (!service.validDate(newDate)) throw new Error("Choose a valid appointment date.");
        if (newDate < service.manilaDate()) throw new Error("Appointment dates cannot be in the past.");
        result = await service.rescheduleAppointment(selectedAppointmentId, actor, newDate, newStart, newEnd, reason);
      }
      actionDialog.close();
      renderAll();
      if (detailsDialog.open && result?.appointment) {
        openAppointment(result.appointment.id);
      }
      setFeedback(`${result.appointment.id} updated to ${result.appointment.status}.`);
      document.dispatchEvent(new CustomEvent("portal:appointmentchanged", { detail: result.appointment }));
    } catch (error) {
      actionStatus.textContent = error.message;
      actionStatus.classList.add("is-error");
    } finally {
      actionSubmit.disabled = false;
    }
  }

  function resetFilters() {
    studentScope = "";
    query = "";
    dateQuery = "";
    serviceQuery = "all";
    statusQuery = "all";
    sortOrder = "date-asc";
    currentPage = 1;
    searchInput.value = "";
    dateFilter.value = "";
    serviceFilter.value = "all";
    statusFilter.value = "all";
    sortSelect.value = "date-asc";
    renderTable();
  }

  searchInput.addEventListener("input", (event) => {
    query = event.target.value;
    currentPage = 1;
    renderTable();
  });
  dateFilter.addEventListener("change", (event) => {
    dateQuery = event.target.value;
    currentPage = 1;
    renderTable();
  });
  serviceFilter.addEventListener("change", (event) => {
    serviceQuery = event.target.value;
    currentPage = 1;
    renderTable();
  });
  statusFilter.addEventListener("change", (event) => {
    statusQuery = event.target.value;
    currentPage = 1;
    renderTable();
  });
  sortSelect.addEventListener("change", (event) => {
    sortOrder = event.target.value;
    currentPage = 1;
    renderTable();
  });
  resetButton.addEventListener("click", () => {
    resetFilters();
    searchInput.focus();
  });
  previousPageButton.addEventListener("click", () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderTable();
  });
  nextPageButton.addEventListener("click", () => {
    currentPage += 1;
    renderTable();
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.appointmentView;
      if (view === "day") selectedDate = dateFilter.value || selectedDate || service.manilaDate();
      if (view === "month") cursor = new Date(`${selectedDate}T12:00:00`);
      if (view === "week") cursor = new Date(`${selectedDate}T12:00:00`);
      renderCalendar();
    });
  });
  prevButton.addEventListener("click", () => {
    if (view === "month") cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    else if (view === "week") cursor = addDays(cursor, -7);
    else cursor = addDays(cursor, -1);
    if (view !== "month") selectedDate = isoDate(cursor);
    renderCalendar();
  });
  nextButton.addEventListener("click", () => {
    if (view === "month") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    else if (view === "week") cursor = addDays(cursor, 7);
    else cursor = addDays(cursor, 1);
    if (view !== "month") selectedDate = isoDate(cursor);
    renderCalendar();
  });
  todayButton.addEventListener("click", () => {
    cursor = new Date();
    selectedDate = service.manilaDate();
    dateFilter.value = selectedDate;
    renderAll();
  });

  actionForm.addEventListener("submit", handleActionSubmit);
  actionDialog.addEventListener("close", () => {
    pendingAction = "";
    actionForm.reset();
    rescheduleFields.hidden = true;
    actionReason.required = false;
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
  });
  detailsDialog.addEventListener("close", () => {
    selectedAppointmentId = "";
  });
  document.querySelectorAll("[data-appointment-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  openRequestButton.addEventListener("click", () => {
    const appointment = service.get(selectedAppointmentId);
    if (!appointment?.requestId) return;
    const context = window.PortalStaffContext;
    if (context) {
      context.navigate("staff-requests");
      window.setTimeout(() => {
        document.dispatchEvent(new CustomEvent("portal:staffrequestopen", { detail: appointment.requestId }));
      }, 150);
    }
  });

  document.addEventListener("portal:staffpagechange", (event) => {
    if (event.detail !== "staff-appointments" || !context.current()) return;
    renderAll();
    if (pendingOpenId) { const id = pendingOpenId; pendingOpenId = ""; openAppointment(id); }
  });
  function scopedAppointments() {
    return service.listAll().filter((appointment) => !studentScope || appointment.studentNumber === studentScope);
  }
  document.addEventListener("portal:appointmentopen", (event) => {
    if (!context.current()) return;
    pendingOpenId = event.detail;
    context.navigate("staff-appointments");
  });
  document.addEventListener("portal:studentappointments", (event) => {
    if (!context.current()) return;
    resetFilters(); studentScope = event.detail;
    context.navigate("staff-appointments"); renderAll();
  });
  document.addEventListener("portal:requestschanged", () => {
    if (context.current()) renderAll();
  });
  document.addEventListener("portal:appointmentschanged", () => {
    if (context.current()) renderAll();
  });
  document.addEventListener("portal:staffaccountchange", () => {
    if (context.current() && staffScreen.dataset.currentPage === "staff-appointments") renderAll();
  });
  document.addEventListener("portal:logout", () => {
    studentScope = ""; pendingOpenId = ""; scopeNotice.textContent = "";
    if (detailsDialog.open) detailsDialog.close();
    if (actionDialog.open) actionDialog.close();
    selectedAppointmentId = "";
    pendingAction = "";
  });

  service.STATUSES.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    statusFilter.append(option);
  });
  requestService.SERVICES.forEach((serviceName) => {
    const option = document.createElement("option");
    option.value = serviceName;
    option.textContent = serviceName;
    serviceFilter.append(option);
  });

  cursor = new Date();
  selectedDate = service.manilaDate();
  dateFilter.value = "";

  if (context.current() && staffScreen.dataset.currentPage === "staff-appointments") renderAll();
};

