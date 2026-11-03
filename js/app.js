"use strict";

(() => {
  // Each hash route has one HTML view. Paths are relative to index.html.
  const studentRoutes = Object.freeze({
    dashboard: { hash: "#/dashboard", file: "pages/dashboard.html" },
    services: { hash: "#/services", file: "pages/services.html" },
    "grade-slip": { hash: "#/services/grade-slip", file: "pages/grade-slip.html" },
    "grade-slip-complete": { hash: "#/services/grade-slip/complete", file: "pages/grade-slip-complete.html" },
    "registration-form": { hash: "#/services/registration-form", file: "pages/registration-form.html" },
    "registration-form-complete": { hash: "#/services/registration-form/complete", file: "pages/registration-form-complete.html" },
    "id-printing": { hash: "#/services/id-printing", file: "pages/id-printing.html" },
    "id-printing-complete": { hash: "#/services/id-printing/complete", file: "pages/id-printing-complete.html" },
    requests: { hash: "#/my-request", file: "pages/my-request.html" },
    announcements: { hash: "#/announcements", file: "pages/announcements.html" },
    help: { hash: "#/help", file: "pages/help.html" },
    profile: { hash: "#/profile", file: "pages/profile.html" },
    settings: { hash: "#/settings", file: "pages/settings.html" },
  });
  const staffRoutes = Object.freeze({
    "staff-dashboard": { hash: "#/staff/dashboard", file: "pages/staff-dashboard.html" },
    "staff-requests": { hash: "#/staff/requests", file: "pages/staff-requests.html" },
    "staff-appointments": { hash: "#/staff/appointments", file: "pages/staff-appointments.html" },
    "staff-document-processing": { hash: "#/staff/document-processing", file: "pages/staff-document-processing.html" },
    "staff-records": { hash: "#/staff/student-records", file: "pages/staff-records.html" },
    "staff-announcements": { hash: "#/staff/announcements", file: "pages/staff-announcements.html" },
    "staff-reports": { hash: "#/staff/reports", file: "pages/staff-reports.html" },
    "staff-help-support": { hash: "#/staff/help-support", file: "pages/staff-help-support.html" },
    "staff-profile": { hash: "#/staff/profile", file: "pages/staff-profile.html" },
    "staff-settings": { hash: "#/staff/settings", file: "pages/staff-settings.html" },
  });
  const root = document.querySelector("#portal-root");
  window.PortalRoutes = studentRoutes;
  window.PortalStaffRoutes = staffRoutes;

  async function loadMarkup(file) {
    const response = await fetch(file, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status}).`);
    const markup = new DOMParser().parseFromString(await response.text(), "text/html");
    // Live Server injects a reload script at the fetched document's body boundary.
    // Only the entry page needs that script; imported views contain markup only.
    markup.querySelectorAll("script").forEach((script) => script.remove());
    const fragment = document.createDocumentFragment();
    fragment.append(...markup.body.childNodes);
    return fragment;
  }

  async function loadViews(routeMap) {
    return Promise.all(Object.entries(routeMap).map(async ([page, route]) => {
      const fragment = await loadMarkup(route.file);
      const view = fragment.firstElementChild;
      if (fragment.children.length !== 1 || view?.dataset.view !== page || !view.querySelector("h2")) {
        throw new Error(`The view in ${route.file} is invalid.`);
      }
      view.hidden = true;
      return fragment;
    }));
  }

  function showLoadError(error) {
    root.removeAttribute("aria-busy");
    const status = document.createElement("main");
    status.className = "app-status";
    const heading = document.createElement("h1");
    heading.textContent = "The portal could not load";
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = window.location.protocol === "file:"
      ? "Open this project with Live Server or run python -m http.server 5500, then visit http://localhost:5500."
      : `${error.message} Check your connection and try again.`;
    const retry = document.createElement("button");
    retry.className = "primary-button";
    retry.type = "button";
    retry.textContent = "Reload portal";
    retry.addEventListener("click", () => window.location.reload());
    status.append(heading, message, retry);
    root.replaceChildren(status);
  }

  async function initialize() {
    try {
      // Mount all views once before binding handlers. This preserves in-session
      // form state and request drafts while navigating between hash routes.
      const [login, icons, shell, staffShell, dialogs, supportDialogs, views, staffViews] = await Promise.all([
        loadMarkup("pages/login.html"),
        loadMarkup("components/icons.html"),
        loadMarkup("components/dashboard-shell.html"),
        loadMarkup("components/staff-shell.html"),
        loadMarkup("components/dialogs.html"),
        loadMarkup("components/support-dialogs.html"),
        loadViews(studentRoutes),
        loadViews(staffRoutes),
      ]);
      const main = shell.querySelector("#dashboard-main");
      const staffMain = staffShell.querySelector("#staff-main");
      const requiredComponents = [
        [shell, "#dashboard-main", "components/dashboard-shell.html"],
        [staffShell, "#staff-screen", "components/staff-shell.html"],
        [staffShell, "#staff-main", "components/staff-shell.html"],
        [login, "#login-form", "pages/login.html"],
        [dialogs, "#register-dialog", "components/dialogs.html"],
        [icons, "#icon-home", "components/icons.html"],
      ];
      requiredComponents.forEach(([fragment, selector, file]) => {
        if (!fragment.querySelector(selector)) throw new Error(`Missing ${selector} in ${file}.`);
      });
      views.forEach((view) => main.append(view));
      staffViews.forEach((view) => staffMain.append(view));
      root.replaceChildren(login, icons, shell, staffShell, dialogs, supportDialogs);
      window.PortalMotion.initialize();
      window.initializePortalLogin();
      window.initializePortalDashboard();
      window.initializePortalSettings();
      window.initializeStaffDashboard();
      window.initializeStaffRequests();
      window.initializeStaffAppointments();
      window.initializeStaffDocumentProcessing();
      window.initializeStaffStudentRecords();
      window.initializeStaffAnnouncements();
      window.initializeSupportUI();
      window.initializeStaffHelpSupport();
      window.initializeStudentHelp();
      window.initializeStudentAnnouncements();
      window.initializePortalNotifications();
      window.initializeStaffReports();
      window.initializeGradeSlip();
      window.initializeIdPrinting();
      window.initializeRegistrationForm();
      root.removeAttribute("aria-busy");
      document.dispatchEvent(new Event("portal:ready"));
      return true;
    } catch (error) {
      showLoadError(error);
      return false;
    }
  }

  window.PortalApp = Object.freeze({ ready: initialize() });
})();
