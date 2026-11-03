"use strict";

window.initializeStaffRequests = () => {
  const service = window.PortalRequestService;
  const appointmentService = window.PortalAppointmentService;
  const context = window.PortalStaffContext;
  const statuses = service.STATUS;
  const staffScreen = document.querySelector("#staff-screen");
  const searchInput = document.querySelector("#staff-requests-search");
  const statusSelect = document.querySelector("#staff-requests-status");
  const documentSelect = document.querySelector("#staff-requests-document");
  const sortSelect = document.querySelector("#staff-requests-sort");
  const resetButton = document.querySelector("#staff-requests-reset");
  const feedback = document.querySelector("#staff-requests-feedback");
  const visibleCount = document.querySelector("#staff-requests-visible-count");
  const tableWrap = document.querySelector("#staff-requests-table-wrap");
  const rows = document.querySelector("#staff-requests-rows");
  const empty = document.querySelector("#staff-requests-empty");
  const emptyTitle = document.querySelector("#staff-requests-empty-title");
  const emptyText = document.querySelector("#staff-requests-empty-text");
  const pagination = document.querySelector("#staff-requests-pagination");
  const resultCount = document.querySelector("#staff-requests-result-count");
  const pageLabel = document.querySelector("#staff-requests-page-label");
  const previousButton = document.querySelector("#staff-requests-prev");
  const nextButton = document.querySelector("#staff-requests-next");
  const summaryTotal = document.querySelector("#staff-requests-total");
  const summaryPending = document.querySelector("#staff-requests-pending");
  const summaryProcessing = document.querySelector("#staff-requests-processing");
  const summaryCompleted = document.querySelector("#staff-requests-completed");
  const detailsDialog = document.querySelector("#staff-request-details-dialog");
  const detailsTitle = document.querySelector("#staff-request-details-title");
  const detailsDocument = document.querySelector("#staff-request-details-document");
  const detailsPurpose = document.querySelector("#staff-request-details-purpose");
  const detailsStatus = document.querySelector("#staff-request-details-status");
  const detailsStudent = document.querySelector("#staff-request-details-student");
  const detailsNumber = document.querySelector("#staff-request-details-number");
  const detailsProgram = document.querySelector("#staff-request-details-program");
  const detailsSubmitted = document.querySelector("#staff-request-details-submitted");
  const detailsAppointment = document.querySelector("#staff-request-details-appointment");
  const detailsUpdated = document.querySelector("#staff-request-details-updated");
  const detailsStaff = document.querySelector("#staff-request-details-staff");
  const detailsReview = document.querySelector("#staff-request-details-review");
  const detailsExtra = document.querySelector("#staff-request-details-extra");
  const detailsMessages = document.querySelector("#staff-request-details-messages");
  const detailsHistory = document.querySelector("#staff-request-details-history");
  const detailsActions = document.querySelector("#staff-request-details-actions");
  const actionDialog = document.querySelector("#staff-request-action-dialog");
  const actionForm = document.querySelector("#staff-request-action-form");
  const actionTitle = document.querySelector("#staff-request-action-title");
  const actionDescription = document.querySelector("#staff-request-action-description");
  const actionReasonLabel = document.querySelector("#staff-request-action-reason-label");
  const actionReason = document.querySelector("#staff-request-action-reason");
  const actionReleaseField = document.querySelector("#staff-request-action-release-field");
  const actionRelease = document.querySelector("#staff-request-action-release");
  const actionStatus = document.querySelector("#staff-request-action-status");
  const actionSubmit = document.querySelector("#staff-request-action-submit");

  const pageSize = 8;
  const actionConfig = Object.freeze({
    [statuses.APPROVED]: {
      title: "Approve request",
      description: "Approve this request and move it to Approved? The student will see the decision and any staff remarks.",
      reasonLabel: "Staff remarks (optional)",
      confirm: "Approve request",
      required: false,
      danger: false,
    },
    [statuses.CORRECTION]: {
      title: "Request correction",
      description: "Return this request to the student for correction. The request will stay in Needs Correction until the student resubmits.",
      reasonLabel: "What does the student need to correct?",
      confirm: "Send correction request",
      required: true,
      danger: true,
    },
    [statuses.REJECTED]: {
      title: "Reject request",
      description: "Reject this request. The student will see the rejection reason in My Request, and the request cannot be reopened.",
      reasonLabel: "Reason for rejection",
      confirm: "Reject request",
      required: true,
      danger: true,
    },
    [statuses.PROCESSING]: {
      title: "Start processing",
      description: "Move this approved request into Processing while the document is prepared.",
      reasonLabel: "Processing remarks (optional)",
      confirm: "Start processing",
      required: false,
      danger: false,
    },
    [statuses.READY]: {
      title: "Mark ready for pickup",
      description: "Mark this document as ready for pickup. The student will see that it can now be collected.",
      reasonLabel: "Pickup instructions or remarks (optional)",
      confirm: "Mark ready for pickup",
      required: false,
      danger: false,
    },
    [statuses.RELEASED]: {
      title: "Mark as released",
      description: "Confirm that the document is being released to the student or an authorized representative.",
      reasonLabel: "Release remarks (optional)",
      confirm: "Mark as released",
      required: false,
      danger: false,
      verification: true,
    },
  });
  const actionOrder = [statuses.APPROVED, statuses.CORRECTION, statuses.REJECTED, statuses.PROCESSING, statuses.READY, statuses.RELEASED];
  const detailLabels = Object.freeze({
    academicYear: "Academic Year",
    requestedSemester: "Requested Semester",
    copies: "Copies",
    notes: "Additional Notes",
    email: "Email",
    phoneNumber: "Phone Number",
  });
  const detailSkip = new Set(["fullName", "studentNumber", "program", "yearLevel", "semester", "purpose", "appointmentDate", "appointmentDateLabel", "appointmentStart", "appointmentEnd", "appointmentTimeRange", "appointmentEndNextDay"]);

  let query = "";
  let studentScope = "";
  const scopeNotice = document.createElement("p");
  scopeNotice.className = "demo-note";
  feedback.before(scopeNotice);
  let statusFilter = "all";
  let documentFilter = "all";
  let sortOrder = "newest";
  let currentPage = 1;
  let selectedRequestId = "";
  let pendingActionStatus = "";
  let feedbackTimer;

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }

  function formatAppointmentDate(request) {
    if (request.appointment.dateLabel) return request.appointment.dateLabel;
    if (request.appointment.date) return formatDate(`${request.appointment.date}T12:00:00`);
    return request.appointment.display || "Not scheduled";
  }

  function detailLabel(key) {
    return detailLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
  }

  function setText(element, value) {
    element.textContent = value === "" || value === null || value === undefined ? "—" : String(value);
  }

  function statusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `staff-status staff-status-${service.statusTone(status)}`;
    badge.textContent = status;
    return badge;
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

  function staffActor() {
    const current = context.current();
    if (!current?.account) return null;
    return {
      role: "staff",
      accountNumber: current.account.accountNumber,
      name: current.profile?.fullName || current.account.fullName,
    };
  }

  function populateFilters() {
    service.STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusSelect.append(option);
    });
    service.SERVICES.forEach((documentName) => {
      const option = document.createElement("option");
      option.value = documentName;
      option.textContent = documentName;
      documentSelect.append(option);
    });
  }

  function filteredRequests() {
    const text = query.trim().toLowerCase();
    const list = service.listAll().filter((request) => {
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      const matchesDocument = documentFilter === "all" || request.documentType === documentFilter;
      const haystack = [request.id, request.studentName, request.studentNumber, request.documentType, request.purpose].join(" ").toLowerCase();
      return matchesStatus && matchesDocument && (!text || haystack.includes(text)) && (!studentScope || request.studentNumber === studentScope && service.isActive(request.status));
    });
    if (sortOrder === "oldest") return list.sort((first, second) => new Date(first.submittedAt) - new Date(second.submittedAt));
    if (sortOrder === "student") return list.sort((first, second) => first.studentName.localeCompare(second.studentName, "en", { sensitivity: "base" }));
    return list.sort((first, second) => new Date(second.submittedAt) - new Date(first.submittedAt));
  }

  function renderSummary() {
    const counts = service.summary(service.listAll());
    setText(summaryTotal, counts.total);
    setText(summaryPending, counts.pending);
    setText(summaryProcessing, counts.processing);
    setText(summaryCompleted, counts.released);
  }

  function renderTable() {
    scopeNotice.textContent = studentScope ? `Active requests for student ${studentScope}. Use Reset filters to view all requests.` : "";
    const filtered = filteredRequests();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    rows.replaceChildren();
    visible.forEach((request) => {
      const row = document.createElement("tr");
      row.dataset.requestId = request.id;
      const reference = document.createElement("td");
      reference.className = "staff-ref";
      reference.textContent = request.id;
      const name = document.createElement("td");
      name.className = "staff-request-student-name";
      name.textContent = request.studentName;
      const number = document.createElement("td");
      number.textContent = request.studentNumber;
      const documentName = document.createElement("td");
      documentName.textContent = request.documentType;
      const submitted = document.createElement("td");
      submitted.textContent = formatDate(request.submittedAt);
      const appointment = document.createElement("td");
      appointment.textContent = formatAppointmentDate(request);
      const status = document.createElement("td");
      status.append(statusBadge(request.status));
      const action = document.createElement("td");
      action.className = "staff-table-action-cell";
      const view = document.createElement("button");
      view.type = "button";
      view.className = "staff-table-action";
      view.textContent = "View details";
      view.setAttribute("aria-label", `View details for request ${request.id}`);
      view.addEventListener("click", () => openRequest(request.id));
      action.append(view);
      row.append(reference, name, number, documentName, submitted, appointment, status, action);
      rows.append(row);
    });
    visibleCount.textContent = String(filtered.length);
    tableWrap.hidden = filtered.length === 0;
    empty.hidden = filtered.length > 0;
    pagination.hidden = filtered.length === 0;
    if (!filtered.length) {
      const noRequests = service.listAll().length === 0;
      emptyTitle.textContent = noRequests ? "No requests yet" : "No matching requests";
      emptyText.textContent = noRequests
        ? "Student submissions from the portal will appear here."
        : "Try a different search term, status, document type, or reset the filters.";
    }
    resultCount.textContent = filtered.length
      ? `Showing ${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} request${filtered.length === 1 ? "" : "s"}`
      : "0 requests";
    pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  }

  function renderAll() {
    renderSummary();
    renderTable();
  }

  function appendDetailField(list, label, value) {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value === "" || value === null || value === undefined ? "Not provided" : String(value);
    item.append(term, description);
    list.append(item);
  }

  function renderDetailMessages(request) {
    detailsMessages.replaceChildren();
    const messages = [];
    if (request.correctionReason) messages.push(["Correction requested", request.correctionReason, "is-warning"]);
    if (request.rejectionReason) messages.push(["Rejection reason", request.rejectionReason, "is-danger"]);
    if (request.cancelReason) messages.push(["Cancellation reason", request.cancelReason, "is-muted"]);
    if (request.studentCorrectionNote) messages.push(["Student correction note", request.studentCorrectionNote, "is-info"]);
    if (request.staffRemarks && ![request.correctionReason, request.rejectionReason].filter(Boolean).includes(request.staffRemarks)) {
      messages.push(["Staff remarks", request.staffRemarks, "is-info"]);
    }
    if (request.releaseVerification) messages.push(["Release verification", request.releaseVerification, "is-success"]);
    if (request.releasedBy) messages.push(["Released by", request.releasedBy, "is-success"]);
    if (!messages.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "staff-empty";
      emptyMessage.textContent = "No processing remarks yet.";
      detailsMessages.append(emptyMessage);
      return;
    }
    messages.forEach(([label, value, tone]) => {
      const message = document.createElement("p");
      message.className = `staff-request-detail-message ${tone}`;
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      message.append(strong, document.createTextNode(value));
      detailsMessages.append(message);
    });
  }

  function renderDetailHistory(request) {
    detailsHistory.replaceChildren();
    request.history.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      const header = document.createElement("div");
      const action = document.createElement("strong");
      action.textContent = entry.action;
      const time = document.createElement("time");
      time.dateTime = entry.timestamp;
      time.textContent = formatDateTime(entry.timestamp);
      header.append(action, time);
      const transition = document.createElement("p");
      transition.textContent = `${entry.previousStatus || "New"} → ${entry.newStatus}`;
      item.append(header, transition);
      if (entry.actor) {
        const actor = document.createElement("p");
        actor.className = "staff-request-history-actor";
        actor.textContent = `${entry.actor}${entry.actorRole ? ` · ${entry.actorRole}` : ""}`;
        item.append(actor);
      }
      if (entry.remarks) {
        const remarks = document.createElement("p");
        remarks.className = "staff-request-history-remarks";
        remarks.textContent = entry.remarks;
        item.append(remarks);
      }
      detailsHistory.append(item);
    });
  }

  function renderDetailActions(request) {
    detailsActions.replaceChildren();
    if ([statuses.APPROVED, statuses.PROCESSING, statuses.READY].includes(request.status)) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "primary-button";
      link.textContent = "Open Document Processing & Release";
      link.addEventListener("click", () => {
        detailsDialog.close();
        document.dispatchEvent(new CustomEvent("portal:documentopen", { detail: request.id }));
      });
      detailsActions.append(link);
      return;
    }
    const allowed = actionOrder.filter((target) => target !== statuses.CANCELLED && service.canTransition(request.status, target));
    if (!allowed.length) {
      const message = document.createElement("p");
      message.className = "staff-empty";
      message.textContent = request.status === statuses.CORRECTION
        ? "Waiting for the student to submit corrections."
        : [statuses.RELEASED, statuses.REJECTED, statuses.CANCELLED].includes(request.status)
          ? "This request is closed. No further staff action is available."
          : "No staff action is available for this status.";
      detailsActions.append(message);
      return;
    }
    allowed.forEach((target) => {
      const config = actionConfig[target];
      if (!config) return;
      const button = document.createElement("button");
      let className = "primary-button";
      if (target === statuses.CORRECTION) className = "secondary-button staff-request-warning-button";
      if (target === statuses.REJECTED) className = "danger-button";
      button.type = "button";
      button.className = className;
      button.textContent = target === statuses.CORRECTION ? "Request Correction" : target === statuses.REJECTED ? "Reject Request" : config.confirm;
      button.addEventListener("click", () => openAction(target));
      detailsActions.append(button);
    });
  }

  function renderDetails(request) {
    detailsTitle.textContent = request.id;
    setText(detailsDocument, request.documentType);
    setText(detailsPurpose, request.purpose);
    detailsStatus.replaceChildren(statusBadge(request.status));
    setText(detailsStudent, request.studentName);
    setText(detailsNumber, request.studentNumber);
    setText(detailsProgram, [request.program, request.yearLevel, request.semester].filter(Boolean).join(" · "));
    setText(detailsSubmitted, formatDateTime(request.submittedAt));
    setText(detailsAppointment, request.appointment.display || "Not scheduled");
    setText(detailsUpdated, formatDateTime(request.updatedAt));
    setText(detailsStaff, request.assignedStaff);
    setText(detailsReview, request.reviewDate ? formatDateTime(request.reviewDate) : "Not yet reviewed");
    detailsExtra.replaceChildren();
    Object.entries(request.details || {}).forEach(([key, value]) => {
      if (detailSkip.has(key) || value === "" || value === null || value === undefined || typeof value === "object") return;
      appendDetailField(detailsExtra, detailLabel(key), value);
    });
    if (!detailsExtra.childElementCount) appendDetailField(detailsExtra, "Additional details", "None provided");
    renderDetailMessages(request);
    renderDetailHistory(request);
    renderDetailActions(request);
    const studentLink = document.createElement("button");
    studentLink.type = "button";
    studentLink.className = "secondary-button";
    studentLink.textContent = "View Student Record";
    studentLink.addEventListener("click", () => {
      detailsDialog.close();
      document.dispatchEvent(new CustomEvent("portal:studentrecordopen", { detail: { studentNumber: request.studentNumber, origin: { type: "request", id: request.id } } }));
    });
    detailsActions.append(studentLink);
    const appointment = appointmentService.getByRequest(request.id);
    if (appointment) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "secondary-button";
      link.textContent = "Open Appointment Management";
      link.addEventListener("click", () => {
        const context = window.PortalStaffContext;
        if (context) context.navigate("staff-appointments");
      });
      detailsActions.append(link);
    }
  }

  function openRequest(id) {
    const request = service.get(id);
    if (!request) {
      setFeedback("This request could not be found.", true);
      return;
    }
    selectedRequestId = id;
    renderDetails(request);
    if (!detailsDialog.open) detailsDialog.showModal();
    detailsTitle.focus({ preventScroll: true });
  }

  function openAction(target) {
    const request = service.get(selectedRequestId);
    const config = actionConfig[target];
    if (!request || !config) return;
    if (!service.canTransition(request.status, target)) {
      setFeedback(`This request cannot move from ${request.status} to ${target}.`, true);
      return;
    }
    pendingActionStatus = target;
    actionForm.reset();
    actionTitle.textContent = config.title;
    actionDescription.textContent = config.description;
    actionReasonLabel.textContent = config.reasonLabel;
    actionReason.required = config.required;
    actionReason.setCustomValidity("");
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
    actionRelease.checked = false;
    actionRelease.setCustomValidity("");
    actionReleaseField.hidden = !config.verification;
    actionSubmit.textContent = config.confirm;
    actionSubmit.className = config.danger ? "danger-button" : "primary-button";
    actionDialog.showModal();
    actionReason.focus();
  }

  function resetFilters() {
    studentScope = "";
    query = "";
    statusFilter = "all";
    documentFilter = "all";
    sortOrder = "newest";
    currentPage = 1;
    searchInput.value = "";
    statusSelect.value = "all";
    documentSelect.value = "all";
    sortSelect.value = "newest";
    renderTable();
  }

  searchInput.addEventListener("input", (event) => {
    query = event.target.value;
    currentPage = 1;
    renderTable();
  });
  statusSelect.addEventListener("change", (event) => {
    statusFilter = event.target.value;
    currentPage = 1;
    renderTable();
  });
  documentSelect.addEventListener("change", (event) => {
    documentFilter = event.target.value;
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
  previousButton.addEventListener("click", () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderTable();
  });
  nextButton.addEventListener("click", () => {
    currentPage += 1;
    renderTable();
  });

  actionReason.addEventListener("input", () => {
    actionReason.setCustomValidity("");
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
  });
  actionRelease.addEventListener("change", () => {
    actionRelease.setCustomValidity("");
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
  });

  actionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedRequestId || !pendingActionStatus) return;
    const config = actionConfig[pendingActionStatus];
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
    if (config.verification && !actionRelease.checked) {
      actionRelease.setCustomValidity("Confirm the identity or authorized collection details before releasing.");
      actionRelease.reportValidity();
      return;
    }
    actionReason.setCustomValidity("");
    actionRelease.setCustomValidity("");
    actionSubmit.disabled = true;
    actionStatus.textContent = "Saving request update…";
    actionStatus.classList.remove("is-error");
    try {
      const { request } = await service.updateStatus(selectedRequestId, pendingActionStatus, actor, {
        reason,
        remarks: reason,
        verification: config.verification ? actionRelease.checked : undefined,
      });
      actionDialog.close();
      renderAll();
      if (detailsDialog.open) {
        renderDetails(request);
        detailsTitle.focus({ preventScroll: true });
      }
      setFeedback(`${request.id} moved to ${request.status}.`);
    } catch (error) {
      actionStatus.textContent = error.message;
      actionStatus.classList.add("is-error");
    } finally {
      actionSubmit.disabled = false;
    }
  });

  actionDialog.addEventListener("close", () => {
    pendingActionStatus = "";
    actionForm.reset();
    actionReason.required = false;
    actionReleaseField.hidden = true;
    actionStatus.textContent = "";
    actionStatus.classList.remove("is-error");
  });
  detailsDialog.addEventListener("close", () => {
    selectedRequestId = "";
  });

  document.querySelectorAll("[data-staff-request-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  document.addEventListener("portal:staffpagechange", (event) => {
    if (event.detail !== "staff-requests" || !context.current()) return;
    renderAll();
    const intent = context.consumeRequestIntent();
    if (intent) openRequest(intent);
  });

  document.addEventListener("portal:staffrequestopen", (event) => {
    if (context.current()) openRequest(event.detail);
  });
  document.addEventListener("portal:studentrequests", (event) => {
    if (!context.current()) return;
    resetFilters(); studentScope = event.detail; currentPage = 1;
    context.navigate("staff-requests"); renderTable();
  });

  document.addEventListener("portal:requestschanged", () => {
    if (!context.current()) return;
    renderAll();
    if (!selectedRequestId) return;
    const request = service.get(selectedRequestId);
    if (!request) {
      if (detailsDialog.open) detailsDialog.close();
      selectedRequestId = "";
      return;
    }
    if (detailsDialog.open) renderDetails(request);
  });

  document.addEventListener("portal:staffaccountchange", () => {
    if (context.current() && staffScreen.dataset.currentPage === "staff-requests") renderAll();
  });

  document.addEventListener("portal:logout", () => {
    studentScope = ""; scopeNotice.textContent = "";
    if (detailsDialog.open) detailsDialog.close();
    if (actionDialog.open) actionDialog.close();
    selectedRequestId = "";
    pendingActionStatus = "";
  });

  populateFilters();
  if (context.current() && staffScreen.dataset.currentPage === "staff-requests") renderAll();
};
