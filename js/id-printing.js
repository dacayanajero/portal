"use strict";

window.initializeIdPrinting = () => {
  const profile = window.PortalProfile;
  const view = document.querySelector('[data-view="id-printing"]');
  const form = view.querySelector("form");
  const fields = [...form.querySelectorAll("[data-id-field]")];
  const panels = [...form.querySelectorAll("[data-id-panel]")];
  const steps = [...view.querySelectorAll("[data-id-step]")];
  const progress = view.querySelector("progress");
  const progressLabel = view.querySelector("#id-printing-progress-label");
  const backButton = view.querySelector("#id-printing-back");
  const nextButton = view.querySelector("#id-printing-next");
  const submitButton = view.querySelector("#id-printing-submit");
  const consent = view.querySelector("#id-printing-confirm-information");
  const errorMessage = view.querySelector("#id-printing-error");
  const saveMessage = view.querySelector("#id-printing-save-message");
  const dateField = form.elements.appointmentDate;
  const startTimeField = form.elements.appointmentStart;
  const endTimeField = view.querySelector("#id-printing-end-time");
  const timeRangeLabel = view.querySelector("#id-printing-time-range");
  const reviewDate = view.querySelector("#id-printing-review-date");
  const reviewDisclaimer = view.querySelector("#id-printing-review-disclaimer");
  const confirmation = document.querySelector("#id-printing-confirmation");
  const confirmYes = document.querySelector("#id-printing-confirm-yes");
  const confirmNo = document.querySelector("#id-printing-confirm-no");
  const confirmSchedule = document.querySelector("#id-printing-confirmation-schedule");
  const completeContent = document.querySelector("#id-printing-complete-content");
  const completeDate = document.querySelector("#id-printing-complete-date");
  const completeTime = document.querySelector("#id-printing-complete-time");
  const completeReference = document.querySelector("#id-printing-complete-reference");
  const personalNames = ["fullName", "program", "yearLevel", "semester"];
  const legacyNames = new Set(["fullName", "program", "yearLevel", "semester", "academicYear", "requestedSemester"]);
  const limits = { fullName: 100, program: 100, yearLevel: 30, semester: 40, academicYear: 9, requestedSemester: 40, appointmentDate: 10, appointmentStart: 5, notes: 500 };
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

  const year = new Date().getFullYear();
  for (let academicYear = year + 1; academicYear >= year - 8; academicYear -= 1) {
    form.elements.academicYear.add(new Option(`A.Y. ${academicYear}-${academicYear + 1}`, `${academicYear}-${academicYear + 1}`));
  }

  function values() {
    return Object.fromEntries(fields.map((input) => [input.name, (input.name === "program" ? input.value.replace(/\r?\n/g, " ") : input.value).trim()]));
  }

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
    const data = values();
    const date = parseDate(data.appointmentDate);
    const range = timeRange();
    return { ...data, appointmentDateLabel: date?.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) || "", appointmentEnd: range?.end || "", appointmentTimeRange: range?.label || "" };
  }

  function onCompletePage() {
    return document.querySelector("#dashboard-screen").dataset.currentPage === "id-printing-complete";
  }

  function returnToIdPrinting() {
    completeContent.hidden = true;
    window.location.replace(window.PortalRoutes["id-printing"].hash);
  }

  function renderComplete() {
    if (!completedRequest || completedRequest.accountNumber !== account?.accountNumber) return false;
    completeDate.textContent = completedRequest.details.appointmentDateLabel;
    completeDate.dateTime = completedRequest.details.appointmentDate;
    completeTime.textContent = completedRequest.details.appointmentTimeRange;
    completeReference.textContent = `ID Printing · Request ${completedRequest.id}`;
    completeContent.hidden = false;
    return true;
  }

  view.querySelectorAll("[data-id-picker]").forEach((button) => {
    const input = document.getElementById(button.dataset.idPicker);
    if (typeof input.showPicker === "function") input.parentElement.classList.add("has-native-picker");
    button.addEventListener("click", () => {
      updateSchedule();
      input.focus();
      try { input.showPicker?.(); } catch { /* Keyboard entry remains available on the focused input. */ }
    });
  });

  function resizeProgram() {
    if (view.hidden || panels[0].hidden) return;
    const input = form.elements.program;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight + 2}px`;
  }

  function setValue(input, value) {
    if (input.matches("select") && value && ![...input.options].some((option) => option.value === value)) {
      const option = new Option(input.name === "academicYear" ? `A.Y. ${value}` : value, value);
      option.dataset.idProfileOption = "";
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
    const data = requestDetails();
    const date = parseDate(data.appointmentDate);
    const review = {
      ...data,
      studentNumber: account?.accountNumber || "",
      academicYearLabel: data.academicYear ? `A.Y. ${data.academicYear}` : "",
      appointmentMonth: date?.toLocaleDateString(undefined, { month: "long", year: "numeric" }) || "",
      appointmentWeekday: date?.toLocaleDateString(undefined, { weekday: "short" }) || "",
      appointmentDay: date ? String(date.getDate()) : "",
    };
    view.querySelectorAll("[data-id-review]").forEach((element) => {
      element.textContent = review[element.dataset.idReview] || "None";
    });
    consent.checked = false;
    reviewDate.dateTime = data.appointmentDate;
    reviewDate.setAttribute("aria-label", data.appointmentDateLabel || "No printing date selected");
  }

  function showStep(step, focus = false, save = true) {
    const direction = step > currentStep ? 1 : -1;
    currentStep = step;
    clearErrors();
    window.PortalMotion.swap(panels, panels.find((panel) => Number(panel.dataset.idPanel) === step), { direction });
    steps.forEach((button) => {
      const number = Number(button.dataset.idStep);
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
    updateSchedule();
    if (step === 3) renderReview();
    resizeProgram();
    if (save) saveDraft();
    if (focus) panels[step - 1].querySelector("h3").focus();
  }

  function validatePanel(step, mark = true) {
    updateSchedule();
    let firstInvalid = null;
    panels[step - 1].querySelectorAll("[data-id-field]").forEach((input) => {
      input.setCustomValidity("");
      const value = input.value.trim();
      if (input.required && !value) input.setCustomValidity("Complete this field before continuing.");
      if (input.value.length > limits[input.name]) input.setCustomValidity(`Use at most ${limits[input.name]} characters.`);
      if (input.name === "academicYear" && value) {
        const match = /^(\d{4})-(\d{4})$/.exec(value);
        if (!match || Number(match[2]) !== Number(match[1]) + 1) input.setCustomValidity("Choose an academic year with consecutive years.");
      }
      if (input.name === "appointmentDate" && value && (!parseDate(value) || value < dateField.min)) input.setCustomValidity("Choose a printing date today or later.");
      if (input.name === "appointmentStart" && value && !timeRange()) input.setCustomValidity("Choose a start time from 8:00 AM to 4:00 PM so the one-hour printing appointment ends by 5:00 PM.");
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

  function resetFields(snapshot) {
    form.reset();
    form.querySelectorAll("[data-id-profile-option]").forEach((option) => option.remove());
    fields.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
    lastProfile = Object.fromEntries(personalNames.map((name) => [name, snapshot.values[name] || ""]));
    personalNames.forEach((name) => setValue(form.elements[name], lastProfile[name]));
    previousSemester = form.elements.semester.value;
    setValue(form.elements.requestedSemester, previousSemester);
    form.elements.studentNumber.value = account?.accountNumber || "";
    view.querySelectorAll("details").forEach((details) => { details.open = false; });
    updateSchedule();
    clearErrors();
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
    storageKey = account ? `rtu.portal.id-printing.${encodeURIComponent(account.accountNumber)}` : "";
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
          fields.forEach((input) => { if (typeof draft.fields[input.name] === "string") setValue(input, draft.fields[input.name]); });
          previousSemester = form.elements.semester.value;
          step = draft.step;
          if (step > 1 && validatePanel(1, false)) step = 1;
          else if (step > 2 && validatePanel(2, false)) step = 2;
          savedAt = draft.updatedAt;
          hasDraft = true;
        }
      } catch {
        // Use this account's profile when its saved draft is unavailable.
      }
    }
    showStep(step, false, false);
    saveMessage.textContent = "Auto-save ready";
    showSavedTime();
    if (account && !view.hidden && !hasDraft) saveDraft();
    if (account && onCompletePage()) returnToIdPrinting();
  }

  steps.forEach((button) => button.addEventListener("click", () => goToStep(Number(button.dataset.idStep))));
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
      if (input.name === "program") resizeProgram();
      if (input === startTimeField || input === dateField) updateSchedule();
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
    if (!validateThrough(2)) return false;
    if (!consent.checked) {
      if (confirmation.open) confirmation.close("invalid");
      showStep(3, false, false);
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
    let request;
    try {
      request = await window.PortalRequests.create(
      { document: "ID Printing", purpose: "Student ID printing", details: { ...requestDetails(), studentNumber: account.accountNumber } },
      { nextPage: "id-printing-complete", notify: false },
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
    try { window.localStorage.removeItem(storageKey); } catch { /* The request is available for this visit. */ }
    savedAt = null;
    hasDraft = false;
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
    if (changed) {
      clearErrors();
      resizeProgram();
      updateSchedule();
      if (currentStep === 3) renderReview();
      if (!view.hidden || hasDraft) saveDraft();
    }
  });
  document.addEventListener("portal:pagechange", (event) => {
    if (event.detail === "id-printing-complete") {
      if (account && !renderComplete()) returnToIdPrinting();
      return;
    }
    if (event.detail === "id-printing") {
      submitting = false;
      submitButton.disabled = false;
      resizeProgram();
      updateSchedule();
      showSavedTime();
    } else if (saveTimer !== undefined) saveDraft();
  });
  document.addEventListener("portal:beforelogout", () => { if (saveTimer !== undefined) saveDraft(); });
  document.addEventListener("portal:logout", () => loadAccount(profile.snapshot()));
  window.addEventListener("resize", resizeProgram);
  document.addEventListener("portal:layoutchange", resizeProgram);
  window.addEventListener("pagehide", () => { if (saveTimer !== undefined) saveDraft(); });
  loadAccount(profile.snapshot());
};
