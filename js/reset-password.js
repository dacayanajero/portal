"use strict";

(async () => {
  const form = document.querySelector("#reset-password-form");
  const status = document.querySelector("#reset-status");
  const invalidLink = "This reset link is invalid or has expired. Return to sign in and request a new link.";
  const verificationFailed = "We couldn't verify your reset link. Check your connection and reopen the link from your email.";
  const link = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, "", window.location.pathname);
  if (link.get("type") !== "recovery" || link.has("error") || !link.get("access_token") || !link.get("refresh_token")) {
    status.textContent = invalidLink;
    return;
  }

  // Keep this email link's session in memory, separate from any student or staff login in this browser.
  let auth;
  try {
    const config = window.PortalSupabaseConfig;
    auth = window.supabase.createClient(config.url, config.anonKey, {
      auth: { storageKey: "rtu-portal-recovery", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).auth;
    const { data, error } = await auth.setSession({
      access_token: link.get("access_token"),
      refresh_token: link.get("refresh_token"),
    });
    if (error || !data?.session?.user) {
      status.textContent = error && (!error.status || error.status >= 500) ? verificationFailed : invalidLink;
      return;
    }
  } catch {
    status.textContent = verificationFailed;
    return;
  }

  const password = form.querySelector("#new-password");
  const confirmation = form.querySelector("#confirm-password");
  const button = form.querySelector('[type="submit"]');
  form.addEventListener("input", () => {
    confirmation.setCustomValidity("");
    status.textContent = "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || form.hidden) return;
    confirmation.setCustomValidity(password.value === confirmation.value ? "" : "The passwords must match.");
    if (!form.reportValidity()) return;
    button.disabled = true;
    password.readOnly = confirmation.readOnly = true;
    status.textContent = "Updating your password…";
    try {
      const { error } = await auth.updateUser({ password: password.value });
      if (error) {
        if (error.status === 401 || error.status === 403 || error.code === "session_not_found") {
          form.reset();
          form.hidden = true;
          status.textContent = invalidLink;
        } else if (error.code === "same_password") {
          status.textContent = "Choose a password different from your previous password.";
        } else if (error.code === "weak_password") {
          status.textContent = error.message;
        } else {
          status.textContent = "We couldn't update your password. Please try again.";
        }
        return;
      }
      form.reset();
      form.hidden = true;
      status.classList.add("is-success");
      status.textContent = "Password updated. Return to sign in with your new password.";
    } catch {
      status.textContent = "We couldn't update your password. Check your connection and try again.";
      return;
    } finally {
      button.disabled = false;
      password.readOnly = confirmation.readOnly = false;
    }
    // The password change has already succeeded even if cleanup loses its connection.
    try { await auth.signOut({ scope: "local" }); } catch { /* This session is memory-only. */ }
  });
  status.textContent = "";
  form.hidden = false;
  password.focus();
})();
