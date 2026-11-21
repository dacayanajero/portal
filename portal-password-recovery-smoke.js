"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const callback = "https://example.org/portal/reset-password.html";
const recovery = "#type=recovery&access_token=sample-access&refresh_token=sample-refresh";
const resetScript = readFileSync("js/reset-password.js", "utf8");
const requestScript = readFileSync("js/accounts.js", "utf8");

test("request uses the sign-in email and the portal subdirectory", async () => {
  let providerError = null;
  const auth = {
    onAuthStateChange() {},
    async resetPasswordForEmail(email, { redirectTo }) {
      assert.equal(email, "student@example.org");
      assert.equal(redirectTo, callback);
      return { error: providerError };
    },
  };
  const window = { location: new URL("https://example.org/portal/index.html?source=test#/services"),
    PortalSupabase: { configured: true, client: { auth } } };
  vm.runInNewContext(requestScript, { window, URL });
  const request = () => window.PortalAccounts.requestPasswordReset(" Student@Example.org ");
  await request();
  providerError = { code: "user_not_found" };
  await request();
  providerError = { status: 429 };
  await assert.rejects(request, /wait a few minutes/);
  providerError = { status: 500 };
  await assert.rejects(request, /unavailable/);
});

test("the Forgot Password form validates email, sends once and displays the acknowledgement", async () => {
  const button = { disabled: false };
  const email = { id: "recovery-email", type: "email", value: "", validity: {},
    setAttribute() {}, focus() {}, checkValidity() { return this.value.includes("@"); } };
  const status = { classList: { add() {}, remove() {} } };
  const form = { elements: { email }, querySelectorAll: () => [email],
    querySelector: (selector) => selector.includes("label") ? { textContent: "Email address" } : button,
    addEventListener(_name, listener) { this.submit = () => listener({ preventDefault() {} }); } };
  const document = { querySelectorAll: () => [], addEventListener() {},
    querySelector(selector) {
      if (selector === "#recovery-form") return form;
      if (selector === "#recovery-status") return status;
      return { addEventListener() {} };
    } };
  let sends = 0;
  let finish;
  const window = { location: { hash: "" }, PortalAccounts: {
    requestPasswordReset(address) {
      sends++;
      assert.equal(address, "student@example.org");
      return new Promise((resolve) => { finish = resolve; });
    },
  } };
  vm.runInNewContext(readFileSync("js/script.js", "utf8"), { window, document });
  window.initializePortalLogin();
  await form.submit();
  assert.equal(sends, 0);
  assert.match(status.textContent, /enter your email address/i);
  email.value = "student@example.org";
  const pending = form.submit();
  await form.submit();
  assert.equal(sends, 1);
  finish();
  await pending;
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /If an account uses this email/);
});

async function openResetPage(hash, { sessionError = null, updateUser, signOut } = {}) {
  const location = new URL(callback + hash);
  const events = {};
  const password = { value: "", focus() {} };
  const confirmation = { value: "", setCustomValidity(message) { this.validationMessage = message; } };
  const button = { disabled: false };
  const form = {
    hidden: true,
    querySelector(selector) {
      return { "#new-password": password, "#confirm-password": confirmation, '[type="submit"]': button }[selector];
    },
    addEventListener(name, listener) { events[name] = listener; },
    reportValidity() { return password.value.length >= 8 && password.value.length <= 128 && !confirmation.validationMessage; },
    reset() { password.value = confirmation.value = ""; },
  };
  const status = { textContent: "", classList: { add() {} } };
  let connections = 0;
  const window = {
    location,
    history: { replaceState(_state, _title, path) { location.href = new URL(path, location).href; } },
    PortalSupabaseConfig: { url: "https://example.invalid", anonKey: "public-test-key" },
    supabase: {
      createClient(_url, _key, options) {
        connections++;
        assert.equal(location.href, callback);
        assert.equal(options.auth.persistSession, false);
        assert.equal(options.auth.detectSessionInUrl, false);
        return { auth: {
          async setSession({ access_token, refresh_token }) {
            assert.equal(access_token, "sample-access");
            assert.equal(refresh_token, "sample-refresh");
            return { data: { session: sessionError ? null : { user: { id: "test-user" } } }, error: sessionError };
          },
          updateUser, signOut,
        } };
      },
    },
  };
  const document = { querySelector(selector) { return selector === "#reset-password-form" ? form : status; } };
  await vm.runInNewContext(resetScript, { window, document, URLSearchParams });
  return { form, status, location, connections, password, confirmation, button,
    submit() { return events.submit({ preventDefault() {} }); } };
}

test("missing, expired and non-recovery links keep the form closed", async () => {
  for (const hash of ["", "#error=access_denied&error_code=otp_expired", recovery.replace("recovery", "signup")]) {
    const page = await openResetPage(hash);
    assert.equal(page.connections, 0);
    assert.equal(page.form.hidden, true);
    assert.equal(page.location.hash, "");
    assert.match(page.status.textContent, /request a new link/);
  }
  const rejected = await openResetPage(recovery, { sessionError: { status: 401 } });
  assert.equal(rejected.form.hidden, true);
  assert.match(rejected.status.textContent, /request a new link/);
});

test("a verified link updates a matching password once and clears the form", async () => {
  let finishUpdate;
  let updates = 0;
  let signOutScope;
  const page = await openResetPage(recovery, {
    updateUser({ password }) {
      updates++;
      assert.equal(password, "a fresh test password");
      return new Promise((resolve) => { finishUpdate = resolve; });
    },
    async signOut({ scope }) { signOutScope = scope; },
  });
  assert.equal(page.form.hidden, false);
  page.password.value = "a fresh test password";
  page.confirmation.value = "mismatch";
  await page.submit();
  assert.equal(updates, 0);
  page.confirmation.value = page.password.value;
  const first = page.submit();
  await page.submit();
  assert.equal(updates, 1);
  finishUpdate({ error: null });
  await first;
  assert.equal(signOutScope, "local");
  assert.equal(page.form.hidden, true);
  assert.equal(page.password.value, "");
  assert.match(page.status.textContent, /Password updated/);
});

test("provider errors allow a retry or ask for a fresh link when the session expires", async () => {
  let error = { code: "same_password", status: 422 };
  const page = await openResetPage(recovery, { async updateUser() { return { error }; } });
  page.password.value = page.confirmation.value = "another test password";
  await page.submit();
  assert.equal(page.form.hidden, false);
  assert.equal(page.button.disabled, false);
  assert.match(page.status.textContent, /different/);
  error = { code: "session_not_found", status: 400 };
  await page.submit();
  assert.equal(page.form.hidden, true);
  assert.match(page.status.textContent, /request a new link/);
});
