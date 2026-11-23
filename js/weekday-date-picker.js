"use strict";

// Shared appointment date picker that only offers Monday-Friday dates.
// Used by the Grade Slip, Registration Form and ID Printing request forms.
(() => {
  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return localDateString(date) === value ? date : null;
  }

  function isWeekend(value) {
    const date = parseDate(value);
    if (!date) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function firstAvailable(value) {
    const date = parseDate(value);
    if (!date) return null;
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    return date;
  }

  function attach(input, button) {
    if (!input || !button || input.dataset.weekdayPickerBound === "true") return;
    input.dataset.weekdayPickerBound = "true";
    const wrapper = button.closest(".grade-slip-picker") || input.parentElement;
    wrapper.classList.add("has-weekday-picker");

    let popup = null;
    let viewYear = 0;
    let viewMonth = 0;
    let lastFocus = null;

    function todayString() {
      return localDateString();
    }

    function minimumString() {
      const min = parseDate(input.min);
      const today = parseDate(todayString());
      if (min && today) return localDateString(min > today ? min : today);
      return input.min || todayString();
    }

    function close(restoreFocus) {
      if (!popup) return;
      popup.remove();
      popup = null;
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
      if (restoreFocus && lastFocus) lastFocus.focus();
    }

    function onOutside(event) {
      if (popup && !popup.contains(event.target) && !button.contains(event.target)) close(false);
    }

    function onKey(event) {
      if (!popup) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    function moveMonth(step) {
      const next = new Date(viewYear, viewMonth + step, 1);
      const min = parseDate(minimumString());
      if (min && (next.getFullYear() < min.getFullYear() || (next.getFullYear() === min.getFullYear() && next.getMonth() < min.getMonth()))) return;
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      render();
    }

    function choose(value) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close(true);
    }

    function render() {
      if (!popup) return;
      popup.replaceChildren();

      const header = document.createElement("div");
      header.className = "weekday-picker-header";

      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "weekday-picker-nav";
      previous.setAttribute("aria-label", "Previous month");
      previous.textContent = "\u2039";
      previous.addEventListener("click", () => moveMonth(-1));

      const title = document.createElement("p");
      title.className = "weekday-picker-title";
      title.setAttribute("aria-live", "polite");
      title.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

      const next = document.createElement("button");
      next.type = "button";
      next.className = "weekday-picker-nav";
      next.setAttribute("aria-label", "Next month");
      next.textContent = "\u203a";
      next.addEventListener("click", () => moveMonth(1));

      const min = firstAvailable(minimumString());
      if (min && (viewYear < min.getFullYear() || (viewYear === min.getFullYear() && viewMonth <= min.getMonth()))) previous.disabled = true;

      header.append(previous, title, next);

      const week = document.createElement("div");
      week.className = "weekday-picker-week";
      week.setAttribute("aria-hidden", "true");
      WEEKDAYS.forEach((label, index) => {
        const cell = document.createElement("span");
        cell.textContent = label;
        if (index === 0 || index === 6) cell.className = "is-weekend";
        week.append(cell);
      });

      const grid = document.createElement("div");
      grid.className = "weekday-picker-grid";
      grid.setAttribute("role", "grid");
      const first = new Date(viewYear, viewMonth, 1);
      const startOffset = first.getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const selected = input.value;
      const today = todayString();
      const minString = minimumString();

      for (let blank = 0; blank < startOffset; blank += 1) {
        const spacer = document.createElement("span");
        spacer.className = "weekday-picker-spacer";
        grid.append(spacer);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(viewYear, viewMonth, day);
        const value = localDateString(date);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        const disabled = weekend || value < minString;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "weekday-picker-day";
        cell.textContent = String(day);
        cell.dataset.date = value;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
        if (weekend) cell.classList.add("is-weekend");
        if (value === today) cell.classList.add("is-today");
        if (value === selected) {
          cell.classList.add("is-selected");
          cell.setAttribute("aria-current", "date");
        }
        if (disabled) {
          cell.disabled = true;
          cell.setAttribute("aria-disabled", "true");
        } else {
          cell.addEventListener("click", () => choose(value));
        }
        grid.append(cell);
      }

      const footer = document.createElement("p");
      footer.className = "weekday-picker-note";
      footer.textContent = "Appointments are available Monday-Friday only.";

      popup.append(header, week, grid, footer);
    }

    function open() {
      if (popup) return;
      const selected = parseDate(input.value);
      const min = firstAvailable(minimumString());
      const start = (selected && min && selected >= min ? selected : null) || min || selected || new Date();
      viewYear = start.getFullYear();
      viewMonth = start.getMonth();
      lastFocus = document.activeElement;
      popup = document.createElement("div");
      popup.className = "weekday-picker";
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", "Choose an appointment date");
      wrapper.append(popup);
      render();
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onKey, true);
      const focusTarget = popup.querySelector(".weekday-picker-day.is-selected:not(:disabled)")
        || popup.querySelector(".weekday-picker-day:not(:disabled)");
      focusTarget?.focus();
    }

    button.addEventListener("click", () => {
      if (popup) close(false);
      else open();
    });
    document.addEventListener("portal:pagechange", () => close(false));
  }

  window.PortalWeekdayDatePicker = Object.freeze({ attach, isWeekend, parseDate, localDateString });
})();
