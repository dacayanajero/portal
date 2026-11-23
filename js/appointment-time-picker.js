"use strict";

(() => {
  function attach(input, button) {
    if (input.dataset.appointmentTimePicker) return;
    input.dataset.appointmentTimePicker = "";
    // Native time pickers cannot disable a gap within their min/max range.
    input.readOnly = true;
    const picker = document.createElement("div");
    picker.className = "appointment-time-picker";
    picker.id = `${input.id}-picker`;
    picker.hidden = true;
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", "Choose an appointment start time");
    const hourLabel = document.createElement("label");
    hourLabel.textContent = "Hour";
    const hours = document.createElement("select");
    hours.setAttribute("aria-label", "Appointment hour");
    const minuteLabel = document.createElement("label");
    minuteLabel.textContent = "Minute";
    const minutes = document.createElement("select");
    minutes.setAttribute("aria-label", "Appointment minute");
    const time = (hour, minute) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const available = (value) => value >= input.min && value <= input.max
      && !window.PortalAppointmentService.startOverlapsLunch(value);
    for (let hour = 8; hour <= 16; hour += 1) {
      const option = new Option(`${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}${hour === 12 ? " — Lunch break" : ""}`, String(hour));
      option.disabled = !available(time(hour, 0));
      hours.add(option);
    }
    for (let minute = 0; minute < 60; minute += 1) {
      minutes.add(new Option(String(minute).padStart(2, "0"), String(minute)));
    }
    hourLabel.append(hours);
    minuteLabel.append(minutes);
    const note = document.createElement("p");
    note.textContent = "12:00 PM–1:00 PM is unavailable. Appointments last 1 hour.";
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    picker.append(hourLabel, minuteLabel, note, done);
    input.parentElement.append(picker);
    for (const trigger of [input, button]) {
      trigger.setAttribute("aria-controls", picker.id);
      trigger.setAttribute("aria-expanded", "false");
    }

    function updateMinutes() {
      for (const option of minutes.options) {
        option.disabled = !available(time(Number(hours.value), Number(option.value)));
      }
      if (minutes.selectedOptions[0]?.disabled) minutes.value = "0";
    }

    function close(focus = false) {
      picker.hidden = true;
      input.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-expanded", "false");
      if (focus) input.focus();
    }

    function open() {
      if (input.disabled) return;
      const value = available(input.value) ? input.value : input.min;
      const [hour, minute] = value.split(":").map(Number);
      hours.value = String(hour);
      minutes.value = String(minute);
      updateMinutes();
      picker.hidden = false;
      input.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-expanded", "true");
      hours.focus();
    }

    function commit() {
      const value = time(Number(hours.value), Number(minutes.value));
      if (!available(value)) return;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    hours.addEventListener("change", () => { updateMinutes(); commit(); });
    minutes.addEventListener("change", commit);
    done.addEventListener("click", () => { commit(); close(true); });
    input.addEventListener("click", open);
    button.addEventListener("click", () => picker.hidden ? open() : close(true));
    input.addEventListener("keydown", (event) => {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open();
      }
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!input.parentElement.contains(event.target)) close();
    });
    input.parentElement.addEventListener("focusout", (event) => {
      if (!input.parentElement.contains(event.relatedTarget)) close();
    });
    document.addEventListener("portal:pagechange", () => close());
    document.addEventListener("portal:accountchange", () => close());
  }

  window.PortalAppointmentTimePicker = Object.freeze({ attach });
})();
