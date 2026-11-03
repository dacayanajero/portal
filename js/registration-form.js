"use strict";

window.initializeRegistrationForm = () => {
  const profile = window.PortalProfile;
  const view = document.querySelector('[data-view="registration-form"]');
  const form = view.querySelector("#registration-request-form");
  const fields = [...form.querySelectorAll("[data-registration-field]")];
  const panels = [...form.querySelectorAll("[data-registration-panel]")];
  const steps = [...view.querySelectorAll("[data-registration-step]")];
  const progress = view.querySelector("progress");
  const progressLabel = view.querySelector("#registration-progress-label");
  const backButton = view.querySelector("#registration-back");
  const nextButton = view.querySelector("#registration-next");
  const submitButton = view.querySelector("#registration-submit");
  const consent = view.querySelector("#registration-confirm-information");
  const reviewDate = view.querySelector("#registration-review-date");
  const reviewDisclaimer = view.querySelector("#registration-review-disclaimer");
  const confirmation = document.querySelector("#registration-confirmation");
  const confirmYes = document.querySelector("#registration-confirm-yes");
  const confirmNo = document.querySelector("#registration-confirm-no");
  const confirmSchedule = document.querySelector("#registration-confirmation-schedule");
  const completeContent = document.querySelector("#registration-complete-content");
  const completeDate = document.querySelector("#registration-complete-date");
  const completeTime = document.querySelector("#registration-complete-time");
  const completeReference = document.querySelector("#registration-complete-reference");
  const errorMessage = view.querySelector("#registration-error");
  const saveMessage = view.querySelector("#registration-save-message");
  const chat = view.querySelector("#registration-chat");
  const question = view.querySelector("#registration-question");
  const dateField = form.elements.appointmentDate;
  const startTimeField = form.elements.appointmentStart;
  const endTimeField = view.querySelector("#registration-end-time");
  const timeRangeLabel = view.querySelector("#registration-time-range");
  const personalNames = ["fullName", "program", "yearLevel", "semester"];
  const programField = view.querySelector("#registration-program");
  const scheduleNames = new Set(["appointmentDate", "appointmentStart"]);
  const limits = { fullName: 100, program: 100, yearLevel: 30, semester: 40, academicYear: 9, requestedSemester: 40, appointmentDate: 10, appointmentStart: 5, purpose: 80, copies: 2, notes: 500 };
  let account = null;
  let storageKey = "";
  let currentStep = 1;
  let saveTimer;
  let savedAt = null;
  let hasDraft = false;
  let submitting = false;
  let pendingAccountNumber = null;
  let completedRequest = null;
  let lastProfile = {};
  let previousSemester = "";

  const currentYear = new Date().getFullYear();
  for (let year = currentYear + 1; year >= currentYear - 8; year -= 1) {
    form.elements.academicYear.add(new Option(`A.Y. ${year}-${year + 1}`, `${year}-${year + 1}`));
  }

  function values(trim = false) {
    return Object.fromEntries(fields.map((input) => {
      const value = input.name === "program" ? input.value.replace(/\r?\n/g, " ") : input.value;
      return [input.name, trim ? value.trim() : value];
    }));
  }

  function resizeProgram() {
    if (view.hidden || panels[0].hidden) return;
    programField.style.height = "auto";
    programField.style.height = `${programField.scrollHeight + 2}px`;
  }
  window.addEventListener("resize", resizeProgram);
  document.addEventListener("portal:layoutchange", resizeProgram);

  function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return localDateString(date) === value ? date : null;
  }

  function formatTime(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function timeRange() {
    const value = startTimeField.value;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || value < startTimeField.min || value > startTimeField.max) return null;
    const [hours, minutes] = value.split(":").map(Number);
    const end = `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return { end, label: `${formatTime(value)} – ${formatTime(end)}` };
  }

  function updateSchedule() {
    dateField.min = localDateString();
    const range = timeRange();
    endTimeField.value = range ? formatTime(range.end) : "";
    timeRangeLabel.textContent = range ? `${range.label} · 1 hour` : "Available hours: 8:00 AM–5:00 PM. The last appointment starts at 4:00 PM.";
    timeRangeLabel.classList.toggle("has-time", Boolean(range));
  }

  function requestDetails() {
    const data = values(true);
    const date = parseDate(data.appointmentDate);
    const range = timeRange();
    return { ...data, appointmentDateLabel: date?.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) || "", appointmentEnd: range?.end || "", appointmentTimeRange: range?.label || "" };
  }

  function onCompletePage() {
    return document.querySelector("#dashboard-screen").dataset.currentPage === "registration-form-complete";
  }

  function returnToRegistration() {
    completeContent.hidden = true;
    window.location.replace(window.PortalRoutes["registration-form"].hash);
  }

  function renderComplete() {
    if (!completedRequest || completedRequest.accountNumber !== account?.accountNumber) return false;
    completeDate.textContent = completedRequest.details.appointmentDateLabel;
    completeDate.dateTime = completedRequest.details.appointmentDate;
    completeTime.textContent = completedRequest.details.appointmentTimeRange;
    completeReference.textContent = `Registration Form · Request ${completedRequest.id}`;
    completeContent.hidden = false;
    return true;
  }

  view.querySelectorAll("[data-registration-picker]").forEach((button) => {
    const input = document.getElementById(button.dataset.registrationPicker);
    if (typeof input.showPicker === "function") input.parentElement.classList.add("has-native-picker");
    button.addEventListener("click", () => {
      updateSchedule();
      input.focus();
      try { input.showPicker?.(); } catch { /* The focused input remains available for keyboard entry. */ }
    });
  });

  function setValue(input, value) {
    const customSelect = personalNames.includes(input.name) || input.name === "requestedSemester"
      || (input.name === "academicYear" && /^\d{4}-\d{4}$/.test(value));
    if (input.matches("select") && customSelect && value && ![...input.options].some((option) => option.value === value)) {
      const option = new Option(input.name === "academicYear" ? `A.Y. ${value}` : value, value);
      option.dataset.registrationOption = "";
      input.add(option);
    }
    input.value = value;
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
  }

  function clearErrors() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
    consent.removeAttribute("aria-invalid");
  }

  function showSavedTime() {
    if (!savedAt) return;
    const time = Date.now() - savedAt < 60000 ? "Just now" : new Date(savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    saveMessage.textContent = `Auto-saved: ${time}`;
  }

  function saveDraft() {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!account || submitting) return;
    hasDraft = true;
    const updatedAt = Date.now();
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 2, accountNumber: account.accountNumber, fields: values(), step: currentStep, updatedAt }));
      savedAt = updatedAt;
      showSavedTime();
    } catch {
      savedAt = null;
      saveMessage.textContent = "Draft kept for this visit. Browser storage is unavailable.";
    }
  }

  function renderReview() {
    const data = { ...requestDetails(), studentNumber: account?.accountNumber || "" };
    const date = parseDate(data.appointmentDate);
    const review = {
      ...data,
      appointmentMonth: date?.toLocaleDateString(undefined, { month: "long", year: "numeric" }) || "",
      appointmentWeekday: date?.toLocaleDateString(undefined, { weekday: "short" }) || "",
      appointmentDay: date ? String(date.getDate()) : "",
    };
    view.querySelectorAll("[data-registration-review]").forEach((element) => {
      element.textContent = review[element.dataset.registrationReview] || "None";
    });
    reviewDate.dateTime = data.appointmentDate;
    reviewDate.setAttribute("aria-label", data.appointmentDateLabel || "No appointment date selected");
    consent.checked = false;
  }

  function showStep(step, focus = false, save = true) {
    const direction = step > currentStep ? 1 : -1;
    currentStep = step;
    clearErrors();
    window.PortalMotion.swap(panels, panels.find((panel) => Number(panel.dataset.registrationPanel) === step), { direction });
    steps.forEach((button) => {
      const number = Number(button.dataset.registrationStep);
      button.classList.toggle("is-active", number === step);
      button.classList.toggle("is-complete", number < step);
      if (number === step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    progress.value = step;
    const label = `Step ${step} of 3 | ${Math.round(step / 3 * 100)}% Complete`;
    progressLabel.textContent = label;
    progress.setAttribute("aria-valuetext", label);
    backButton.hidden = step === 1;
    nextButton.hidden = step === 3;
    submitButton.hidden = step !== 3;
    reviewDisclaimer.hidden = step !== 3;
    consent.checked = false;
    resizeProgram();
    updateSchedule();
    if (step === 3) renderReview();
    if (save) saveDraft();
    if (focus) panels[step - 1].querySelector("h3").focus();
  }

  function validatePanel(step, mark = true) {
    updateSchedule();
    let firstInvalid = null;
    panels[step - 1].querySelectorAll("[data-registration-field]").forEach((input) => {
      input.setCustomValidity("");
      const value = input.value.trim();
      if (input.required && !value) input.setCustomValidity("Complete this field before continuing.");
      if (input.value.length > limits[input.name]) input.setCustomValidity(`Use at most ${limits[input.name]} characters.`);
      if (input.name === "academicYear" && value) {
        const match = /^(\d{4})-(\d{4})$/.exec(value);
        if (!match || Number(match[2]) !== Number(match[1]) + 1) input.setCustomValidity("Choose an academic year with consecutive years.");
      }
      if (input.name === "appointmentDate" && value && (!parseDate(value) || value < dateField.min)) input.setCustomValidity("Choose an appointment date today or later.");
      if (input.name === "appointmentStart" && value && !timeRange()) input.setCustomValidity("Choose a start time from 8:00 AM to 4:00 PM so the one-hour appointment ends by 5:00 PM.");
      const valid = input.checkValidity();
      if (mark) input.setAttribute("aria-invalid", String(!valid));
      else input.removeAttribute("aria-invalid");
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  function validateThrough(step) {
    for (let number = 1; number <= step; number += 1) {
      const invalid = validatePanel(number);
      if (!invalid) continue;
      if (confirmation.open) confirmation.close("invalid");
      showStep(number, false, false);
      const label = form.querySelector(`label[for="${invalid.id}"]`).textContent;
      errorMessage.textContent = `${label}: ${invalid.validationMessage}`;
      errorMessage.hidden = false;
      const foldedSection = invalid.closest("details");
      if (foldedSection) foldedSection.open = true;
      invalid.focus();
      saveDraft();
      return false;
    }
    return true;
  }

  function goToStep(step) {
    if (!account || submitting || step < 1 || step > 3) return;
    if (step > currentStep && !validateThrough(step - 1)) return;
    showStep(step, true);
  }

  function appendMessage(message, isQuestion = false) {
    const bubble = document.createElement("p");
    bubble.className = `registration-bubble${isQuestion ? " is-question" : ""}`;
    bubble.setAttribute("aria-label", isQuestion ? "You" : "Assistant");
    bubble.textContent = message;
    chat.append(bubble);
    while (chat.children.length > 20) chat.firstElementChild.remove();
    chat.scrollTop = chat.scrollHeight;
  }

  function resetChat(snapshot) {
    chat.replaceChildren();
    question.value = "";
    const greeting = document.createElement("p");
    greeting.className = "registration-bubble";
    const name = document.createElement("strong");
    name.dataset.registrationGreeting = "";
    name.textContent = snapshot.values.fullName || account?.fullName || "there";
    greeting.append("Hi ", name);
    chat.append(greeting);
    appendMessage("I'm your RTU AI Assistant! I can guide you through academic processes and scheduling on this website to ensure a smooth and convenient experience.");
    appendMessage("How can I assist you today?");
    chat.scrollTop = 0;
  }

  function resetFields(snapshot) {
    form.reset();
    form.querySelectorAll("[data-registration-option]").forEach((option) => option.remove());
    fields.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    lastProfile = Object.fromEntries(personalNames.map((name) => [name, snapshot.values[name] || ""]));
    personalNames.forEach((name) => setValue(form.elements[name], lastProfile[name]));
    previousSemester = form.elements.semester.value;
    setValue(form.elements.requestedSemester, previousSemester);
    form.elements.studentNumber.value = account?.accountNumber || "";
    view.querySelector(".grade-slip-request-options").open = false;
    view.querySelector(".grade-slip-review-additional").open = false;
    updateSchedule();
    clearErrors();
  }

  function loadAccount(snapshot) {
    if (saveTimer !== undefined) saveDraft();
    completedRequest = null;
    completeContent.hidden = true;
    completeDate.textContent = "";
    completeDate.removeAttribute("datetime");
    completeTime.textContent = "";
    completeReference.textContent = "";
    pendingAccountNumber = null;
    if (confirmation.open) confirmation.close();
    confirmYes.disabled = false;
    confirmNo.disabled = false;
    confirmSchedule.textContent = "";
    account = snapshot.account;
    storageKey = account ? `rtu.portal.registration-form.${encodeURIComponent(account.accountNumber)}` : "";
    hasDraft = false;
    savedAt = null;
    submitting = false;
    submitButton.disabled = false;
    resetFields(snapshot);
    resetChat(snapshot);
    let step = 1;
    if (account) {
      try {
        const draft = JSON.parse(window.localStorage.getItem(storageKey));
        if ([1, 2].includes(draft?.version) && draft.accountNumber === account.accountNumber
          && Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 3
          && Number.isFinite(draft.updatedAt) && draft.updatedAt > 0
          && fields.every((input) => {
            const value = draft.fields?.[input.name];
            if (draft.version === 1 && scheduleNames.has(input.name) && value === undefined) return true;
            return typeof value === "string" && value.length <= limits[input.name];
          })) {
          fields.forEach((input) => { if (typeof draft.fields[input.name] === "string") setValue(input, draft.fields[input.name]); });
          previousSemester = form.elements.semester.value;
          step = draft.step;
          if (step > 1 && validatePanel(1, false)) step = 1;
          else if (step > 2 && validatePanel(2, false)) step = 2;
          savedAt = draft.updatedAt;
          hasDraft = true;
        }
      } catch {
        // Start with this account's profile when its draft cannot be read.
      }
    }
    showStep(step, false, false);
    saveMessage.textContent = "Auto-save ready";
    showSavedTime();
    if (account && !view.hidden && !hasDraft) saveDraft();
    if (account && onCompletePage()) returnToRegistration();
  }

  steps.forEach((button) => button.addEventListener("click", () => goToStep(Number(button.dataset.registrationStep))));
  backButton.addEventListener("click", () => goToStep(currentStep - 1));
  nextButton.addEventListener("click", () => goToStep(currentStep + 1));
  consent.addEventListener("change", clearErrors);
  fields.forEach((input) => {
    input.addEventListener("input", () => {
      if (!account || submitting) return;
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      consent.checked = false;
      clearErrors();
      if (input === startTimeField || input === dateField) updateSchedule();
      if (input === programField) resizeProgram();
      if (input.name === "semester") {
        if (!form.elements.requestedSemester.value || form.elements.requestedSemester.value === previousSemester) setValue(form.elements.requestedSemester, input.value);
        previousSemester = input.value;
      }
      window.clearTimeout(saveTimer);
      saveMessage.textContent = "Saving changes…";
      saveTimer = window.setTimeout(saveDraft, 400);
    });
    input.addEventListener("change", saveDraft);
  });

  function validateSubmission() {
    if (!validateThrough(2)) {
      if (confirmation.open) confirmation.close("invalid");
      return false;
    }
    if (!consent.checked) {
      if (confirmation.open) confirmation.close("invalid");
      consent.setAttribute("aria-invalid", "true");
      errorMessage.textContent = "Confirm that the information above is correct and complete before submitting.";
      errorMessage.hidden = false;
      consent.focus();
      return false;
    }
    return true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!account || submitting || confirmation.open) return;
    if (currentStep < 3) { goToStep(currentStep + 1); return; }
    if (!validateSubmission()) return;
    saveDraft();
    const data = requestDetails();
    pendingAccountNumber = account.accountNumber;
    confirmSchedule.textContent = `${data.appointmentDateLabel} · ${data.appointmentTimeRange}`;
    submitButton.disabled = true;
    confirmation.showModal();
  });

  confirmNo.addEventListener("click", () => confirmation.close("no"));
  confirmation.addEventListener("close", () => {
    pendingAccountNumber = null;
    confirmYes.disabled = false;
    confirmNo.disabled = false;
    if (!submitting) {
      submitButton.disabled = false;
      if (account && !view.hidden && currentStep === 3) submitButton.focus();
    }
  });

  confirmYes.addEventListener("click", async () => {
    if (!confirmation.open || !account || submitting || pendingAccountNumber !== account.accountNumber) return;
    if (!validateSubmission()) return;
    submitting = true;
    submitButton.disabled = true;
    confirmYes.disabled = true;
    confirmNo.disabled = true;
    const data = requestDetails();
    let request;
    try {
      request = await window.PortalRequests.create(
      { document: "Registration Form", purpose: data.purpose, details: { ...data, studentNumber: account.accountNumber } },
      { nextPage: "registration-form-complete", notify: false },
      );
    } catch (error) {
      submitting = false;
      submitButton.disabled = false;
      confirmation.close("error");
      errorMessage.textContent = "Request was not saved to Supabase: " + error.message;
      errorMessage.hidden = false;
      return;
    }
    if (!request) {
      submitting = false;
      submitButton.disabled = false;
      confirmation.close("error");
      errorMessage.textContent = "Supabase did not confirm your request. Please sign in and try again.";
      errorMessage.hidden = false;
      return;
    }
    completedRequest = { ...request, accountNumber: account.accountNumber };
    renderComplete();
    confirmation.close("yes");
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    try { window.localStorage.removeItem(storageKey); } catch { /* The request is already available for this visit. */ }
    savedAt = null;
    hasDraft = false;
    resetFields(profile.snapshot());
    showStep(1, false, false);
    saveMessage.textContent = "Auto-save ready";
    submitting = false;
    submitButton.disabled = false;
  });

  view.querySelector("#registration-assistant-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = question.value.trim();
    if (!account || !query) return;
    appendMessage(query, true);
    appendMessage(window.PortalAssistant.answer(query));
    question.value = "";
    question.focus();
  });

  document.addEventListener("portal:accountchange", (event) => loadAccount(event.detail));
  document.addEventListener("portal:profilechange", (event) => {
    if (!account || account.accountNumber !== event.detail.account?.accountNumber) return;
    let changed = false;
    personalNames.forEach((name) => {
      const value = event.detail.values[name] || "";
      if (name === "semester" && form.elements.requestedSemester.value === lastProfile[name] && value !== lastProfile[name]) {
        setValue(form.elements.requestedSemester, value);
        changed = true;
      }
      if (form.elements[name].value === lastProfile[name] && value !== lastProfile[name]) {
        setValue(form.elements[name], value);
        changed = true;
      }
      lastProfile[name] = value;
    });
    previousSemester = form.elements.semester.value;
    const greeting = chat.querySelector("[data-registration-greeting]");
    if (greeting) greeting.textContent = event.detail.values.fullName || account.fullName;
    if (changed) {
      resizeProgram();
      if (confirmation.open) confirmation.close("profilechange");
      clearErrors();
      if (currentStep === 3) renderReview();
      if (!view.hidden || hasDraft) saveDraft();
    }
  });
  document.addEventListener("portal:pagechange", (event) => {
    if (event.detail === "registration-form-complete") {
      if (account && !renderComplete()) returnToRegistration();
      return;
    }
    if (event.detail === "registration-form") {
      resizeProgram();
      updateSchedule();
      showSavedTime();
    } else if (saveTimer !== undefined) saveDraft();
  });
  document.addEventListener("portal:beforelogout", () => { if (saveTimer !== undefined) saveDraft(); });
  document.addEventListener("portal:logout", () => loadAccount(profile.snapshot()));
  window.addEventListener("pagehide", () => { if (saveTimer !== undefined) saveDraft(); });
  loadAccount(profile.snapshot());
};
