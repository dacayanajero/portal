"use strict";

window.initializePortalDashboard = () => {
  const loginScreen = document.querySelector("#login-screen");
  const dashboardScreen = document.querySelector("#dashboard-screen");
  const requestDialog = document.querySelector("#request-dialog");
  const requestCancelDialog = document.querySelector("#request-cancel-dialog");
  const requestCancelForm = document.querySelector("#request-cancel-form");
  const requestCancelDocument = document.querySelector("#request-cancel-document");
  const requestCancelReason = document.querySelector("#request-cancel-reason");
  const requestCancelStatus = document.querySelector("#request-cancel-status");
  const requestCancelSubmit = document.querySelector("#request-cancel-submit");
  const requestList = document.querySelector("#request-list");
  const requestEmpty = document.querySelector("#student-request-empty");
  const requestFeedback = document.querySelector("#student-request-feedback");
  const assistantDialog = document.querySelector("#assistant-dialog");
  const sidebarToggle = document.querySelector("#sidebar-toggle");
  const sidebarOverlay = document.querySelector("#sidebar-overlay");
  const sidebar = document.querySelector("#dashboard-sidebar");
  const servicesGroup = document.querySelector("#services-nav-group");
  const servicesToggle = document.querySelector("#services-toggle");
  const servicesSubmenu = document.querySelector("#services-submenu");
  const servicePages = new Set(["services", "grade-slip", "registration-form", "id-printing"]);
  const accountDropdown = document.querySelector("#account-dropdown");
  const accountToggle = document.querySelector("#account-toggle");
  const accountOptions = document.querySelector("#account-options");
  const mobileNavigation = window.matchMedia("(max-width: 700px)");
  const profileForm = document.querySelector("#profile-form");
  const profileStatus = document.querySelector("#profile-save-status");
  const profileMessage = document.querySelector("#profile-save-message");
  const profileEditButton = document.querySelector("#profile-edit-button");
  const profileEditLabel = document.querySelector("#profile-edit-label");
  const profileEditIcon = document.querySelector("#profile-edit-icon");
  const accounts = window.PortalAccounts;
  const requestService = window.PortalRequestService;
  const profileInputs = [...profileForm.querySelectorAll("[data-profile-editable]")];
  const routes = Object.fromEntries(Object.entries(window.PortalRoutes).map(([page, route]) => [page, route.hash]));
  const completionPages = new Set(Object.keys(routes).filter((page) => page.endsWith("-complete")));
  let selectedDocument = "";
  let selectedRequestId = "";
  let activeRequestId = "";
  let requestFeedbackTimer;
  let profileSaveTimer;
  let profileUpdatedAt = null;
  let profileSavedThisVisit = false;
  let activeAccount = null;
  let profileStorageKey = "";
  let profileEditing = false;
  let desktopSidebarOpen = true;
  let mobileSidebarOpen = false;

  function setProfileStatus(message, error = false) {
    profileMessage.textContent = message;
    profileStatus.classList.toggle("is-error", error);
    if (activeAccount) document.dispatchEvent(new CustomEvent("portal:profilechange", { detail: profileSnapshot() }));
  }

  function profileSnapshot() {
    const signedIn = activeAccount && accounts.isSessionValid(activeAccount);
    return {
      account: signedIn ? { ...activeAccount } : null,
      values: signedIn ? { ...Object.fromEntries(profileInputs.map((input) => [input.name, input.value])), studentNumber: profileForm.elements.studentNumber.value } : {},
      message: profileMessage.textContent,
      error: profileStatus.classList.contains("is-error"),
    };
  }

  function validateProfile() {
    let firstInvalid = null;
    profileInputs.forEach((input) => {
      const wasReadOnly = input.readOnly;
      input.readOnly = false;
      input.setCustomValidity("");
      if (input.required && !input.value.trim()) input.setCustomValidity("This field is required.");
      if (input.value.length > input.maxLength) input.setCustomValidity(`Use at most ${input.maxLength} characters.`);
      if (input.name === "phoneNumber" && input.value.trim() && (!/^[+\d() .-]+$/.test(input.value) || input.value.replace(/\D/g, "").length < 7)) {
        input.setCustomValidity("Please enter a valid phone number.");
      }
      const valid = input.checkValidity();
      input.readOnly = wasReadOnly;
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  function syncProfileDetails() {
    const fullName = profileForm.elements.fullName.value.trim();
    document.querySelectorAll("[data-profile-name]").forEach((element) => {
      element.textContent = fullName;
    });
    document.querySelector("[data-profile-first-name]").textContent = fullName.split(/\s+/)[0];
    const program = profileForm.elements.program.value.trim();
    document.querySelector(".profile-role").textContent = program ? `${program} Student` : "Student";
  }

  function showProfileSavedTime() {
    if (!profileUpdatedAt) return;
    const recent = Date.now() - profileUpdatedAt < 60000;
    const savedTime = new Date(profileUpdatedAt).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    setProfileStatus(`Auto-saved: ${recent ? "Just now" : savedTime}`);
  }

  function saveProfile(silent = false) {
    window.clearTimeout(profileSaveTimer);
    profileSaveTimer = undefined;
    if (!activeAccount) return false;
    const invalid = validateProfile();
    if (invalid) {
      const label = profileForm.querySelector(`label[for="${invalid.id}"]`).textContent;
      setProfileStatus(`Enter a valid ${label.toLowerCase()} to save your changes.`, true);
      return false;
    }
    const profile = Object.fromEntries(profileInputs.map((input) => [input.name, input.value.trim()]));
    syncProfileDetails();
    const updatedAt = Date.now();
    try {
      window.localStorage.setItem(profileStorageKey, JSON.stringify({ profile, updatedAt }));
      profileUpdatedAt = updatedAt;
      if (silent) return true;
      profileSavedThisVisit = true;
      showProfileSavedTime();
    } catch {
      profileUpdatedAt = null;
      setProfileStatus("Changes kept for this visit. Browser storage is unavailable.");
    }
    return true;
  }

  function restoreProfile() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(profileStorageKey));
      if (!saved || !Number.isFinite(saved.updatedAt) || saved.updatedAt <= 0) return;
      if (!profileInputs.every((input) => {
        const value = saved.profile?.[input.name];
        return value === undefined ? !input.required : typeof value === "string" && value.length <= input.maxLength;
      })) return;
      const defaults = profileInputs.map((input) => input.value);
      profileInputs.forEach((input) => {
        if (typeof saved.profile[input.name] === "string") input.value = saved.profile[input.name];
      });
      if (validateProfile()) {
        profileInputs.forEach((input, index) => {
          input.value = defaults[index];
          input.setCustomValidity("");
          input.removeAttribute("aria-invalid");
        });
        return;
      }
      profileUpdatedAt = saved.updatedAt;
      syncProfileDetails();
    } catch {
      // Keep this account's registration details when saved profile data is unavailable.
    }
  }

  function setProfileEditing(editing) {
    profileEditing = editing;
    profileInputs.forEach((input) => { input.readOnly = !editing; });
    profileEditButton.setAttribute("aria-pressed", String(editing));
    const label = editing ? "Finish editing profile information" : "Edit profile information";
    profileEditButton.setAttribute("aria-label", label);
    profileEditButton.title = label;
    profileEditLabel.textContent = editing ? "Done" : "Edit";
    profileEditIcon.setAttribute("href", editing ? "#icon-check" : "#icon-pencil");
  }

  function finishProfileEditing() {
    if (!saveProfile()) {
      profileInputs.find((input) => input.getAttribute("aria-invalid") === "true")?.focus();
      return;
    }
    setProfileEditing(false);
    profileEditButton.focus();
  }

  profileEditButton.addEventListener("click", () => {
    if (!activeAccount) return;
    if (profileEditing) {
      finishProfileEditing();
    } else {
      setProfileEditing(true);
      profileInputs[0].focus();
    }
  });

  function loadProfile(account) {
    window.clearTimeout(profileSaveTimer);
    profileSaveTimer = undefined;
    profileUpdatedAt = null;
    profileSavedThisVisit = false;
    activeAccount = account;
    profileStorageKey = `rtu.portal.profile.${encodeURIComponent(account.accountNumber)}`;
    profileForm.reset();
    profileInputs.forEach((input) => {
      input.value = account[input.name] || "";
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    profileForm.elements.studentNumber.value = account.accountNumber;
    document.querySelectorAll("[data-profile-student-number]").forEach((element) => {
      element.textContent = account.accountNumber;
    });
    setProfileStatus("Auto-save ready");
    restoreProfile();
    syncProfileDetails();
    setProfileEditing(false);
  }

  profileInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (!profileEditing) return;
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      window.clearTimeout(profileSaveTimer);
      setProfileStatus("Saving changes…");
      profileSaveTimer = window.setTimeout(saveProfile, 500);
    });
    input.addEventListener("change", saveProfile);
  });
  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (profileEditing) finishProfileEditing();
  });
  window.addEventListener("pagehide", () => {
    if (profileSaveTimer !== undefined) saveProfile();
  });

  function syncNavigation() {
    const available = !completionPages.has(dashboardScreen.dataset.currentPage);
    const mobile = mobileNavigation.matches;
    const open = available && (mobile ? mobileSidebarOpen : desktopSidebarOpen);
    dashboardScreen.classList.toggle("sidebar-open", mobile && open);
    dashboardScreen.classList.toggle("sidebar-collapsed", !open);
    const label = open ? "Collapse navigation" : "Expand navigation";
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
    sidebarOverlay.hidden = !mobile || !open;
    if (!open && servicesSubmenu.contains(document.activeElement)) sidebarToggle.focus();
    sidebar.inert = !available;
    if (!open) setServicesExpanded(false);
  }

  function closeNavigation() {
    mobileSidebarOpen = false;
    syncNavigation();
  }

  mobileNavigation.addEventListener("change", closeNavigation);
  closeNavigation();

  function setServicesExpanded(open) {
    servicesToggle.setAttribute("aria-expanded", String(open));
    window.PortalMotion.disclose(servicesSubmenu, open);
  }

  servicesToggle.addEventListener("click", () => {
    if (dashboardScreen.classList.contains("sidebar-collapsed")) {
      if (mobileNavigation.matches) mobileSidebarOpen = true;
      else desktopSidebarOpen = true;
      syncNavigation();
      setServicesExpanded(true);
      document.dispatchEvent(new Event("portal:layoutchange"));
      return;
    }
    setServicesExpanded(servicesToggle.getAttribute("aria-expanded") !== "true");
  });
  servicesGroup.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !servicesSubmenu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setServicesExpanded(false);
      servicesToggle.focus();
    }
  });

  function closeAccountDropdown() {
    window.PortalMotion.swap([accountOptions], null);
    accountToggle.setAttribute("aria-expanded", "false");
  }

  accountToggle.addEventListener("click", () => {
    const open = accountOptions.hidden;
    closeNavigation();
    window.PortalMotion.swap([accountOptions], open ? accountOptions : null);
    accountToggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (!accountDropdown.contains(event.target)) closeAccountDropdown();
  });
  accountDropdown.addEventListener("focusout", (event) => {
    if (!accountDropdown.contains(event.relatedTarget)) closeAccountDropdown();
  });
  accountDropdown.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountOptions.hidden) {
      event.preventDefault();
      closeAccountDropdown();
      accountToggle.focus();
    }
  });

  function showPage(page, focus = true) {
    const view = document.querySelector(`[data-view="${page}"]`);
    if (!view) return;
    dashboardScreen.dataset.currentPage = page;
    if (page === "requests") selectedRequestId = "";
    if (profileSavedThisVisit && ["profile", "settings"].includes(page) && profileSaveTimer === undefined && !profileStatus.classList.contains("is-error")) showProfileSavedTime();
    window.PortalMotion.swap(document.querySelectorAll("[data-view]"), view);
    document.querySelectorAll(".dashboard-nav [data-page], .account-options [data-page]").forEach((button) => {
      const active = button.dataset.page === page;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const inServices = servicePages.has(page);
    servicesToggle.classList.toggle("is-active", inServices);
    setServicesExpanded(inServices);
    closeNavigation();
    closeAccountDropdown();
    document.querySelectorAll(".portal-dialog[open]").forEach((dialog) => dialog.close());
    document.title = `RTU Pasig | ${view.querySelector("h2").textContent.trim()}`;
    if (focus) view.querySelector("h2").focus();
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("portal:pagechange", { detail: page }));
  }

  function pageFromRoute() {
    return Object.keys(routes).find((page) => routes[page] === window.location.hash) || "dashboard";
  }

  function renderRoute() {
    if (dashboardScreen.hidden) return;
    if (activeAccount && !accounts.isSessionValid(activeAccount)) return;
    const page = pageFromRoute();
    if (window.location.hash !== routes[page]) window.history.replaceState(null, "", routes[page]);
    showPage(page);
  }

  function navigate(page, replace = false) {
    if (dashboardScreen.hidden || !Object.hasOwn(routes, page)) return;
    if (replace) {
      window.history.replaceState(null, "", routes[page]);
      renderRoute();
    } else if (window.location.hash === routes[page]) {
      renderRoute();
    } else {
      window.location.hash = routes[page];
    }
  }

  window.addEventListener("hashchange", renderRoute);

  function openDashboard(account) {
    loadProfile(account);
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    if (!profileUpdatedAt) saveProfile(true);
    selectedRequestId = "";
    renderRequests();
    navigate(pageFromRoute(), true);
    document.dispatchEvent(new CustomEvent("portal:accountchange", { detail: profileSnapshot() }));
  }

  document.addEventListener("portal:login", (event) => {
    if (event.detail?.role !== "student") return;
    const identity = accounts.saveSession(event.detail, { newLogin: true });
    openDashboard(identity);
  });

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.matches("a") && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
      event.preventDefault();
      if (sidebar.contains(button) && mobileNavigation.matches) {
        closeNavigation();
        document.dispatchEvent(new Event("portal:layoutchange"));
      }
      navigate(button.dataset.page);
    });
  });

  sidebarToggle.addEventListener("click", () => {
    if (completionPages.has(dashboardScreen.dataset.currentPage)) return;
    closeAccountDropdown();
    if (mobileNavigation.matches) mobileSidebarOpen = !mobileSidebarOpen;
    else desktopSidebarOpen = !desktopSidebarOpen;
    syncNavigation();
    document.dispatchEvent(new Event("portal:layoutchange"));
  });
  sidebarOverlay.addEventListener("click", () => {
    closeNavigation();
    sidebarToggle.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dashboardScreen.classList.contains("sidebar-open")) {
      closeNavigation();
      sidebarToggle.focus();
    }
  });

  async function logOutStudent(forced = false, message = "") {
    if (!forced) document.dispatchEvent(new Event("portal:beforelogout"));
    if (!forced && profileSaveTimer !== undefined) saveProfile();
    window.clearTimeout(profileSaveTimer); profileSaveTimer = undefined;
    try { await accounts.clearSession(); }
    catch (error) {
      window.alert(`Sign-out failed: ${error.message}`);
      return;
    }
    activeAccount = null;
    setProfileEditing(false);
    dashboardScreen.hidden = true;
    setServicesExpanded(false);
    loginScreen.hidden = false;
    selectedRequestId = "";
    activeRequestId = "";
    if (requestCancelDialog.open) requestCancelDialog.close();
    setRequestFeedback("");
    renderRequests();
    document.querySelector("#login-form").reset();
    document.querySelector("#login-status").textContent = "";
    document.querySelector("#assistant-question").value = "";
    desktopSidebarOpen = true;
    closeNavigation();
    closeAccountDropdown();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    document.title = "RTU Pasig | Academic Services Portal";
    document.querySelector("#account-number").focus();
    window.scrollTo(0, 0);
    document.dispatchEvent(new Event("portal:logout"));
    document.dispatchEvent(new CustomEvent("portal:loginrequired", { detail: { role: "student", message } }));
    window.PortalMotion.enter(loginScreen.querySelector(".login-content"));
  }
  document.querySelector("#logout-button").addEventListener("click", () => logOutStudent());
  document.addEventListener("portal:sessioninvalidated", (event) => { if (activeAccount && event.detail.role === "student" && !accounts.isSessionValid(activeAccount, false)) logOutStudent(true, event.detail.message); });

  document.querySelectorAll("[data-request]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDocument = button.dataset.request;
      document.querySelector("#request-dialog-title").textContent = `Request ${selectedDocument}`;
      document.querySelector("#document-request-form").reset();
      requestDialog.showModal();
    });
  });

  function formatRequestDateTime(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return "Not available";
    return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function detailLabel(key) {
    const labels = { academicYear: "Academic Year", requestedSemester: "Requested Semester", copies: "Copies", notes: "Additional Notes", purpose: "Purpose", email: "Email", phoneNumber: "Phone Number" };
    return labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
  }

  function requestDetailEntries(request) {
    const skipped = new Set(["fullName", "studentNumber", "purpose", "appointmentDate", "appointmentDateLabel", "appointmentStart", "appointmentEnd", "appointmentTimeRange", "appointmentEndNextDay"]);
    return Object.entries(request.details || {}).filter(([key, value]) => (
      !skipped.has(key) && value !== "" && value !== null && value !== undefined && typeof value !== "object"
    )).map(([key, value]) => [detailLabel(key), String(value)]);
  }

  function setRequestFeedback(message, error = false) {
    window.clearTimeout(requestFeedbackTimer);
    requestFeedback.textContent = message;
    requestFeedback.classList.toggle("is-error", error);
    if (message && !error) {
      requestFeedbackTimer = window.setTimeout(() => {
        requestFeedback.textContent = "";
        requestFeedback.classList.remove("is-error");
      }, 5000);
    }
  }

  function appendMeta(list, label, value) {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    item.append(term, description);
    list.append(item);
  }

  const REQUEST_PROGRESS_STEPS = Object.freeze([
    { label: "Request Submitted", icon: "icon-document" },
    { label: "Under Verification", icon: "icon-search" },
    { label: "Processing Documents", icon: "icon-settings" },
    { label: "Ready for Pick-up", icon: "icon-document" },
    { label: "Claimed", icon: "icon-user" },
  ]);
  const REQUEST_STEP_INDEX = Object.freeze({
    [requestService.STATUS.PENDING]: 1,
    [requestService.STATUS.CORRECTION]: 1,
    [requestService.STATUS.APPROVED]: 2,
    [requestService.STATUS.PROCESSING]: 2,
    [requestService.STATUS.READY]: 3,
    [requestService.STATUS.REJECTED]: 1,
    [requestService.STATUS.CANCELLED]: 1,
  });
  const REQUEST_STEP_CAPTIONS = Object.freeze({
    [requestService.STATUS.PENDING]: "In Progress",
    [requestService.STATUS.CORRECTION]: "Needs Correction",
    [requestService.STATUS.APPROVED]: "Awaiting Processing",
    [requestService.STATUS.PROCESSING]: "In Progress",
    [requestService.STATUS.READY]: "In Progress",
    [requestService.STATUS.REJECTED]: "Not Approved",
    [requestService.STATUS.CANCELLED]: "Cancelled",
  });
  const REQUEST_ACTIVITY_TEXT = Object.freeze({
    "Request Submitted": "Request submitted successfully",
    "Approved by Staff": "Requirements verified and request approved",
    "Processing Started": "Document is being processed.",
    "Ready for Pickup": "Document is ready for pick-up.",
    "Document Released": "Document released successfully.",
    "Correction Requested": "Additional information is needed.",
    "Request Rejected": "Request was not approved.",
    "Request Cancelled": "Request cancelled.",
    "Corrections Submitted": "Corrections submitted successfully.",
  });

  function formatRequestDate(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return "Not available";
    return new Date(value).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  function formatActivityDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "Not available", time: "" };
    return {
      date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    };
  }

  function createIcon(iconId, className = "portal-icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${iconId}`);
    svg.append(use);
    return svg;
  }

  function requestMessages(request) {
    const messages = [];
    if (request.correctionReason) messages.push(["Correction needed", request.correctionReason, "is-warning"]);
    if (request.rejectionReason) messages.push(["Rejection reason", request.rejectionReason, "is-danger"]);
    if (request.cancelReason) messages.push(["Cancellation reason", request.cancelReason, "is-muted"]);
    if (request.staffRemarks && ![request.correctionReason, request.rejectionReason].filter(Boolean).includes(request.staffRemarks)) {
      messages.push(["Staff remarks", request.staffRemarks, "is-info"]);
    }
    if (request.studentCorrectionNote && request.status === requestService.STATUS.PENDING) {
      messages.push(["Your correction note", request.studentCorrectionNote, "is-info"]);
    }
    if (request.status === requestService.STATUS.RELEASED && request.releasedBy) {
      messages.push(["Released by", request.releasedBy, "is-success"]);
    }
    return messages;
  }

  function requestTitle(request) {
    return /information$/i.test(request.documentType) ? request.documentType : `${request.documentType} Information`;
  }

  function requestStatusIcon(status) {
    const tone = requestService.statusTone(status);
    if (tone === "processing" || tone === "pending") return "icon-clock";
    if (tone === "correction") return "icon-help";
    if (tone === "approved" || tone === "ready" || tone === "released") return "icon-check";
    return "icon-document";
  }

  function requestProgressState(status) {
    if (status === requestService.STATUS.RELEASED) {
      return { completed: REQUEST_PROGRESS_STEPS.length, active: -1, caption: "", tone: "complete" };
    }
    const active = REQUEST_STEP_INDEX[status] ?? 1;
    const tone = status === requestService.STATUS.CORRECTION
      ? "warning"
      : status === requestService.STATUS.REJECTED
        ? "error"
        : status === requestService.STATUS.CANCELLED
          ? "muted"
          : "active";
    return { completed: active, active, caption: REQUEST_STEP_CAPTIONS[status] || "In Progress", tone };
  }

  function buildRequestSummary(request) {
    const summary = document.createElement("section");
    summary.className = "request-summary";

    const copy = document.createElement("div");
    copy.className = "request-summary-copy";
    const title = document.createElement("h3");
    title.textContent = requestTitle(request);
    const reference = document.createElement("p");
    reference.className = "request-summary-id";
    reference.textContent = `Request ID: ${request.id}`;
    copy.append(title, reference);

    const divider = document.createElement("span");
    divider.className = "request-summary-divider";
    divider.setAttribute("aria-hidden", "true");

    const submitted = document.createElement("div");
    submitted.className = "request-summary-submitted";
    const submittedCopy = document.createElement("div");
    const submittedLabel = document.createElement("small");
    submittedLabel.textContent = "Submitted on";
    const submittedDate = document.createElement("strong");
    submittedDate.textContent = formatRequestDate(request.submittedAt);
    submittedCopy.append(submittedLabel, submittedDate);
    submitted.append(createIcon("icon-calendar"), submittedCopy);

    const status = document.createElement("span");
    status.className = `request-status-pill request-status-${requestService.statusTone(request.status)}`;
    status.append(createIcon(requestStatusIcon(request.status)), document.createTextNode(displayRequestStatus(request.status)));

    summary.append(createIcon("icon-document", "portal-icon request-summary-icon"), copy, divider, submitted, status);
    return summary;
  }

  function buildRequestMessages(request) {
    const messages = requestMessages(request);
    if (!messages.length) return null;
    const notice = document.createElement("div");
    notice.className = "request-messages";
    messages.forEach(([label, text, tone]) => {
      const message = document.createElement("p");
      message.className = `request-message ${tone}`;
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      message.append(strong, document.createTextNode(text));
      notice.append(message);
    });
    return notice;
  }

  function buildRequestProgress(request) {
    const state = requestProgressState(request.status);
    const progress = document.createElement("ol");
    progress.className = "request-progress";
    progress.setAttribute("aria-label", `Progress for ${request.documentType}`);
    REQUEST_PROGRESS_STEPS.forEach((step, index) => {
      const item = document.createElement("li");
      item.className = "request-step";
      let caption = "Upcoming";
      let complete = false;
      if (index < state.completed) {
        complete = true;
        item.classList.add("is-complete");
        caption = "Completed";
      } else if (index === state.active) {
        item.classList.add("is-active");
        item.setAttribute("aria-current", "step");
        if (state.tone !== "active" && state.tone !== "complete") item.classList.add(`is-${state.tone}`);
        caption = state.caption;
      }
      const marker = document.createElement("span");
      marker.className = "request-step-marker";
      marker.append(createIcon(complete ? "icon-check" : step.icon));
      const label = document.createElement("span");
      label.className = "request-step-label";
      label.textContent = step.label;
      const detail = document.createElement("small");
      detail.textContent = caption;
      label.append(detail);
      item.append(marker, label);
      progress.append(item);
    });
    return progress;
  }

  function buildRequestActivity(request) {
    const activity = document.createElement("section");
    activity.className = "request-activity";
    const title = document.createElement("h3");
    title.textContent = "Activity History";
    const list = document.createElement("ol");
    list.className = "request-activity-list";
    request.history.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "request-activity-item";
      const check = document.createElement("span");
      check.className = "request-activity-check";
      check.append(createIcon("icon-check"));
      const date = document.createElement("div");
      date.className = "request-activity-date";
      const when = formatActivityDate(entry.timestamp);
      const dateLabel = document.createElement("strong");
      dateLabel.textContent = when.date;
      const time = document.createElement("time");
      time.dateTime = entry.timestamp;
      time.textContent = when.time;
      date.append(dateLabel, time);
      const text = document.createElement("p");
      text.className = "request-activity-text";
      text.textContent = REQUEST_ACTIVITY_TEXT[entry.action] || entry.action;
      item.append(check, date, text);
      list.append(item);
    });
    activity.append(title, list);
    return activity;
  }

  function buildRequestDetails(request) {
    const panel = document.createElement("div");
    panel.className = "request-details-panel";
    panel.id = `request-details-${request.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    panel.dataset.detailsPanel = request.id;
    panel.hidden = true;

    const title = document.createElement("h4");
    title.textContent = "Request Details";

    const infoSection = document.createElement("section");
    infoSection.className = "request-detail-section";
    const infoTitle = document.createElement("h5");
    infoTitle.textContent = "Request Information";
    const grid = document.createElement("dl");
    grid.className = "request-details-grid";
    appendMeta(grid, "Student", `${request.studentName} · ${request.studentNumber}`);
    appendMeta(grid, "Program", request.program || "Not provided");
    appendMeta(grid, "Year level", request.yearLevel || "Not provided");
    appendMeta(grid, "Semester", request.semester || "Not provided");
    appendMeta(grid, "Purpose", request.purpose);
    appendMeta(grid, "Appointment", request.appointment.display || "Not scheduled");
    const relatedAppointment = window.PortalAppointmentService?.getByRequest(request.id);
    appendMeta(grid, "Appointment status", relatedAppointment ? relatedAppointment.status : "Not scheduled");
    appendMeta(grid, "Assigned staff", request.assignedStaff || "Not yet assigned");
    appendMeta(grid, "Last updated", formatRequestDateTime(request.updatedAt));
    if (request.processingStartedAt) appendMeta(grid, "Processing started", formatRequestDateTime(request.processingStartedAt));
    if (request.readyAt) appendMeta(grid, "Ready for pickup", formatRequestDateTime(request.readyAt));
    if (request.releasedAt) appendMeta(grid, "Release recorded", formatRequestDateTime(request.releasedAt));
    if (request.release?.reference) appendMeta(grid, "Release reference", request.release.reference);
    requestDetailEntries(request).forEach(([label, value]) => appendMeta(grid, label, value));
    infoSection.append(infoTitle, grid);
    if (request.notifications?.length) {
      const notices = document.createElement("section");
      notices.className = "request-detail-section";
      const heading = document.createElement("h5");
      heading.textContent = "Request notifications · in-app only";
      notices.append(heading);
      request.notifications.slice().reverse().forEach((notification) => {
        const message = document.createElement("p");
        message.textContent = `${formatRequestDateTime(notification.timestamp)} — ${notification.message}`;
        notices.append(message);
      });
      infoSection.append(notices);
    }

    const historySection = document.createElement("section");
    historySection.className = "request-detail-section";
    const historyTitle = document.createElement("h5");
    historyTitle.textContent = "Status History";
    const history = document.createElement("ol");
    history.className = "request-status-history";
    request.history.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      const head = document.createElement("div");
      head.className = "request-status-history-head";
      const action = document.createElement("strong");
      action.textContent = entry.action;
      const time = document.createElement("time");
      time.dateTime = entry.timestamp;
      time.textContent = formatRequestDateTime(entry.timestamp);
      head.append(action, time);
      const transition = document.createElement("p");
      transition.className = "request-status-transition";
      transition.textContent = `${entry.previousStatus || "New"} → ${entry.newStatus}`;
      item.append(head, transition);
      if (entry.remarks) {
        const remarks = document.createElement("p");
        remarks.className = "request-status-remarks";
        remarks.textContent = entry.remarks;
        item.append(remarks);
      }
      history.append(item);
    });
    historySection.append(historyTitle, history);

    const actions = document.createElement("div");
    actions.className = "request-detail-actions";
    if (request.status === requestService.STATUS.CORRECTION) {
      const form = document.createElement("form");
      form.className = "request-correction-form";
      form.dataset.correctionForm = "";
      form.dataset.requestId = request.id;
      const label = document.createElement("label");
      label.htmlFor = `correction-${request.id}`;
      label.textContent = "Describe the correction you made";
      const input = document.createElement("textarea");
      input.className = "request-correction-input";
      input.id = `correction-${request.id}`;
      input.rows = 2;
      input.maxLength = 500;
      input.required = true;
      input.placeholder = "Example: Updated my semester and student number.";
      const submit = document.createElement("button");
      submit.className = "primary-button";
      submit.type = "submit";
      submit.textContent = "Submit corrections";
      form.append(label, input, submit);
      actions.append(form);
    }
    if (requestService.canStudentCancel(request.status)) {
      const cancel = document.createElement("button");
      cancel.className = "secondary-button student-request-cancel";
      cancel.type = "button";
      cancel.dataset.cancelRequest = request.id;
      cancel.textContent = "Cancel request";
      actions.append(cancel);
    }

    panel.append(title, infoSection, historySection);
    if (actions.childElementCount) panel.append(actions);
    return panel;
  }

  function buildRequestPickup(request, panel) {
    const pickup = document.createElement("section");
    pickup.className = "request-pickup";
    const copy = document.createElement("div");
    copy.className = "request-pickup-copy";
    const title = document.createElement("h3");
    title.textContent = "Pick-up Schedule";
    const text = document.createElement("p");
    if (request.status === requestService.STATUS.READY) {
      text.textContent = request.appointment.display
        ? `Your document is ready for pick-up. Scheduled on ${request.appointment.display}.`
        : "Your document is ready for pick-up. Please contact the academic services office for your schedule.";
    } else if (request.status === requestService.STATUS.RELEASED) {
      text.textContent = "Your document has been released. Thank you for using the academic services portal.";
    } else if ([requestService.STATUS.REJECTED, requestService.STATUS.CANCELLED].includes(request.status)) {
      text.textContent = "No pick-up is scheduled for this request.";
    } else {
      text.textContent = "Your pickup schedule will appear here once your document is ready.";
    }
    copy.append(title, text);

    const toggle = document.createElement("button");
    toggle.className = "request-details-button";
    toggle.type = "button";
    toggle.dataset.detailsToggle = request.id;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", panel.id);
    const toggleLabel = document.createElement("span");
    toggleLabel.className = "request-details-toggle-label";
    toggleLabel.textContent = "View Request Details";
    toggle.append(createIcon("icon-document"), toggleLabel);

    pickup.append(createIcon("icon-calendar", "portal-icon request-pickup-icon"), copy, toggle);
    return pickup;
  }

  function displayRequestStatus(status) {
    const labels = {
      [requestService.STATUS.PENDING]: "Pending Review",
      [requestService.STATUS.CORRECTION]: "Needs Correction",
      [requestService.STATUS.APPROVED]: "Approved",
      [requestService.STATUS.REJECTED]: "Rejected",
      [requestService.STATUS.PROCESSING]: "Processing",
      [requestService.STATUS.READY]: "Ready for Pick-up",
      [requestService.STATUS.RELEASED]: "Released",
      [requestService.STATUS.CANCELLED]: "Cancelled",
    };
    return labels[status] || status;
  }

  function openRequestDetail(requestId) {
    selectedRequestId = requestId;
    renderRequests();
    document.querySelector("#requests-title").focus({ preventScroll: true });
  }

  function closeRequestDetail() {
    selectedRequestId = "";
    renderRequests();
    document.querySelector("#requests-title").focus({ preventScroll: true });
  }

  function buildRequestListCard(request) {
    const card = document.createElement("article");
    card.className = "student-request-card student-request-list-card";
    card.dataset.requestId = request.id;

    const head = document.createElement("div");
    head.className = "student-request-list-card-head";
    const copy = document.createElement("div");
    copy.className = "student-request-list-copy";
    const title = document.createElement("h3");
    title.textContent = requestTitle(request);
    const reference = document.createElement("p");
    reference.className = "student-request-summary-id";
    reference.textContent = `Request ID: ${request.id}`;
    copy.append(title, reference);
    head.append(copy);

    const statusActions = document.createElement("div");
    statusActions.className = "student-request-status-actions";
    const status = document.createElement("span");
    status.className = `request-status-pill request-status-${requestService.statusTone(request.status)}`;
    status.append(createIcon(requestStatusIcon(request.status)), document.createTextNode(displayRequestStatus(request.status)));
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "secondary-button student-request-open student-request-status-btn";
    openButton.dataset.requestOpen = request.id;
    openButton.textContent = "View Progress";
    statusActions.append(status, openButton);
    head.append(statusActions);

    const submitted = document.createElement("p");
    submitted.className = "student-request-list-meta";
    submitted.textContent = `Submitted on ${formatRequestDate(request.submittedAt)}`;

    const actions = document.createElement("div");
    actions.className = "student-request-list-actions";
    actions.style.display = "none";

    card.append(head, submitted);
    return card;
  }

  function buildRequestDetail(request) {
    const detail = document.createElement("article");
    detail.className = "student-request-card student-request-detail";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary-button student-request-back";
    back.dataset.requestBack = "";
    back.textContent = "Back to My Requests";
    const summary = buildRequestSummary(request);
    const messages = buildRequestMessages(request);
    if (messages) detail.append(messages);
    const progress = buildRequestProgress(request);
    const activity = buildRequestActivity(request);
    const panel = buildRequestDetails(request);
    const pickup = buildRequestPickup(request, panel);
    detail.append(back, summary, progress, activity, pickup, panel);
    return detail;
  }

  function renderRequests() {
    const list = activeAccount ? requestService.listForStudent(activeAccount.accountNumber) : [];
    if (selectedRequestId) {
      const request = requestService.getForStudent(selectedRequestId, activeAccount.accountNumber);
      requestEmpty.hidden = true;
      requestList.replaceChildren();
      if (!request) {
        selectedRequestId = "";
        return renderRequests();
      }
      requestList.append(buildRequestDetail(request));
      return;
    }
    requestEmpty.hidden = list.length > 0;
    requestList.replaceChildren();
    list.forEach((request) => {
      requestList.append(buildRequestListCard(request));
    });
  }

  function createRequest({ document: documentName, purpose, details } = {}, { nextPage = "requests", notify = true } = {}) {
    if (!activeAccount || !accounts.isSessionValid(activeAccount)) return null;
    const request = requestService.create({ student: activeAccount, document: documentName, purpose, details });
    if (!request) return null;
    renderRequests();
    navigate(Object.hasOwn(routes, nextPage) ? nextPage : "requests");
    if (notify) document.dispatchEvent(new CustomEvent("portal:requestcreated", { detail: request.documentType }));
    return request;
  }

  document.querySelector("#document-request-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const request = createRequest({ document: selectedDocument, purpose: document.querySelector("#request-purpose").value });
    if (request) requestDialog.close();
  });

  requestList.addEventListener("click", (event) => {
    const back = event.target.closest("[data-request-back]");
    if (back) {
      event.preventDefault();
      closeRequestDetail();
      return;
    }
    const openButton = event.target.closest("[data-request-open]");
    if (openButton) {
      event.preventDefault();
      openRequestDetail(openButton.dataset.requestOpen);
      return;
    }
    const detailsToggle = event.target.closest("[data-details-toggle]");
    if (detailsToggle) {
      const panel = detailsToggle.closest(".student-request-card")?.querySelector("[data-details-panel]");
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      detailsToggle.setAttribute("aria-expanded", String(open));
      const label = detailsToggle.querySelector(".request-details-toggle-label");
      if (label) label.textContent = open ? "Hide Request Details" : "View Request Details";
      return;
    }
    const cancel = event.target.closest("[data-cancel-request]");
    if (!cancel || !activeAccount) return;
    const request = requestService.getForStudent(cancel.dataset.cancelRequest, activeAccount.accountNumber);
    if (!request || !requestService.canStudentCancel(request.status)) return;
    activeRequestId = request.id;
    requestCancelDocument.textContent = `${request.documentType} (${request.id})`;
    requestCancelForm.reset();
    requestCancelStatus.textContent = "";
    requestCancelStatus.classList.remove("is-error");
    requestCancelReason.setCustomValidity("");
    requestCancelDialog.showModal();
    requestCancelReason.focus();
  });

  requestList.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-correction-form]");
    if (!form || !activeAccount) return;
    event.preventDefault();
    const input = form.querySelector("textarea");
    const note = input.value.trim();
    if (!note) {
      input.setCustomValidity("Describe the correction before resubmitting.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    try {
      requestService.studentResubmit(form.dataset.requestId, activeAccount, note);
      setRequestFeedback("Corrections submitted. Your request is back in Pending Review.");
      renderRequests();
      document.querySelector("#requests-title").focus({ preventScroll: true });
    } catch (error) {
      setRequestFeedback(error.message, true);
      input.focus();
    }
  });

  requestCancelReason.addEventListener("input", () => {
    requestCancelReason.setCustomValidity("");
    requestCancelStatus.textContent = "";
    requestCancelStatus.classList.remove("is-error");
  });

  requestCancelForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeAccount || !activeRequestId) return;
    const reason = requestCancelReason.value.trim();
    if (!reason) {
      requestCancelReason.setCustomValidity("Enter a reason before cancelling this request.");
      requestCancelReason.reportValidity();
      return;
    }
    requestCancelSubmit.disabled = true;
    try {
      requestService.studentCancel(activeRequestId, activeAccount, reason);
      requestCancelDialog.close();
      setRequestFeedback("Request cancelled. The record remains in your request history.");
      renderRequests();
      document.querySelector("#requests-title").focus({ preventScroll: true });
    } catch (error) {
      requestCancelStatus.textContent = error.message;
      requestCancelStatus.classList.add("is-error");
    } finally {
      requestCancelSubmit.disabled = false;
    }
  });

  requestCancelDialog.addEventListener("close", () => {
    activeRequestId = "";
    requestCancelForm.reset();
    requestCancelStatus.textContent = "";
    requestCancelStatus.classList.remove("is-error");
    requestCancelReason.setCustomValidity("");
  });

  function assistantAnswer(question) {
    return window.PortalFAQService.answer(question);
  }
  document.addEventListener("portal:faqschanged", () => { if (assistantDialog.open && activeAccount?.role === "student") document.querySelector("#assistant-answer").textContent = assistantAnswer(document.querySelector("#assistant-question-text").textContent); });

  function askAssistant(question) {
    const query = (question || "").trim();
    if (!query) return;
    const questionText = document.querySelector("#assistant-question-text");
    const answerText = document.querySelector("#assistant-answer");
    questionText.textContent = query;
    answerText.textContent = assistantAnswer(query);
    assistantDialog.showModal();
    // Student-only AI layer: upgrade the instant FAQ answer when a provider is configured.
    if (activeAccount?.role === "student" && window.PortalAIService) {
      window.PortalAIService.answer(query)
        .then((answer) => { if (typeof answer === "string" && answer.length > 0 && assistantDialog.open) answerText.textContent = answer; })
        .catch((error) => console.debug("AI service unavailable, keeping FAQ answer:", error.message));
    }
  }

  document.querySelector("#assistant-search").addEventListener("submit", (event) => {
    event.preventDefault();
    askAssistant(document.querySelector("#assistant-question").value);
  });
  document.querySelectorAll("[data-assistant]").forEach((button) => {
    button.addEventListener("click", () => askAssistant(button.dataset.assistant));
  });
  document.querySelector("#assistant-services").addEventListener("click", () => {
    assistantDialog.close();
    navigate("services");
  });

  document.addEventListener("portal:requestschanged", () => {
    if (activeAccount?.role === "student") renderRequests();
  });

  document.addEventListener("portal:appointmentschanged", () => {
    if (activeAccount?.role === "student") renderRequests();
  });

  window.PortalProfile = Object.freeze({
    snapshot: profileSnapshot,
    update(values) {
      if (!activeAccount) return { valid: false, message: "Sign in to edit your account." };
      const previousMessage = profileMessage.textContent;
      const previousError = profileStatus.classList.contains("is-error");
      const previous = profileInputs.map((input) => input.value);
      profileInputs.forEach((input) => {
        if (typeof values[input.name] === "string") input.value = values[input.name];
      });
      if (saveProfile()) return { valid: true, ...profileSnapshot() };
      const invalidField = profileInputs.find((input) => input.getAttribute("aria-invalid") === "true")?.name;
      const message = profileMessage.textContent;
      profileInputs.forEach((input, index) => { input.value = previous[index]; });
      validateProfile();
      setProfileStatus(previousMessage, previousError);
      return { valid: false, invalidField, message };
    },
  });

  window.PortalRequests = Object.freeze({ create: createRequest });
  window.PortalAssistant = Object.freeze({ answer: assistantAnswer });

  // Initialize chatbot for student role
  window.initializeChatbot = () => {
    const chatbotTrigger = document.querySelector('#chatbot-trigger');
    const chatbotDialog = document.querySelector('#chatbot-dialog');
    const requestService = window.PortalRequestService;
    const activeAccount = window.PortalProfile?.snapshot()?.account;
    
    if (!chatbotTrigger || !chatbotDialog || !activeAccount) return;
    
    // Chatbot options data - selection-based
    const chatbotOptionsData = [
      {
        id: 'status',
        label: 'Check Request Status',
        description: 'View the current status of your requests',
        action: () => {
          const requests = requestService.listForStudent(activeAccount.accountNumber);
          if (requests.length === 0) {
            document.getElementById('chatbot-question').textContent = 'Your Requests';
            document.getElementById('chatbot-answer').innerHTML = 'You have no requests yet. Would you like to submit a new request?';
            chatbotDialog.showModal();
            return;
          }
          const request = requests[0];
          document.getElementById('chatbot-question').textContent = `Request ${request.id} - ${request.documentType}`;
          document.getElementById('chatbot-answer').innerHTML = `<strong>Status:</strong> ${requestService.statusTone(request.status)}<br><small>${requestService.statusDescription(request.status)}</small><br><strong>Progress:</strong> ${requestService.isActive(request.status) ? 'Active' : 'Completed'}<br><small>Submitted: ${new Date(request.submittedAt).toLocaleDateString()}</small>`;
          chatbotDialog.showModal();
        }
      },
      {
        id: 'history',
        label: 'View Request History',
        description: 'See the lifecycle of your requests',
        action: () => {
          const requests = requestService.listForStudent(activeAccount.accountNumber);
          if (requests.length === 0) {
            document.getElementById('chatbot-question').textContent = 'Request History';
            document.getElementById('chatbot-answer').textContent = 'You have no request history yet.';
            chatbotDialog.showModal();
            return;
          }
          const request = requests[0];
          document.getElementById('chatbot-question').textContent = `Request ${request.id} - ${request.documentType}`;
          const historyActions = request.history ? request.history.map(h => `${h.action} → ${h.newStatus}`).slice(0, 3).join(' · ') : 'No history';
          document.getElementById('chatbot-answer').innerHTML = `<strong>Latest activity:</strong> ${historyActions}${request.history && request.history.length > 3 ? ` + ${request.history.length - 3} more updates` : ''}`;
          chatbotDialog.showModal();
        }
      },
      {
        id: 'new-request',
        label: 'Submit New Request',
        description: 'Create a new document request',
        action: () => {
          const serviceMap = {
            'gradeslip': '#/services/grade-slip',
            'registration': '#/services/registration-form', 
            'idprinting': '#/services/id-printing',
            'transcript': '#/services',
            'certificate': '#/services'
          };
          
          document.getElementById('chatbot-question').textContent = 'New Request';
          document.getElementById('chatbot-answer').innerHTML = 'Select a document type to request:<br><br>' +
            '<button class="chatbot-option-btn" data-option="gradeslip">Grade Slip</button>' +
            '<button class="chatbot-option-btn" data-option="registration">Registration Form</button>' +
            '<button class="chatbot-option-btn" data-option="idprinting">ID Printing</button>' +
            '<button class="chatbot-option-btn" data-option="transcript">Transcript of Records</button>' +
            '<button class="chatbot-option-btn" data-option="certificate">Certificate of Enrollment</button>';
          
          // Add click handlers for option buttons
          const optionButtons = document.querySelectorAll('.chatbot-option-btn');
          optionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              const option = btn.dataset.option;
              const hash = serviceMap[option] || '#/services';
              window.location.hash = hash;
              chatbotDialog.close();
            });
          });
          
          chatbotDialog.showModal();
        }
      },
      {
        id: 'cancel',
        label: 'Cancel Request',
        description: 'Cancel a pending request',
        action: () => {
          const requests = requestService.listForStudent(activeAccount.accountNumber);
          const activeRequests = requests.filter(r => requestService.isActive(r.status));
          if (activeRequests.length === 0) {
            document.getElementById('chatbot-question').textContent = 'Cancel Request';
            document.getElementById('chatbot-answer').textContent = 'You do not have any active requests that can be cancelled.';
            chatbotDialog.showModal();
            return;
          }
          document.getElementById('chatbot-question').textContent = 'Cancel Request';
          document.getElementById('chatbot-answer').innerHTML = `Which request would you like to cancel?<br><br>${activeRequests.map(r => `<button class="chatbot-option-btn" data-request="${r.id}">${r.documentType} (${r.id})</button>`).join('')}`;
          
          const optionButtons = document.querySelectorAll('.chatbot-option-btn[data-request]');
          optionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              const requestId = btn.dataset.request;
              document.getElementById('chatbot-question').textContent = 'Cancel Request';
              document.getElementById('chatbot-answer').innerHTML = `Enter reason for cancelling request ${requestId}:<br><br><textarea id="cancel-reason" rows="3" style="width:100%; padding: 8px; border: 1px solid var(--requests-line); border-radius: 8px; background: var(--requests-panel); color: var(--requests-ink);" required></textarea><br><button class="primary-button" id="confirm-cancel">Cancel Request</button>`;
              
              const confirmBtn = document.getElementById('confirm-cancel');
              const originalAction = confirmBtn.onclick;
              confirmBtn.onclick = () => {
                const reason = document.getElementById('cancel-reason').value.trim();
                if (reason) {
                  try {
                    requestService.studentCancel(requestId, activeAccount, reason);
                    document.getElementById('chatbot-question').textContent = 'Request Cancelled';
                    document.getElementById('chatbot-answer').textContent = 'Your request has been cancelled. The record remains in your history.';
                    chatbotDialog.close();
                    if (typeof renderRequests === 'function') renderRequests();
                  } catch (e) {
                    document.getElementById('chatbot-answer').textContent = `Error: ${e.message}`;
                  }
                }
              };
              chatbotDialog.showModal();
            });
          });
          chatbotDialog.showModal();
        }
      }
    ];
    
    // Render chatbot options
    const chatbotOptions = document.getElementById('chatbot-options');
    const chatbotConversation = document.getElementById('chatbot-conversation');
    
    function renderOptions() {
      chatbotOptions.replaceChildren();
      chatbotConversation.style.display = 'none';
      chatbotOptions.style.display = 'grid';
      
      chatbotOptionsData.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'chatbot-option-btn';
        btn.textContent = option.label;
        btn.dataset.id = option.id;
        btn.addEventListener('click', () => option.action());
        chatbotOptions.append(btn);
      });
    }
    
    // Event listeners
    chatbotTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      renderOptions();
      chatbotDialog.showModal();
    });
    
    // Close dialog on overlay click
    chatbotDialog.addEventListener('click', (e) => {
      if (e.target === chatbotDialog || e.target.dataset.closeDialog) {
        chatbotDialog.close();
      }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chatbotDialog.open) {
        chatbotDialog.close();
      }
    });
    
    // Initial render
    renderOptions();
  };
  
  // Initialize chatbot for students
  if (activeAccount?.role === "student") {
    initializeChatbot();
  }

  // app.js now restores Supabase sessions after both dashboards mount.
};
