"use strict";

window.initializePortalLogin = () => {
  const roleButtons = [...document.querySelectorAll("[data-role]")];
  const loginForm = document.querySelector("#login-form");
  const accountInput = document.querySelector("#account-number");
  const passwordInput = document.querySelector("#password");
  const passwordToggle = document.querySelector("#password-toggle");
  const consentInput = document.querySelector("#privacy-consent");
  const loginStatus = document.querySelector("#login-status");
  const registerPrompt = document.querySelector("#register-prompt");
  const provisionNote = document.querySelector("#staff-provision-note");
  const accounts = window.PortalAccounts;
  let activeRole = "student";
  let loginPending = false;
  let registrationPending = false;

  const roles = {
    student: {
      title: "Student Login",
      accountLabel: "Email address",
      example: "name@example.com",
      description: ["Sign in to access your academic services,", " records, and more."],
      registerTitle: "Create a student account",
    },
    staff: {
      title: "Staff Login",
      accountLabel: "Email address",
      example: "staff@example.com",
      description: ["Sign in to manage academic services,", " records, and requests."],
      registerTitle: "Staff accounts are provisioned",
    },
  };

  function setFieldError(input, message) {
    const error = document.getElementById(input.getAttribute("aria-describedby"));
    input.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
  }

  function hidePassword() {
    passwordInput.type = "password";
    passwordToggle.setAttribute("aria-pressed", "false");
    passwordToggle.setAttribute("aria-label", "Show password");
  }

  function setRole(role) {
    if (role === activeRole) return;
    activeRole = role;
    const details = roles[role];

    roleButtons.forEach((button) => {
      const selected = button.dataset.role === role;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    document.querySelector("#login-title").textContent = details.title;
    const description = document.querySelector("#login-description");
    const breakElement = document.createElement("br");
    breakElement.className = "desktop-break";
    description.replaceChildren(document.createTextNode(details.description[0]), breakElement, document.createTextNode(details.description[1]));
    document.querySelector("#account-label").textContent = details.accountLabel;
    accountInput.placeholder = details.example;
    document.querySelector("#register-title").textContent = details.registerTitle;
    document.querySelector("#register-number-label").textContent = "Student number";
    registerPrompt.hidden = role !== "student";
    provisionNote.hidden = role !== "staff";

    loginForm.reset();
    hidePassword();
    setFieldError(accountInput, "");
    setFieldError(passwordInput, "");
    setFieldError(consentInput, "");
    loginStatus.textContent = "";
    window.PortalMotion.enter(document.querySelector(".login-heading"));
    window.PortalMotion.enter(loginForm);
  }

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => setRole(button.dataset.role));
  });

  if (window.location.hash.startsWith("#/staff/")) setRole("staff");
  document.addEventListener("portal:loginrequired", (event) => { if (!["student", "staff"].includes(event.detail.role)) return; setRole(event.detail.role); passwordInput.value = ""; hidePassword(); loginStatus.textContent = event.detail.message || ""; });
  document.addEventListener("portal:sessioninvalidated", (event) => { if (!document.querySelector("#login-screen").hidden && ["student", "staff"].includes(event.detail.role)) { setRole(event.detail.role); passwordInput.value = ""; hidePassword(); loginStatus.textContent = event.detail.message; } });

  passwordToggle.addEventListener("click", () => {
    const visible = passwordInput.type === "password";
    passwordInput.type = visible ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(visible));
    passwordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  });

  [accountInput, passwordInput].forEach((input) => {
    input.addEventListener("input", () => {
      setFieldError(input, "");
      loginStatus.textContent = "";
    });
  });

  consentInput.addEventListener("change", () => {
    if (consentInput.checked) setFieldError(consentInput, "");
    loginStatus.textContent = "";
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginPending) return;
    loginStatus.textContent = "";

    const accountError = accountInput.value.trim()
      ? ""
      : `Please enter your ${roles[activeRole].accountLabel.toLowerCase()}.`;
    const passwordError = passwordInput.value ? "" : "Please enter your password.";
    const consentError = consentInput.checked ? "" : "Please confirm that you have read the Data Privacy Statement.";
    setFieldError(accountInput, accountError);
    setFieldError(passwordInput, passwordError);
    setFieldError(consentInput, consentError);

    if (accountError || passwordError || consentError) {
      (accountError ? accountInput : passwordError ? passwordInput : consentInput).focus();
      return;
    }

    hidePassword();
    const submitButton = loginForm.querySelector('[type="submit"]');
    loginPending = true;
    submitButton.disabled = true;
    loginStatus.textContent = "Signing in…";
    try {
      const account = await accounts.authenticate(accountInput.value, passwordInput.value, activeRole);
      passwordInput.value = "";
      if (!account) {
        loginStatus.textContent = "Incorrect email or password. Please try again.";
        passwordInput.focus();
        return;
      }
      loginStatus.textContent = "";
      document.dispatchEvent(new CustomEvent("portal:login", { detail: account }));
    } catch (error) {
      passwordInput.value = "";
      loginStatus.textContent = error.message;
    } finally {
      loginPending = false;
      submitButton.disabled = false;
    }
  });

  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.tagName === "A") event.preventDefault();
      const dialog = document.getElementById(button.dataset.openDialog);
      const form = dialog.querySelector("form");
      if (form) form.reset();
      dialog.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      const status = dialog.querySelector(".dialog-status");
      if (status) {
        status.textContent = "";
        status.classList.remove("is-success");
      }
      dialog.showModal();
      const focusTarget = dialog.querySelector("input, .dialog-close");
      if (focusTarget) focusTarget.focus();
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });

    dialog.addEventListener("input", (event) => {
      if (event.target.matches("input")) event.target.removeAttribute("aria-invalid");
      const status = dialog.querySelector(".dialog-status");
      if (!status) return;
      status.textContent = "";
      status.classList.remove("is-success");
    });
  });

  function validateDialog(form, status) {
    let firstInvalid = null;

    form.querySelectorAll("input, select").forEach((input) => {
      const blank = !input.value.trim();
      const valid = !blank && input.checkValidity();
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid && !firstInvalid) firstInvalid = input;
    });

    if (!firstInvalid) return true;

    const label = form.querySelector(`label[for="${firstInvalid.id}"]`).textContent;
    status.classList.remove("is-success");
    if (!firstInvalid.value.trim()) {
      status.textContent = `Please enter your ${label.toLowerCase()}.`;
    } else if (firstInvalid.type === "checkbox") {
      status.textContent = "Please agree to the Terms & Conditions to continue.";
    } else if (firstInvalid.validity.typeMismatch) {
      status.textContent = "Please enter a valid email address.";
    } else if (firstInvalid.validity.tooShort) {
      status.textContent = "Please use a password with at least 8 characters.";
    } else {
      status.textContent = firstInvalid.validationMessage;
    }
    firstInvalid.focus();
    return false;
  }

  const recoveryForm = document.querySelector("#recovery-form");
  recoveryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = document.querySelector("#recovery-status");
    if (!validateDialog(recoveryForm, status)) return;
    status.classList.remove("is-success");
    status.textContent = "Recovery is a development preview only. No password was reset, and no recovery email, link or token was sent. A secure authentication provider is required for account recovery.";
  });

  const registerForm = document.querySelector("#register-form");
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (registrationPending) return;
    const status = document.querySelector("#register-status");
    if (!validateDialog(registerForm, status)) return;
    if (activeRole !== "student") {
      status.textContent = "Staff accounts require an authorized provisioning process. Public staff registration is unavailable. Choose Student to create a student account.";
      return;
    }
    const submitButton = registerForm.querySelector('[type="submit"]');
    registrationPending = true;
    submitButton.disabled = true;
    status.classList.remove("is-success");
    status.textContent = "Creating your account…";
    try {
      const account = await accounts.register({
        fullName: registerForm.elements.name.value,
        accountNumber: registerForm.elements.accountNumber.value,
        email: registerForm.elements.email.value,
        password: registerForm.elements.newPassword.value,
        college: registerForm.elements.college.value,
        program: registerForm.elements.program.value,
      });
      registerForm.reset();
      document.querySelector("#register-dialog").close();
      setRole("student");
      loginForm.reset();
      hidePassword();
      setFieldError(accountInput, "");
      setFieldError(passwordInput, "");
      accountInput.value = account.email;
      loginStatus.textContent = account.needsEmailConfirmation
        ? "Account created! Confirm your email, then sign in using your email address and password."
        : "Account created in Supabase! Sign in with your email address and password.";
      passwordInput.focus();
    } catch (error) {
      const message = String(error?.message || "Unable to create account.");
      status.textContent = /email rate limit exceeded|over_email_send_rate_limit/i.test(message)
        ? "Supabase has reached its confirmation-email limit. Please try later, or ask the project administrator to configure custom SMTP under Authentication settings. Do not repeatedly submit the form."
        : message;
    } finally {
      registrationPending = false;
      submitButton.disabled = false;
    }
  });
};
