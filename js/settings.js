"use strict";

window.initializePortalSettings = () => {
  const profile = window.PortalProfile;
  const accounts = window.PortalAccounts;
  const accountForm = document.querySelector("#settings-account-form");
  const accountInputs = [...accountForm.querySelectorAll("input:not([name='studentNumber']), textarea")];
  const programField = document.querySelector("#settings-program");
  const editButton = document.querySelector("#settings-edit-button");
  const editLabel = document.querySelector("#settings-edit-label");
  const editIcon = document.querySelector("#settings-edit-icon");
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  const saveStatus = document.querySelector("#settings-save-status");
  const saveMessage = document.querySelector("#settings-save-message");
  const passwordForm = document.querySelector("#change-password-form");
  const passwordInputs = [...passwordForm.querySelectorAll("input")];
  const passwordToggles = [...passwordForm.querySelectorAll("[data-password-toggle]")];
  const passwordStatus = document.querySelector("#password-change-status");
  const preferenceForms = [...document.querySelectorAll(".settings-preferences")];
  const preferenceInputs = preferenceForms.flatMap((form) => [...form.querySelectorAll("input")]);
  const notice = document.querySelector("#portal-notice");
  const themeToggle = document.querySelector("#theme-toggle");
  const themeIcon = document.querySelector("#theme-toggle-icon");
  const defaults = { requestUpdates: true, announcementAlerts: true, deadlineReminders: true, assistantTips: true, rememberSession: true, darkMode: false };
  const compactMenu = window.matchMedia("(max-width: 800px)");
  let account = null;
  let preferences = { ...defaults };
  let selectedTab = "account";
  let editing = false;
  let saveTimer;
  let noticeTimer;
  let passwordPending = false;

  function setStatus(message, error = false) {
    saveMessage.textContent = message;
    saveStatus.classList.toggle("is-error", error);
  }

  function renderAccount(snapshot = profile.snapshot()) {
    Object.entries(snapshot.values).forEach(([name, value]) => {
      if (accountForm.elements[name]) accountForm.elements[name].value = value;
    });
    if (selectedTab === "account") setStatus(snapshot.message, snapshot.error);
    resizeProgram();
  }

  function resizeProgram() {
    programField.style.height = "auto";
    programField.style.height = `${programField.scrollHeight + 2}px`;
  }
  window.addEventListener("resize", resizeProgram);
  document.addEventListener("portal:layoutchange", resizeProgram);

  function setEditing(value) {
    editing = value;
    accountInputs.forEach((input) => { input.readOnly = !value; });
    editButton.setAttribute("aria-pressed", String(value));
    editLabel.textContent = value ? "Done" : "Edit Info";
    editIcon.setAttribute("href", value ? "#icon-check" : "#icon-pencil");
    resizeProgram();
  }

  function saveAccountEdits(finish = false) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!account || !editing) return;
    const values = Object.fromEntries(accountInputs.map((input) => [input.name, input.value.replace(/\r?\n/g, " ")]));
    const result = profile.update(values);
    accountInputs.forEach((input) => input.setAttribute("aria-invalid", String(!result.valid && result.invalidField === input.name)));
    setStatus(result.message, !result.valid || result.error);
    if (!result.valid) {
      if (finish) accountForm.elements[result.invalidField]?.focus();
      return;
    }
    if (finish) {
      setEditing(false);
      renderAccount();
      editButton.focus();
    }
  }

  editButton.addEventListener("click", () => {
    if (!account) return;
    if (editing) saveAccountEdits(true);
    else {
      renderAccount();
      setEditing(true);
      accountInputs[0].focus();
    }
  });
  accountInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (!editing) return;
      if (input === programField) resizeProgram();
      input.removeAttribute("aria-invalid");
      window.clearTimeout(saveTimer);
      setStatus("Saving changes…");
      saveTimer = window.setTimeout(() => saveAccountEdits(), 500);
    });
    input.addEventListener("change", () => saveAccountEdits());
  });
  accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAccountEdits(true);
  });

  function setPasswordVisibility(button, visible) {
    document.getElementById(button.dataset.passwordToggle).type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    const label = button.getAttribute("aria-label").replace(/^(Show|Hide) /, "");
    button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
  }

  passwordToggles.forEach((button) => {
    button.addEventListener("click", () => setPasswordVisibility(button, button.getAttribute("aria-pressed") !== "true"));
  });

  function resetPasswordForm() {
    passwordForm.reset();
    passwordToggles.forEach((button) => setPasswordVisibility(button, false));
    passwordInputs.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    passwordStatus.textContent = "";
    passwordStatus.classList.remove("is-error");
  }

  function selectTab(name, focus = false) {
    if (!tabs.some((tab) => tab.dataset.settingsTab === name)) return;
    if (selectedTab === "account" && name !== "account" && editing) {
      saveAccountEdits();
      setEditing(false);
      renderAccount();
    }
    selectedTab = name;
    tabs.forEach((tab) => {
      const active = tab.dataset.settingsTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    window.PortalMotion.swap(panels, panels.find((panel) => panel.dataset.settingsPanel === name));
    if (name !== "password") resetPasswordForm();
    if (name === "account") renderAccount();
    else setStatus(name === "password" ? "Your password changes are saved in this browser." : "Preferences save automatically in this browser.");
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next].dataset.settingsTab, true);
    });
  });
  function updateMenuOrientation() {
    document.querySelector(".settings-menu").setAttribute("aria-orientation", compactMenu.matches ? "horizontal" : "vertical");
  }
  compactMenu.addEventListener("change", updateMenuOrientation);
  updateMenuOrientation();

  function applyTheme(dark = Boolean(account && preferences.darkMode)) {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
    themeIcon.setAttribute("href", dark ? "#icon-sun" : "#icon-moon");
  }

  function applyPreferences() {
    applyTheme();
    preferenceInputs.forEach((input) => { input.checked = preferences[input.name]; });
    document.dispatchEvent(new CustomEvent("portal:announcementpreferences", { detail: { enabled: preferences.announcementAlerts } }));
    document.querySelector(".suggested-questions").hidden = !preferences.assistantTips;
    if (!preferences.requestUpdates) notice.hidden = true;
  }

  function loadAccount(snapshot) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    account = snapshot.account;
    setEditing(false);
    accountInputs.forEach((input) => input.removeAttribute("aria-invalid"));
    renderAccount(snapshot);
    preferences = { ...defaults };
    if (account) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(accounts.preferencesKey(account)));
        Object.keys(defaults).forEach((key) => {
          if ((!saved?.ownerRole || saved.ownerRole === "student") && typeof saved?.[key] === "boolean") preferences[key] = saved[key];
        });
      } catch {
        // Use this account's defaults if browser preferences cannot be read.
      }
    }
    applyPreferences();
    resetPasswordForm();
    selectTab("account");
  }

  function savePreferences() {
    try {
      const key = accounts.preferencesKey(account); const existing = JSON.parse(window.localStorage.getItem(key) || "{}");
      if (existing.ownerRole && existing.ownerRole !== "student") throw new Error("Account preference owner mismatch.");
      window.localStorage.setItem(key, JSON.stringify({ ...preferences, ownerRole: "student" }));
      setStatus("Auto-saved: Just now");
    } catch {
      setStatus("Preferences apply for this visit. Browser storage is unavailable.");
    }
    applyPreferences();
  }

  themeToggle.addEventListener("click", () => {
    if (!account) return;
    preferences.darkMode = !preferences.darkMode;
    savePreferences();
  });

  preferenceForms.forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("change", () => {
      if (!account) return;
      preferenceInputs.forEach((input) => { preferences[input.name] = input.checked; });
      savePreferences();
      accounts.setSessionPersistence(preferences.rememberSession, account);
    });
  });

  passwordInputs.forEach((input) => {
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      passwordStatus.textContent = "";
    });
  });
  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account || passwordPending) return;
    passwordInputs.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      if (!input.value.trim()) input.setCustomValidity("Enter your password.");
    });
    const { currentPassword, newPassword, confirmPassword } = passwordForm.elements;
    if (newPassword.value.length < 8) newPassword.setCustomValidity("Use at least 8 characters for your new password.");
    if (newPassword.value !== confirmPassword.value) confirmPassword.setCustomValidity("The new passwords do not match.");
    const invalid = passwordInputs.find((input) => !input.checkValidity());
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      passwordStatus.textContent = invalid.validationMessage;
      passwordStatus.classList.add("is-error");
      invalid.focus();
      return;
    }
    const studentNumber = account.accountNumber;
    const submitButton = passwordForm.querySelector('[type="submit"]');
    passwordPending = true;
    submitButton.disabled = true;
    passwordStatus.classList.remove("is-error");
    passwordStatus.textContent = "Updating password…";
    try {
      await accounts.changePassword(studentNumber, currentPassword.value, newPassword.value);
      if (account?.accountNumber !== studentNumber) return;
      resetPasswordForm();
      passwordStatus.textContent = "Password updated. Use your new password the next time you sign in.";
      setStatus("Password saved: Just now");
    } catch (error) {
      if (account?.accountNumber !== studentNumber) return;
      passwordStatus.textContent = error.message;
      passwordStatus.classList.add("is-error");
      if (error.message.includes("current password")) {
        currentPassword.setAttribute("aria-invalid", "true");
        currentPassword.focus();
      }
    } finally {
      passwordPending = false;
      submitButton.disabled = false;
    }
  });

  document.querySelector("#settings-logout-button").addEventListener("click", () => document.querySelector("#logout-button").click());
  document.addEventListener("portal:profilechange", (event) => {
    if (account?.accountNumber !== event.detail.account?.accountNumber) loadAccount(event.detail);
    else if (!editing) renderAccount(event.detail);
  });
  document.addEventListener("portal:accountchange", (event) => loadAccount(event.detail));
  document.addEventListener("portal:pagechange", (event) => {
    if (event.detail !== "settings") {
      if (editing) saveAccountEdits();
      setEditing(false);
      resetPasswordForm();
    } else renderAccount();
  });
  document.addEventListener("portal:logout", () => {
    window.clearTimeout(saveTimer);
    window.clearTimeout(noticeTimer);
    saveTimer = undefined;
    account = null;
    applyTheme(false);
    setEditing(false);
    resetPasswordForm();
    notice.hidden = true;
  });
  document.addEventListener("portal:beforelogout", () => {
    if (editing) saveAccountEdits();
  });
  document.addEventListener("portal:requestcreated", (event) => {
    if (!account || !preferences.requestUpdates) return;
    window.clearTimeout(noticeTimer);
    notice.textContent = `Your ${event.detail} demo request has been created.`;
    notice.hidden = false;
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 4500);
  });
  window.addEventListener("pagehide", () => {
    if (editing) saveAccountEdits();
  });

  loadAccount(profile.snapshot());
};
