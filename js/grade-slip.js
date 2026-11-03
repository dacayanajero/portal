"use strict";

window.initializeGradeSlip = () => {
  const profile = window.PortalProfile;
  const form = document.querySelector("#grade-slip-form");
  const fields = [...form.querySelectorAll("[data-grade-field]")];
  const programField = document.querySelector("#grade-slip-program");
  const dateField = document.querySelector("#grade-slip-appointment-date");
  const startTimeField = document.querySelector("#grade-slip-start-time");
  const endTimeField = document.querySelector("#grade-slip-end-time");
  const timeRangeLabel = document.querySelector("#grade-slip-time-range");
  const panels = [...form.querySelectorAll("[data-grade-panel]")];
  const stepButtons = [...document.querySelectorAll(".grade-slip-steps [data-grade-step]")];
  const progress = document.querySelector("#grade-slip-progress");
  const progressLabel = document.querySelector("#grade-slip-progress-label");
  const backButton = document.querySelector("#grade-slip-back");
  const nextButton = document.querySelector("#grade-slip-next");
  const submitButton = document.querySelector("#grade-slip-submit");
  const reviewConsent = document.querySelector("#grade-slip-confirm-information");
  const reviewDate = document.querySelector("#grade-slip-review-date");
  const reviewDisclaimer = document.querySelector("#grade-slip-review-disclaimer");
  const errorMessage = document.querySelector("#grade-slip-error");
  const saveMessage = document.querySelector("#grade-slip-save-message");
  const confirmation = document.querySelector("#grade-slip-confirmation");
  const confirmYes = document.querySelector("#grade-slip-confirm-yes");
  const confirmNo = document.querySelector("#grade-slip-confirm-no");
  const confirmSchedule = document.querySelector("#grade-slip-confirmation-schedule");
  const completeContent = document.querySelector("#grade-slip-complete-content");
  const completeDate = document.querySelector("#grade-slip-complete-date");
  const completeTime = document.querySelector("#grade-slip-complete-time");
  const completeReference = document.querySelector("#grade-slip-complete-reference");
  const personalNames = ["fullName", "program", "yearLevel", "semester"];
  const limits = { fullName: 100, program: 100, yearLevel: 30, semester: 40, academicYear: 9, requestedSemester: 40, appointmentDate: 10, appointmentStart: 5, purpose: 80, copies: 2, notes: 500 };
  const legacyNames = new Set(["fullName", "program", "yearLevel", "semester", "academicYear", "purpose", "copies", "notes"]);
  let account = null;
  let storageKey = "";
  let currentStep = 1;
  let saveTimer;
  let savedAt = null;
  let hasDraft = false;
  let submitting = false;
  let lastProfile = {};
  let previousSemester = "";
  let pendingAccountNumber = null;
  let completedRequest = null;

  const currentYear = new Date().getFullYear();
  for (let year = currentYear + 1; year >= currentYear - 8; year -= 1) {
    form.elements.academicYear.add(new Option(`A.Y. ${year}-${year + 1}`, `${year}-${year + 1}`));
  }

  function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (localDateString(date) !== value) return "";
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  function formatTime(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function timeRange() {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTimeField.value);
    if (!match) return null;
    if (startTimeField.value < startTimeField.min || startTimeField.value > startTimeField.max) return null;
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    const endMinutes = (startMinutes + 60) % 1440;
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const nextDay = startMinutes + 60 >= 1440;
    return { end, nextDay, label: `${formatTime(startTimeField.value)} – ${formatTime(end)}${nextDay ? " (next day)" : ""}` };
  }

  function updateSchedule() {
    dateField.min = localDateString();
    const range = timeRange();
    endTimeField.value = range ? `${formatTime(range.end)}${range.nextDay ? " (next day)" : ""}` : "";
    timeRangeLabel.textContent = range ? `${range.label} · 1 hour` : "Available hours: 8:00 AM–5:00 PM. The last appointment starts at 4:00 PM.";
    timeRangeLabel.classList.toggle("has-time", Boolean(range));
  }

  function requestDetails() {
    const data = values(true);
    const range = timeRange();
    return { ...data, appointmentDateLabel: formatDate(data.appointmentDate), appointmentEnd: range?.end || "", appointmentEndNextDay: range?.nextDay || false, appointmentTimeRange: range?.label || "" };
  }

  document.querySelectorAll("[data-grade-picker]").forEach((button) => {
    const input = document.getElementById(button.dataset.gradePicker);
    if (typeof input.showPicker === "function") input.parentElement.classList.add("has-native-picker");
    button.addEventListener("click", () => {
      updateSchedule();
      input.focus();
      try { input.showPicker?.(); } catch { /* The focused input remains available for keyboard entry. */ }
    });
  });

  function onGradeSlipPage() {
    return document.querySelector("#dashboard-screen").dataset.currentPage === "grade-slip";
  }

  function onCompletePage() {
    return document.querySelector("#dashboard-screen").dataset.currentPage === "grade-slip-complete";
  }

  function returnToGradeSlip() {
    completeContent.hidden = true;
    window.location.replace(window.PortalRoutes["grade-slip"].hash);
  }

  function renderComplete() {
    if (!completedRequest || completedRequest.accountNumber !== account?.accountNumber) return false;
    completeDate.textContent = formatDate(completedRequest.details.appointmentDate);
    completeDate.dateTime = completedRequest.details.appointmentDate;
    completeTime.textContent = completedRequest.details.appointmentTimeRange;
    completeReference.textContent = `Grade Slip · Request ${completedRequest.id}`;
    completeContent.hidden = false;
    return true;
  }

  function values(trim = false) {
    return Object.fromEntries(fields.map((input) => {
      const value = input.name === "program" ? input.value.replace(/\r?\n/g, " ") : input.value;
      return [input.name, trim ? value.trim() : value];
    }));
  }

  function resizeProgram() {
    programField.style.height = "auto";
    programField.style.height = `${programField.scrollHeight + 2}px`;
  }
  window.addEventListener("resize", resizeProgram);
  document.addEventListener("portal:layoutchange", resizeProgram);

  function setFieldValue(input, value) {
    const customSelect = personalNames.includes(input.name) || input.name === "requestedSemester" || (input.name === "academicYear" && /^\d{4}-\d{4}$/.test(value));
    if (input.matches("select") && customSelect && value && ![...input.options].some((option) => option.value === value)) {
      const option = new Option(input.name === "academicYear" ? `A.Y. ${value}` : value, value);
      option.dataset.profileOption = "";
      input.add(option);
    }
    input.value = value;
    if (input.name === "purpose" && !input.value) input.value = "Personal copy";
  }

  function clearErrors() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }

  function showSavedTime() {
    if (!savedAt) return;
    const recent = Date.now() - savedAt < 60000;
    const time = new Date(savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    saveMessage.textContent = `Auto-saved: ${recent ? "Just now" : time}`;
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
    const data = requestDetails();
    const date = data.appointmentDateLabel ? new Date(`${data.appointmentDate}T12:00:00`) : null;
    const review = {
      ...data,
      studentNumber: account?.accountNumber || "",
      academicYearLabel: data.academicYear ? `A.Y. ${data.academicYear}` : "",
      appointmentMonth: date?.toLocaleDateString(undefined, { month: "long", year: "numeric" }) || "",
      appointmentWeekday: date?.toLocaleDateString(undefined, { weekday: "short" }) || "",
      appointmentDay: date ? String(date.getDate()) : "",
    };
    document.querySelectorAll("[data-grade-review]").forEach((element) => {
      element.textContent = review[element.dataset.gradeReview] || "None";
    });
    reviewDate.dateTime = data.appointmentDate;
    reviewDate.setAttribute("aria-label", data.appointmentDateLabel || "No date selected");
    reviewConsent.checked = false;
    reviewConsent.removeAttribute("aria-invalid");
  }

  function showStep(step, focus = false, save = true) {
    const direction = step > currentStep ? 1 : -1;
    currentStep = step;
    clearErrors();
    window.PortalMotion.swap(panels, panels.find((panel) => Number(panel.dataset.gradePanel) === step), { direction });
    stepButtons.forEach((button) => {
      const number = Number(button.dataset.gradeStep);
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
    if (step !== 3) reviewConsent.checked = false;
    resizeProgram();
    updateSchedule();
    if (step === 3) renderReview();
    if (save) saveDraft();
    if (focus) panels[step - 1].querySelector("h3").focus();
  }

  function validatePanel(step, mark = true) {
    updateSchedule();
    let firstInvalid = null;
    panels[step - 1].querySelectorAll("[data-grade-field]").forEach((input) => {
      input.setCustomValidity("");
      const value = input.value.trim();
      if (input.required && !value) input.setCustomValidity("Complete this field before continuing.");
      if (input.value.length > limits[input.name]) input.setCustomValidity(`Use at most ${limits[input.name]} characters.`);
      if (input.name === "academicYear" && value) {
        const match = /^(\d{4})-(\d{4})$/.exec(value);
        if (!match || Number(match[2]) !== Number(match[1]) + 1) input.setCustomValidity("Enter consecutive academic years, for example 2025-2026.");
      }
      if (input.name === "appointmentDate" && value && (!formatDate(value) || value < dateField.min)) input.setCustomValidity("Choose an appointment date today or later.");
      if (input.name === "appointmentStart" && value && !timeRange()) input.setCustomValidity("Choose a start time from 8:00 AM to 4:00 PM so the one-hour appointment ends by 5:00 PM.");
      const valid = input.checkValidity();
      if (mark) input.setAttribute("aria-invalid", String(!valid));
      else input.removeAttribute("aria-invalid");
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  function showInvalid(step, input) {
    showStep(step, false, false);
    const label = form.querySelector(`label[for="${input.id}"]`).textContent.trim();
    errorMessage.textContent = `${label}: ${input.validationMessage}`;
    errorMessage.hidden = false;
    const foldedSection = input.closest("details");
    if (foldedSection) foldedSection.open = true;
    input.focus();
    saveDraft();
  }

  function goToStep(step) {
    if (!account || submitting || step < 1 || step > 3) return;
    if (step > currentStep) {
      for (let previous = 1; previous < step; previous += 1) {
        const invalid = validatePanel(previous);
        if (invalid) {
          showInvalid(previous, invalid);
          return;
        }
      }
    }
    showStep(step, true);
  }

  function resetFields(snapshot) {
    form.reset();
    form.querySelectorAll("[data-profile-option]").forEach((option) => option.remove());
    fields.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    lastProfile = Object.fromEntries(personalNames.map((name) => [name, snapshot.values[name] || ""]));
    personalNames.forEach((name) => setFieldValue(form.elements[name], lastProfile[name]));
    previousSemester = form.elements.semester.value;
    setFieldValue(form.elements.requestedSemester, previousSemester);
    form.elements.studentNumber.value = account?.accountNumber || "";
    document.querySelector(".grade-slip-request-options").open = false;
    updateSchedule();
    clearErrors();
    reviewConsent.removeAttribute("aria-invalid");
    document.querySelector(".grade-slip-review-additional").open = false;
  }

  function loadAccount(snapshot) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
    account = snapshot.account;
    pendingAccountNumber = null;
    completedRequest = null;
    completeContent.hidden = true;
    completeDate.textContent = "";
    completeDate.removeAttribute("datetime");
    completeTime.textContent = "";
    completeReference.textContent = "";
    if (confirmation.open) confirmation.close();
    confirmYes.disabled = false;
    confirmNo.disabled = false;
    storageKey = account ? `rtu.portal.grade-slip.${encodeURIComponent(account.accountNumber)}` : "";
    savedAt = null;
    hasDraft = false;
    submitting = false;
    submitButton.disabled = false;
    resetFields(snapshot);
    let step = 1;
    if (account) {
      try {
        const draft = JSON.parse(window.localStorage.getItem(storageKey));
        if ([1, 2].includes(draft?.version) && draft.accountNumber === account.accountNumber
          && Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 3
          && Number.isFinite(draft.updatedAt) && draft.updatedAt > 0
          && fields.every((input) => {
            const value = draft.fields?.[input.name];
            if (draft.version === 1 && value === undefined && !legacyNames.has(input.name)) return true;
            return typeof value === "string" && value.length <= limits[input.name];
          })) {
          fields.forEach((input) => {
            if (typeof draft.fields[input.name] === "string") setFieldValue(input, draft.fields[input.name]);
          });
          if (draft.fields.requestedSemester === undefined) setFieldValue(form.elements.requestedSemester, form.elements.semester.value);
          previousSemester = form.elements.semester.value;
          step = draft.step;
          savedAt = draft.updatedAt;
          hasDraft = true;
          if (step > 1 && validatePanel(1, false)) step = 1;
          else if (step > 2 && validatePanel(2, false)) step = 2;
        }
      } catch {
        // Start with this account's profile if its saved request draft is unavailable.
      }
    }
    showStep(step, false, false);
    saveMessage.textContent = "Auto-save ready";
    showSavedTime();
    if (account && onGradeSlipPage() && !hasDraft) saveDraft();
    if (account && onCompletePage()) returnToGradeSlip();
  }

  document.querySelectorAll("[data-grade-step]").forEach((button) => {
    button.addEventListener("click", () => goToStep(Number(button.dataset.gradeStep)));
  });
  backButton.addEventListener("click", () => goToStep(currentStep - 1));
  nextButton.addEventListener("click", () => goToStep(currentStep + 1));
  reviewConsent.addEventListener("change", () => {
    reviewConsent.removeAttribute("aria-invalid");
    clearErrors();
  });
  fields.forEach((input) => {
    input.addEventListener("input", () => {
      if (!account || submitting) return;
      if (input === programField) resizeProgram();
      if (input.name === "semester") {
        if (!form.elements.requestedSemester.value || form.elements.requestedSemester.value === previousSemester) setFieldValue(form.elements.requestedSemester, input.value);
        previousSemester = input.value;
      }
      if (input === startTimeField) updateSchedule();
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      clearErrors();
      window.clearTimeout(saveTimer);
      saveMessage.textContent = "Saving changes…";
      saveTimer = window.setTimeout(saveDraft, 400);
    });
    input.addEventListener("change", () => {
      if (input === startTimeField) updateSchedule();
      saveDraft();
    });
  });

  function validateSubmission() {
    for (const step of [1, 2]) {
      const invalid = validatePanel(step);
      if (invalid) {
        if (confirmation.open) confirmation.close("invalid");
        showInvalid(step, invalid);
        return false;
      }
    }
    if (!reviewConsent.checked) {
      if (confirmation.open) confirmation.close("invalid");
      showStep(3, false, false);
      reviewConsent.setAttribute("aria-invalid", "true");
      errorMessage.textContent = "Confirm that the information above is correct and complete before continuing.";
      errorMessage.hidden = false;
      reviewConsent.focus();
      return false;
    }
    return true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!account || submitting || confirmation.open) return;
    if (currentStep < 3) {
      goToStep(currentStep + 1);
      return;
    }
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
      if (account && onGradeSlipPage() && currentStep === 3) submitButton.focus();
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
      { document: "Grade Slip", purpose: data.purpose, details: { ...data, studentNumber: account.accountNumber } },
      { nextPage: "grade-slip-complete", notify: false },
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
    hasDraft = false;
    savedAt = null;
    resetFields(profile.snapshot());
    showStep(1, false, false);
    saveMessage.textContent = "Auto-save ready";
  });

  document.addEventListener("portal:accountchange", (event) => loadAccount(event.detail));
  document.addEventListener("portal:profilechange", (event) => {
    if (!account || account.accountNumber !== event.detail.account?.accountNumber) return;
    let changed = false;
    personalNames.forEach((name) => {
      const value = event.detail.values[name] || "";
      if (name === "semester" && form.elements.requestedSemester.value === lastProfile[name] && value !== lastProfile[name]) {
        setFieldValue(form.elements.requestedSemester, value);
        changed = true;
      }
      if (form.elements[name].value === lastProfile[name] && value !== lastProfile[name]) {
        setFieldValue(form.elements[name], value);
        changed = true;
      }
      lastProfile[name] = value;
    });
    previousSemester = form.elements.semester.value;
    if (changed) {
      resizeProgram();
      if (currentStep === 3) renderReview();
      if (hasDraft || onGradeSlipPage()) saveDraft();
    }
  });
  document.addEventListener("portal:pagechange", (event) => {
    if (event.detail === "grade-slip-complete") {
      if (account && !renderComplete()) returnToGradeSlip();
      return;
    }
    if (event.detail === "grade-slip") {
      resizeProgram();
      submitting = false;
      submitButton.disabled = false;
      showSavedTime();
    } else if (saveTimer !== undefined) saveDraft();
  });
  document.addEventListener("portal:beforelogout", () => {
    if (account && hasDraft) saveDraft();
  });
  document.addEventListener("portal:logout", () => {
    loadAccount(profile.snapshot());
  });
  window.addEventListener("pagehide", () => {
    if (saveTimer !== undefined) saveDraft();
  });

  loadAccount(profile.snapshot());
};
