"use strict";

window.initializeStaffDashboard = () => {
  const accounts = window.PortalAccounts;
  const accountService = window.PortalStaffAccountService;
  const requestService = window.PortalRequestService;
  const appointmentService = window.PortalAppointmentService;
  const routes = window.PortalStaffRoutes;
  const loginScreen = document.querySelector("#login-screen");
  const staffScreen = document.querySelector("#staff-screen");
  const staffMain = document.querySelector("#staff-main");
  const topbarTitle = document.querySelector("#staff-topbar-title");
  const sidebar = document.querySelector("#staff-sidebar");
  const sidebarToggle = document.querySelector("#staff-sidebar-toggle");
  const sidebarOverlay = document.querySelector("#staff-sidebar-overlay");
  const accountDropdown = document.querySelector("#staff-account-dropdown");
  const accountToggle = document.querySelector("#staff-account-toggle");
  const accountOptions = document.querySelector("#staff-account-options");
  const mobileNavigation = window.matchMedia("(max-width: 700px)");
  const notice = document.querySelector("#staff-notice");
  const themeToggle = document.querySelector("#staff-theme-toggle");
  const themeIcon = document.querySelector("#staff-theme-toggle-icon");
  const notificationButton = document.querySelector("#staff-notification-button");
  const notificationCount = document.querySelector("#staff-notification-count");
  const navBadge = document.querySelector("#staff-nav-badge");
  const staffProfileForm = document.querySelector("#staff-profile-form");
  const staffProfileInputs = [...staffProfileForm.querySelectorAll("[data-staff-editable]")];
  const staffProfileMessage = document.querySelector("#staff-profile-message");
  const staffProfileStatus = document.querySelector("#staff-profile-status");
  const staffProfileEditButton = document.querySelector("#staff-profile-edit-button");
  const staffProfileEditLabel = document.querySelector("#staff-profile-edit-label");
  const staffProfileEditIcon = document.querySelector("#staff-profile-edit-icon");
  const staffSettingsTabs = [...document.querySelectorAll("[data-staff-settings-tab]")];
  const staffSettingsPanels = [...document.querySelectorAll("[data-staff-settings-panel]")];
  const staffSaveStatus = document.querySelector("#staff-save-status");
  const staffSaveMessage = document.querySelector("#staff-save-message");
  const staffPasswordForm = document.querySelector("#staff-change-password-form");
  const staffPasswordInputs = [...staffPasswordForm.querySelectorAll("input")];
  const staffPasswordToggles = [...staffPasswordForm.querySelectorAll("[data-staff-password-toggle]")];
  const staffPasswordStatus = document.querySelector("#staff-password-status");
  const staffNotificationForm = document.querySelector("#staff-notification-form");
  const staffNotificationInputs = [...staffNotificationForm.querySelectorAll("input[name]")];
  const staffSessionForm = document.querySelector("#staff-session-form");
  const staffSessionInput = staffSessionForm.elements.rememberSession;

  const pageTitles = Object.freeze({
    "staff-dashboard": "Staff Workspace",
    "staff-requests": "Request Management",
    "staff-appointments": "Appointment Management",
    "staff-document-processing": "Document Processing & Release",
    "staff-records": "Student Records Management",
    "staff-announcements": "Announcements Management",
    "staff-reports": "Reports & Analytics",
    "staff-help-support": "Help & Support Management",
    "staff-profile": "My Staff Profile",
    "staff-settings": "Account Settings",
  });
  const defaultPreferences = accountService.DEFAULTS;

  let activeAccount = null;
  let staffProfile = null;
  let preferences = { ...defaultPreferences };
  let acceptedStaffHash = "";
  let pendingRequestOpenId = "";
  let profileEditing = false;
  let profileRevision = 0;
  let profileSaving = false;
  let noticeTimer;
  let desktopSidebarOpen = true;
  let mobileSidebarOpen = false;
  let passwordPending = false;

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  }

  function notify(message) {
    window.clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 4200);
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function formatTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return `${formatDate(date)} · ${formatTime(date)}`;
  }

  function initials(name) {
    return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST";
  }

  function loadPreferences(account) {
    try { preferences = accountService.preferences(); }
    catch (error) { preferences = { ...defaultPreferences }; setStaffSettingsStatus(error.message, true); }
    applyTheme();
    syncNotificationPreferences();
    syncNotificationUi();
  }

  function savePreferences(changes) {
    if (!activeAccount) return false;
    try { preferences = accountService.savePreferences(changes); applyTheme(); syncNotificationPreferences(); syncNotificationUi(); setStaffSettingsStatus("Preferences saved in this browser."); return true; }
    catch (error) { syncNotificationPreferences(); applyTheme(); setStaffSettingsStatus(error.message, true); return false; }
  }

  function applyTheme() {
    const dark = Boolean(preferences.darkMode);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
    themeIcon.setAttribute("href", dark ? "#icon-sun" : "#icon-moon");
    document.querySelector("#staff-theme-preference").value = dark ? "dark" : "light";
  }

  function syncNotificationPreferences() {
    staffNotificationInputs.forEach((input) => {
      input.checked = Boolean(preferences[input.name]);
    });
    staffSessionInput.checked = Boolean(preferences.rememberSession);
  }

  function syncNotificationUi() {
    const summary = requestService.summary(requestService.listAll());
    const attention = summary.pending + summary.correction;
    const documentBadge = document.querySelector("#staff-document-badge");
    const documentAttention = summary[requestService.STATUS.APPROVED] + summary.ready;
    documentBadge.textContent = String(documentAttention);
    documentBadge.hidden = !preferences.processingAlerts || documentAttention === 0;
    navBadge.textContent = String(attention);
    navBadge.hidden = attention === 0;
    const notificationTotal = window.PortalStaffContext?.current() && window.PortalNotifications ? window.PortalNotifications.visible(window.PortalNotifications.list(), preferences).filter((notice) => notice.unread).length : preferences.requestAlerts ? attention : 0;
    notificationCount.textContent = String(notificationTotal);
    notificationCount.hidden = notificationTotal === 0;
    notificationButton.setAttribute("aria-label", `Notifications, ${notificationTotal} unread or requiring attention`);
    document.dispatchEvent(new CustomEvent("portal:staffnotificationpreferences", { detail: { enabled: preferences.requestAlerts } }));
  }

  function syncIdentity() {
    if (!activeAccount) return;
    const name = staffProfile?.fullName || activeAccount.fullName;
    const position = activeAccount.position || "Not provided";
    const department = activeAccount.department || "Not provided";
    const firstName = name.trim().split(/\s+/)[0] || "Staff";
    document.querySelectorAll("[data-staff-name]").forEach((element) => { element.textContent = name; });
    document.querySelectorAll("[data-staff-first-name]").forEach((element) => { element.textContent = firstName; });
    document.querySelectorAll("[data-staff-position]").forEach((element) => { element.textContent = position; });
    document.querySelectorAll("[data-staff-department]").forEach((element) => { element.textContent = department; });
    document.querySelectorAll("[data-staff-role]").forEach((element) => { element.textContent = "Staff"; });
    document.querySelectorAll("[data-staff-employee-number]").forEach((element) => { element.textContent = activeAccount.accountNumber; });
    document.querySelectorAll("[data-staff-initials]").forEach((element) => { element.textContent = initials(name); });
    document.querySelectorAll("[data-staff-value]").forEach((element) => {
      const key = element.dataset.staffValue;
      const value = key === "employeeNumber" ? activeAccount.accountNumber : staffProfile?.[key] ?? activeAccount[key];
      element.textContent = value && String(value).trim() ? value : "Not provided";
    });
  }

  function loadStaffProfile(account) {
    try {
      const saved = accountService.snapshot(); staffProfile = saved.profile; profileRevision = saved.revision;
      setText("#staff-profile-last-saved", saved.updatedAt ? `Last browser profile save: ${formatDateTime(saved.updatedAt)}. This is not a secure audit history.` : "No saved profile timestamp available.");
      staffProfileEditButton.disabled = false;
      setStaffProfileStatus("Read-only profile. Choose Edit Profile to change display name or contact number.");
    } catch (error) { staffProfile = { ...account, legalName: account.fullName, displayName: "" }; staffProfileEditButton.disabled = true; setStaffProfileStatus(error.message, true); }
    syncStaffProfileForm();
    syncIdentity();
    setStaffProfileEditing(false);
  }

  function syncStaffProfileForm() {
    if (!activeAccount) return;
    staffProfileInputs.forEach((input) => {
      input.value = staffProfile[input.name] || "";
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    staffProfileForm.elements.employeeNumber.value = activeAccount.accountNumber;
    staffProfileForm.elements.legalName.value = activeAccount.fullName || "";
    staffProfileForm.elements.email.value = activeAccount.email || "";
  }

  function setStaffProfileStatus(message, error = false) {
    staffProfileMessage.textContent = message;
    staffProfileStatus.classList.toggle("is-error", error);
  }

  function validateStaffProfile() {
    let firstInvalid = null;
    staffProfileInputs.forEach((input) => {
      input.setCustomValidity("");
      if (input.required && !input.value.trim()) input.setCustomValidity("This field is required.");
      if (input.value.length > input.maxLength) input.setCustomValidity(`Use at most ${input.maxLength} characters.`);
      if (input.name === "phoneNumber" && input.value.trim() && (!/^[+\d() .-]+$/.test(input.value) || input.value.replace(/\D/g, "").length < 7)) {
        input.setCustomValidity("Please enter a valid phone number.");
      }
      const valid = input.checkValidity();
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  function saveStaffProfile() {
    if (!activeAccount) return false;
    const invalid = validateStaffProfile();
    if (invalid) {
      setStaffProfileStatus("Enter valid staff information to save your changes.", true);
      return false;
    }
    const values = Object.fromEntries(staffProfileInputs.map((input) => [input.name, input.value.trim()]));
    profileSaving = true; document.querySelector("#staff-profile-save").disabled = true;
    try {
      const saved = accountService.saveProfile(values, profileRevision); staffProfile = saved.profile; profileRevision = saved.revision;
      syncIdentity(); syncStaffProfileForm(); setText("#staff-profile-last-saved", `Last browser profile save: ${formatDateTime(saved.updatedAt)}. This is not a secure audit history.`); setStaffProfileStatus("Profile changes saved in this browser.");
      return true;
    } catch (error) { setStaffProfileStatus(error.message, true); return false; }
    finally { profileSaving = false; document.querySelector("#staff-profile-save").disabled = false; }
  }

  function setStaffProfileEditing(editing) {
    profileEditing = editing;
    staffProfileInputs.forEach((input) => { input.readOnly = !editing; });
    staffProfileEditButton.setAttribute("aria-pressed", String(editing));
    staffProfileEditButton.hidden = editing;
    document.querySelector("#staff-profile-edit-actions").hidden = !editing;
    const label = "Edit staff profile information";
    staffProfileEditButton.setAttribute("aria-label", label);
    staffProfileEditButton.title = label;
    staffProfileEditLabel.textContent = "Edit Profile";
    staffProfileEditIcon.setAttribute("href", "#icon-pencil");
  }

  function finishStaffProfileEditing() {
    if (!saveStaffProfile()) {
      staffProfileInputs.find((input) => input.getAttribute("aria-invalid") === "true")?.focus();
      return;
    }
    setStaffProfileEditing(false);
    staffProfileEditButton.focus();
  }

  function createStatusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `staff-status staff-status-${requestService.statusTone(status)}`;
    badge.textContent = status;
    return badge;
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function createStudentCell(request) {
    const cell = document.createElement("td");
    cell.className = "staff-student-cell";
    const name = document.createElement("strong");
    name.textContent = request.studentName;
    const number = document.createElement("small");
    number.textContent = request.studentNumber;
    cell.append(name, number);
    return cell;
  }

  function createViewButton(label, handler, accessibleLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "staff-table-action";
    button.textContent = label;
    if (accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
    button.addEventListener("click", handler);
    return button;
  }

  function renderRequestStats() {
    const summary = requestService.summary(requestService.listAll());
    setText("#staff-stat-pending", summary.pending);
    setText("#staff-stat-processing", summary.processing);
    setText("#staff-stat-ready", summary.ready);
    setText("#staff-stat-released", summary.released);
    syncNotificationUi();
  }

  function renderRecentRequests() {
    const body = document.querySelector("#staff-recent-requests");
    const recent = requestService.listAll().slice(0, 5);
    body.replaceChildren();
    recent.forEach((request) => {
      const row = document.createElement("tr");
      const reference = document.createElement("td");
      reference.className = "staff-ref";
      reference.textContent = request.id;
      const submitted = document.createElement("td");
      submitted.textContent = formatDate(request.submittedAt);
      const status = document.createElement("td");
      status.append(createStatusBadge(request.status));
      const action = document.createElement("td");
      action.className = "staff-table-action-cell";
      action.append(createViewButton("View", () => requestDetailsFromAnywhere(request.id), `View details for ${request.id}`));
      row.append(reference, createStudentCell(request), createCell(request.documentType), submitted, status, action);
      body.append(row);
    });
    document.querySelector("#staff-recent-empty").hidden = recent.length > 0;
  }

  function renderServiceVolume() {
    const container = document.querySelector("#staff-service-volume");
    const totals = new Map();
    requestService.listAll().forEach((request) => {
      totals.set(request.documentType, (totals.get(request.documentType) || 0) + 1);
    });
    const entries = [...totals.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5);
    container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "staff-empty";
      empty.textContent = "Service volume will appear once requests are available.";
      container.append(empty);
      return;
    }
    const maximum = Math.max(...entries.map(([, count]) => count));
    entries.forEach(([service, count]) => {
      const item = document.createElement("article");
      item.className = "staff-volume-item";
      const header = document.createElement("header");
      const name = document.createElement("strong");
      name.textContent = service;
      const total = document.createElement("span");
      total.textContent = `${count} request${count === 1 ? "" : "s"}`;
      const track = document.createElement("div");
      track.className = "staff-volume-track";
      const fill = document.createElement("span");
      fill.className = "staff-volume-fill";
      fill.style.width = `${Math.round((count / maximum) * 100)}%`;
      track.append(fill);
      header.append(name, total);
      item.append(header, track);
      container.append(item);
    });
  }

  function renderRequestViews() {
    renderRequestStats();
    renderRecentRequests();
    renderServiceVolume();
  }

  function requestDetailsFromAnywhere(id) {
    if (!requestService.get(id)) return;
    if (staffScreen.dataset.currentPage === "staff-requests") {
      document.dispatchEvent(new CustomEvent("portal:staffrequestopen", { detail: id }));
      return;
    }
    pendingRequestOpenId = id;
    navigate("staff-requests");
  }

  function setStaffSettingsStatus(message, error = false) {
    staffSaveMessage.textContent = message;
    staffSaveStatus.classList.toggle("is-error", error);
  }

  function syncStaffSettings() {
    syncIdentity();
    syncNotificationPreferences();
    staffSessionInput.checked = Boolean(preferences.rememberSession);
    const session = accounts.sessionInfo();
    setText("#staff-session-signed-in", session?.signedInAt ? formatDateTime(session.signedInAt) : "Not available");
    setText("#staff-session-expires", session?.expiresAt ? formatDateTime(session.expiresAt) : "Not available");
    setText("#staff-session-persistence", session?.persistent ? "Managed by Supabase Auth" : "Not signed in");
    setText("#staff-session-explanation", "Supabase Auth manages session persistence and token refresh. Sign out to clear this browser’s session; the old demo-session preference does not control Supabase.");
    setText("#staff-password-changed-at", activeAccount?.passwordChangedAt ? formatDateTime(activeAccount.passwordChangedAt) : "Not recorded");
    const container = document.querySelector("#staff-account-capabilities"); container.replaceChildren();
    [["Announcements", () => window.PortalAnnouncementService.capabilities()], ["Reports", () => window.PortalReportService.capabilities()], ["Help & Support", () => window.PortalSupportService.capabilities()]].forEach(([label, read]) => {
      const section = document.createElement("section"); const heading = document.createElement("h5"); heading.textContent = label; section.append(heading);
      try { const list = document.createElement("ul"); const capabilities = read(); if (!capabilities.length) { const item = document.createElement("li"); item.textContent = "No capabilities configured"; list.append(item); } capabilities.forEach((value) => { const item = document.createElement("li"); item.textContent = value.replace(/([a-z])([A-Z])/g, "$1 $2"); list.append(item); }); section.append(list); }
      catch { const info = document.createElement("p"); info.textContent = "Capability source unavailable"; section.append(info); }
      container.append(section);
    });
  }

  function selectStaffSettingsTab(name, focus = false) {
    if (!staffSettingsTabs.some((tab) => tab.dataset.staffSettingsTab === name)) return;
    staffSettingsTabs.forEach((tab) => {
      const active = tab.dataset.staffSettingsTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    window.PortalMotion.swap(staffSettingsPanels, staffSettingsPanels.find((panel) => panel.dataset.staffSettingsPanel === name));
    if (name !== "password") resetStaffPasswordForm();
    if (name === "account") syncStaffSettings();
    setStaffSettingsStatus(name === "password" ? "Your staff password changes are saved in this browser." : "Preferences save automatically in this browser.");
  }

  function resetStaffPasswordForm() {
    staffPasswordForm.reset();
    staffPasswordToggles.forEach((button) => setStaffPasswordVisibility(button, false));
    staffPasswordInputs.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    staffPasswordStatus.textContent = "";
    staffPasswordStatus.classList.remove("is-error");
  }

  function setStaffPasswordVisibility(button, visible) {
    document.getElementById(button.dataset.staffPasswordToggle).type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    const label = button.getAttribute("aria-label").replace(/^(Show|Hide) /, "");
    button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
  }

  function closeNavigation() {
    mobileSidebarOpen = false;
    syncNavigation();
  }

  function syncNavigation() {
    const mobile = mobileNavigation.matches;
    const open = mobile ? mobileSidebarOpen : desktopSidebarOpen;
    staffScreen.classList.toggle("sidebar-open", mobile && open);
    staffScreen.classList.toggle("sidebar-collapsed", !open);
    const label = open ? "Collapse navigation" : "Expand navigation";
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
    sidebarOverlay.hidden = !mobile || !open;
  }

  function closeAccountDropdown() {
    window.PortalMotion.swap([accountOptions], null);
    accountToggle.setAttribute("aria-expanded", "false");
  }

  function showPage(page, focus = true) {
    if (!activeAccount || !accounts.isSessionValid(activeAccount)) return false;
    if (!accountService.canAccess(page)) { page = "staff-dashboard"; window.history.replaceState(null, "", routes[page].hash); notify("Your account is not authorized to view that staff module."); }
    if (!document.dispatchEvent(new CustomEvent("portal:staffbeforenavigate", { cancelable: true, detail: { page } }))) return false;
    const view = staffMain.querySelector(`[data-view="${page}"]`);
    if (!view) return;
    staffScreen.dataset.currentPage = page;
    window.PortalMotion.swap(staffMain.querySelectorAll("[data-view]"), view);
    staffScreen.querySelectorAll(".staff-nav [data-page], .staff-account-options [data-page]").forEach((button) => {
      const active = button.dataset.page === page;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    closeNavigation();
    closeAccountDropdown();
    staffScreen.querySelectorAll(".portal-dialog[open]").forEach((dialog) => dialog.close());
    topbarTitle.textContent = pageTitles[page] || "Staff Workspace";
    document.title = `RTU Pasig Staff | ${view.querySelector("h2").textContent.trim()}`;
    if (page === "staff-dashboard") renderDashboard();
    if (page === "staff-settings") syncStaffSettings();
    if (page !== "staff-settings") resetStaffPasswordForm();
    if (focus) view.querySelector("h2").focus();
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("portal:staffpagechange", { detail: page }));
    return true;
  }

  function pageFromRoute() {
    if (/^#\/staff\/(?:student-records|records)(?:\/[^/]+)?$/.test(window.location.hash)) return "staff-records";
    return Object.keys(routes).find((page) => routes[page].hash === window.location.hash) || "staff-dashboard";
  }

  function renderRoute() {
    if (staffScreen.hidden) return;
    const page = pageFromRoute();
    if (page === "staff-records" && window.location.hash.startsWith("#/staff/records")) window.history.replaceState(null, "", window.location.hash.replace("#/staff/records", "#/staff/student-records"));
    else if (page !== "staff-records" && window.location.hash !== routes[page].hash) window.history.replaceState(null, "", routes[page].hash);
    if (showPage(page)) acceptedStaffHash = window.location.hash;
    else window.history.replaceState(null, "", acceptedStaffHash || routes[staffScreen.dataset.currentPage].hash);
  }

  function navigate(page, replace = false) {
    if (staffScreen.hidden || !Object.hasOwn(routes, page)) return;
    if (replace) {
      const keepStudentDetail = page === "staff-records" && /^#\/staff\/(?:student-records|records)\//.test(window.location.hash);
      if (!keepStudentDetail) window.history.replaceState(null, "", routes[page].hash);
      renderRoute();
    } else if (window.location.hash === routes[page].hash) {
      renderRoute();
    } else {
      window.location.hash = routes[page].hash;
    }
  }

  window.PortalStaffContext = Object.freeze({
    openRequest(id) { if (activeAccount) requestDetailsFromAnywhere(id); },
    current() {
      return activeAccount && accounts.isSessionValid(activeAccount) ? { account: { ...activeAccount }, profile: { ...staffProfile } } : null;
    },
    consumeRequestIntent() {
      const id = pendingRequestOpenId;
      pendingRequestOpenId = "";
      return id;
    },
    navigate(page) {
      navigate(page);
    },
  });

  document.addEventListener("portal:requestschanged", () => {
    if (activeAccount) renderRequestViews();
  });
  document.addEventListener("portal:supportchanged", () => {
    if (!activeAccount) return;
    try { const support = window.PortalSupportService.summary(); setText("#staff-support-open-count", support.open + support.progress + support.waiting); } catch { setText("#staff-support-open-count", "N/A"); }
  });

  document.addEventListener("portal:appointmentschanged", () => {
    if (activeAccount) renderAppointmentSummary();
  });

  function renderAppointmentSummary() {
    const counts = appointmentService.summary();
    setText("#staff-dashboard-today-appointments", counts.today);
    const container = document.querySelector("#staff-dashboard-upcoming-appointments");
    const emptyState = document.querySelector("#staff-dashboard-appointments-empty");
    const upcoming = appointmentService.listAll().filter((appointment) => appointment.date >= appointmentService.manilaDate() && [appointmentService.STATUS.PENDING, appointmentService.STATUS.SCHEDULED, appointmentService.STATUS.CHECKED_IN].includes(appointment.status)).slice(0, 4);
    container.replaceChildren();
    upcoming.forEach((appointment) => {
      const item = document.createElement("article");
      item.className = "staff-record-request";
      const copy = document.createElement("div");
      const reference = document.createElement("strong");
      reference.textContent = appointment.id;
      const description = document.createElement("span");
      description.textContent = appointment.studentName + " · " + appointment.serviceType + " · " + appointment.date + " " + appointment.start;
      copy.append(reference, description);
      const actions = document.createElement("div");
      actions.className = "staff-record-request-actions";
      actions.append(createStatusBadge(appointment.status));
      item.append(copy, actions);
      container.append(item);
    });
    emptyState.hidden = upcoming.length > 0;
  }

  function renderDashboard() {
    setText("#staff-today", new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()));
    renderRequestStats();
    renderRecentRequests();
    renderServiceVolume();
    renderAppointmentSummary();
  }

  function openStaffDashboard(account) {
    activeAccount = account;
    loadStaffProfile(account);
    loadPreferences(account);
    syncStaffSettings();
    desktopSidebarOpen = true;
    mobileSidebarOpen = false;
    syncNavigation();
    closeAccountDropdown();
    loginScreen.hidden = true;
    staffScreen.hidden = false;
    selectStaffSettingsTab("account");
    renderDashboard();
    try { const support = window.PortalSupportService.summary(); setText("#staff-support-open-count", support.open + support.progress + support.waiting); } catch { setText("#staff-support-open-count", "N/A"); }
    navigate(pageFromRoute(), true);
    document.dispatchEvent(new CustomEvent("portal:staffaccountchange", { detail: { account: { ...account }, profile: { ...staffProfile } } }));
  }

  async function logOutStaff(forced = false, message = "") {
    if (!forced && !document.dispatchEvent(new CustomEvent("portal:staffbeforelogout", { cancelable: true }))) return;
    if (!forced) document.dispatchEvent(new Event("portal:beforelogout"));
    try { await accounts.clearSession(); }
    catch (error) {
      window.alert(`Sign-out failed: ${error.message}`);
      return;
    }
    activeAccount = null;
    staffProfile = null;
    setStaffProfileEditing(false);
    staffScreen.querySelectorAll(".portal-dialog[open]").forEach((dialog) => dialog.close());
    staffScreen.hidden = true;
    loginScreen.hidden = false;
    closeNavigation();
    closeAccountDropdown();
    preferences = { ...defaultPreferences };
    applyTheme();
    resetStaffPasswordForm();
    staffProfileForm.reset(); document.querySelector("#staff-account-capabilities").replaceChildren();
    document.querySelectorAll("[data-staff-name]").forEach((element) => { element.textContent = "Staff member"; });
    document.querySelectorAll("[data-staff-value]").forEach((element) => { element.textContent = "Not provided"; });
    pendingRequestOpenId = "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    document.title = "RTU Pasig | Academic Services Portal";
    document.querySelector("#login-form").reset();
    document.querySelector("#login-status").textContent = "";
    document.querySelector("#account-number").focus();
    window.scrollTo(0, 0);
    document.dispatchEvent(new Event("portal:logout"));
    document.dispatchEvent(new CustomEvent("portal:loginrequired", { detail: { role: "staff", message } }));
    window.PortalMotion.enter(loginScreen.querySelector(".login-content"));
  }

  themeToggle.addEventListener("click", () => {
    if (!activeAccount) return;
    savePreferences({ darkMode: !preferences.darkMode });
  });

  notificationButton.addEventListener("click", () => navigate("staff-requests"));

  sidebarToggle.addEventListener("click", () => {
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
  mobileNavigation.addEventListener("change", closeNavigation);

  staffScreen.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.matches("a") && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
      event.preventDefault();
      if (sidebar.contains(button) && mobileNavigation.matches) {
        mobileSidebarOpen = false;
        syncNavigation();
        document.dispatchEvent(new Event("portal:layoutchange"));
      }
      navigate(button.dataset.page);
    });
  });

  accountToggle.addEventListener("click", () => {
    const open = accountOptions.hidden;
    closeNavigation();
    window.PortalMotion.swap([accountOptions], open ? accountOptions : null);
    accountToggle.setAttribute("aria-expanded", String(open));
  });
  accountToggle.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault(); closeNavigation(); window.PortalMotion.swap([accountOptions], accountOptions); accountToggle.setAttribute("aria-expanded", "true");
    const options = [...accountOptions.querySelectorAll("a, button")]; (event.key === "ArrowUp" ? options.at(-1) : options[0])?.focus();
  });
  accountOptions.addEventListener("keydown", (event) => {
    const options = [...accountOptions.querySelectorAll("a, button")]; const index = options.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowUp" ? (index - 1 + options.length) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); options[next].focus(); }
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
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!accountOptions.hidden) {
      closeAccountDropdown();
      accountToggle.focus();
    } else if (staffScreen.classList.contains("sidebar-open")) {
      closeNavigation();
      sidebarToggle.focus();
    }
  });
  window.addEventListener("hashchange", renderRoute);

  document.querySelector("#staff-logout-button").addEventListener("click", () => logOutStaff());
  document.querySelector("#staff-settings-logout-button").addEventListener("click", () => logOutStaff());
  document.addEventListener("portal:sessioninvalidated", (event) => { if (activeAccount && event.detail.role === "staff" && !accounts.isSessionValid(activeAccount, false)) logOutStaff(true, event.detail.message); });

  document.querySelectorAll("[data-staff-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  staffProfileEditButton.addEventListener("click", () => {
    if (!activeAccount) return;
    if (!profileEditing) {
      setStaffProfileEditing(true);
      staffProfileInputs[0].focus();
    }
  });
  staffProfileInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (!profileEditing) return;
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      setStaffProfileStatus("Unsaved changes. Choose Save Changes or Cancel.");
    });
  });
  staffProfileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (profileEditing) finishStaffProfileEditing();
  });
  document.querySelector("#staff-profile-cancel").addEventListener("click", () => { if (activeAccount) loadStaffProfile(activeAccount); staffProfileEditButton.focus(); });
  function profileDirty() { return profileEditing && staffProfileInputs.some((input) => input.value.trim() !== String(staffProfile?.[input.name] || "")); }
  ["portal:staffbeforenavigate", "portal:staffbeforelogout"].forEach((name) => document.addEventListener(name, (event) => {
    if (profileDirty() && !window.confirm("Discard unsaved staff profile changes?")) { event.preventDefault(); return; }
    if (profileEditing && activeAccount) loadStaffProfile(activeAccount);
  }));
  window.addEventListener("beforeunload", (event) => { if (profileDirty()) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("portal:staffprofileupdated", () => {
    if (!activeAccount || profileSaving) return;
    if (profileEditing) setStaffProfileStatus("The saved profile changed in another view. Unsaved fields are kept; Cancel to reload the latest values.", true);
    else loadStaffProfile(activeAccount);
  });
  document.addEventListener("portal:staffpreferencesupdated", () => { if (activeAccount) { loadPreferences(activeAccount); syncStaffSettings(); } });
  document.querySelector("#staff-theme-preference").addEventListener("change", (event) => savePreferences({ darkMode: event.target.value === "dark" }));
  document.querySelector("#staff-notification-shortcut").addEventListener("click", () => selectStaffSettingsTab("notifications", true));

  staffSettingsTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectStaffSettingsTab(tab.dataset.staffSettingsTab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % staffSettingsTabs.length;
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index - 1 + staffSettingsTabs.length) % staffSettingsTabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = staffSettingsTabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectStaffSettingsTab(staffSettingsTabs[next].dataset.staffSettingsTab, true);
    });
  });

  staffPasswordToggles.forEach((button) => {
    button.addEventListener("click", () => setStaffPasswordVisibility(button, button.getAttribute("aria-pressed") !== "true"));
  });
  staffPasswordInputs.forEach((input) => {
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      staffPasswordStatus.textContent = "";
    });
  });
  staffPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeAccount || passwordPending) return;
    staffPasswordInputs.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      if (!input.value.trim()) input.setCustomValidity("Enter your password.");
    });
    const { currentPassword, newPassword, confirmPassword } = staffPasswordForm.elements;
    if (newPassword.value.length < accounts.PASSWORD_POLICY.minimumLength || newPassword.value.length > accounts.PASSWORD_POLICY.maximumLength) newPassword.setCustomValidity("Use 8–128 characters for your new password.");
    if (newPassword.value !== confirmPassword.value) confirmPassword.setCustomValidity("The new passwords do not match.");
    const invalid = staffPasswordInputs.find((input) => !input.checkValidity());
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      staffPasswordStatus.textContent = invalid.validationMessage;
      staffPasswordStatus.classList.add("is-error");
      invalid.focus();
      return;
    }
    const employeeNumber = activeAccount.accountNumber;
    const submitButton = staffPasswordForm.querySelector('[type="submit"]');
    passwordPending = true;
    submitButton.disabled = true;
    staffPasswordStatus.classList.remove("is-error");
    staffPasswordStatus.textContent = "Updating password…";
    try {
      await accounts.changePassword(employeeNumber, currentPassword.value, newPassword.value, "staff");
      if (activeAccount?.accountNumber !== employeeNumber) return;
      resetStaffPasswordForm();
      staffPasswordStatus.textContent = "Password updated. Use your new password the next time you sign in.";
      setStaffSettingsStatus("Password saved: Just now");
    } catch (error) {
      if (activeAccount?.accountNumber !== employeeNumber) return;
      staffPasswordStatus.textContent = error.message;
      staffPasswordStatus.classList.add("is-error");
      if (error.message.includes("current password")) {
        currentPassword.setAttribute("aria-invalid", "true");
        currentPassword.focus();
      }
    } finally {
      passwordPending = false;
      submitButton.disabled = false;
    }
  });

  staffNotificationForm.addEventListener("submit", (event) => event.preventDefault());
  staffNotificationForm.addEventListener("change", () => {
    if (!activeAccount) return;
    savePreferences(Object.fromEntries(staffNotificationInputs.map((input) => [input.name, input.checked])));
  });

  staffSessionForm.addEventListener("submit", (event) => event.preventDefault());
  staffSessionInput.addEventListener("change", () => {
    if (!activeAccount) return;
    if (savePreferences({ rememberSession: staffSessionInput.checked })) { syncStaffSettings(); setStaffSettingsStatus("Supabase Auth manages session persistence; this preference does not change it yet."); }
  });

  document.addEventListener("portal:login", (event) => {
    if (event.detail?.role !== "staff") return;
    const identity = accounts.saveSession(event.detail, { newLogin: true });
    openStaffDashboard(identity);
  });

  renderRequestViews();
  syncNotificationUi();
  syncNavigation();
  applyTheme();

  // app.js now restores Supabase sessions after both dashboards mount.
  window.setInterval(() => { if (activeAccount) accounts.isSessionValid(activeAccount); }, 15000);
};
