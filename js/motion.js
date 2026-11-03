"use strict";

// Motion never defers routing, validation, storage, or focus changes.
window.PortalMotion = (() => {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const running = new Map();
  const easing = "cubic-bezier(.2,.7,.2,1)";

  function stop(element) {
    running.get(element)?.();
  }

  function animate(element, frames, options = {}, cleanup = () => {}) {
    stop(element);
    if (preference.matches || !element.animate) {
      cleanup();
      return;
    }
    const animation = element.animate(frames, { duration: 220, easing, ...options });
    const finish = () => {
      if (running.get(element) !== finish) return;
      running.delete(element);
      animation.cancel();
      cleanup();
    };
    running.set(element, finish);
    animation.finished.then(finish, finish);
  }

  function enter(element, direction = 0) {
    if (!element || element.closest("[hidden]") || !element.getClientRects().length) return;
    animate(element, [
      { opacity: 0, transform: direction ? `translateX(${direction * 10}px)` : "translateY(8px)" },
      { opacity: 1, transform: "translate(0)" },
    ]);
  }

  function leave(element) {
    const parent = element.parentElement;
    const rect = element.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    const inert = element.inert;
    element.inert = true;
    element.style.setProperty("--motion-display", getComputedStyle(element).display);
    element.style.setProperty("--motion-top", `${rect.top - bounds.top + parent.scrollTop - parent.clientTop}px`);
    element.style.setProperty("--motion-left", `${rect.left - bounds.left + parent.scrollLeft - parent.clientLeft}px`);
    element.style.setProperty("--motion-width", `${rect.width}px`);
    element.classList.add("motion-leaving");
    animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 100 }, () => {
      element.classList.remove("motion-leaving");
      ["display", "top", "left", "width"].forEach((name) => element.style.removeProperty(`--motion-${name}`));
      element.inert = inert;
    });
  }

  function swap(elements, target, { direction = 0 } = {}) {
    const list = [...elements];
    list.forEach(stop);
    const previous = list.find((element) => !element.hidden);
    if (previous === target) return;
    const visible = previous && !previous.closest("[hidden]") && previous.getClientRects().length;
    if (!preference.matches && visible) leave(previous);
    list.forEach((element) => { element.hidden = element !== target; });
    enter(target, direction);
  }

  // Keep submenu layout in flow while its height changes, even when semantically hidden.
  function disclose(element, open) {
    if (element.hidden === !open && !running.has(element)) return;
    const height = element.getBoundingClientRect().height;
    stop(element);
    const inert = element.inert;
    element.hidden = !open;
    if (preference.matches || !height && !open) return;
    element.classList.add("motion-disclosing");
    element.inert = !open;
    const fullHeight = element.scrollHeight;
    animate(element, [
      { height: `${height}px`, opacity: height ? 1 : 0 },
      { height: `${open ? fullHeight : 0}px`, opacity: open ? 1 : 0 },
    ], {}, () => {
      element.classList.remove("motion-disclosing");
      element.inert = inert;
    });
  }

  function feedback(element) {
    if (!element || element.disabled || element.closest("[inert]")) return;
    // Individual scale preserves existing transforms, including centered picker buttons.
    animate(element, [{ scale: "1" }, { scale: ".975", offset: .3 }, { scale: "1" }], { duration: 160 });
  }

  function initialize() {
    document.addEventListener("click", (event) => {
      feedback(event.target.closest("button, a[data-page], summary, [role='button']"));
    }, true);
    document.addEventListener("invalid", (event) => {
      animate(event.target, [{ translate: "0" }, { translate: "-3px", offset: .3 }, { translate: "3px", offset: .65 }, { translate: "0" }], { duration: 180 });
    }, true);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        const element = record.target;
        if (record.type === "attributes" && element.getAttribute("aria-invalid") === "true" && record.oldValue !== "true") {
          if (!element.closest("[hidden]")) animate(element, [{ translate: "0" }, { translate: "-3px", offset: .3 }, { translate: "3px", offset: .65 }, { translate: "0" }], { duration: 180 });
        }
        if (record.type === "childList" && element.matches("#registration-chat")) {
          record.addedNodes.forEach((node) => { if (node.nodeType === Node.ELEMENT_NODE) enter(node); });
        } else if (record.type === "childList" && element.matches("#login-status, .dialog-status, .settings-feedback, #assistant-answer")) {
          if (element.textContent.trim()) enter(element);
        }
      });
    });
    observer.observe(document.querySelector("#portal-root"), { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-invalid"], attributeOldValue: true });
    document.querySelector("#dashboard-main").addEventListener("transitionend", (event) => {
      if (event.propertyName === "margin-left") document.dispatchEvent(new Event("portal:layoutchange"));
    });
    document.addEventListener("portal:logout", () => [...running.values()].forEach((finish) => finish()));
  }

  preference.addEventListener("change", () => {
    if (preference.matches) [...running.values()].forEach((finish) => finish());
  });

  return Object.freeze({ initialize, swap, disclose, enter });
})();
