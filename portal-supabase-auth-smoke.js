"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
let activeProfile = {
  id: "student-uuid", role: "student", is_active: true,
  account_number: "TEST-100", full_name: "Test Student",
  contact_email: "student@example.com", college: "ICS", program: "BSIT"
};
const staff = { ...activeProfile, id: "staff-uuid", role: "staff",
  account_number: "STAFF-100", contact_email: "staff@example.com" };
let activeSession = null;
let signups = 0;
let signouts = 0;
let authCallback;
const client = {
  auth: {
    onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: activeSession }, error: null }; },
    async signOut() { signouts++; activeSession = null; authCallback?.("SIGNED_OUT", null); return { error: null }; },
    async getUser() { return { data: { user: { email: activeProfile.contact_email } }, error: null }; },
    async signInWithPassword() { activeSession = { expires_at: expiresAt }; return { error: null }; },
    async updateUser() { return { data: {}, error: null }; }
  },
  from(table) {
    assert.equal(table, "profiles");
    return { select() { return this; }, eq() { return this; },
      order() { return this; },
      async limit() { return { data: [activeProfile, staff], error: null }; }
    };
  }
};
const context = {
  window: {
    PortalSupabase: { configured: true, client },
    PortalSupabaseApi: {
      async signUpStudent() { signups++; return { needsEmailConfirmation: true }; },
      async signIn() { activeSession = { expires_at: expiresAt }; return activeProfile; },
      async profile() { return activeProfile; }
    }
  },
  document: { dispatchEvent() {} },
  Event: class { constructor(type) { this.type = type; } },
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } },
  console, Date, Promise
};
vm.runInNewContext(fs.readFileSync("js/accounts.js", "utf8"), context);
const accounts = context.window.PortalAccounts;
(async () => {
  await accounts.register({ accountNumber: "TEST-100", fullName: "Test Student",
    email: "student@example.com", password: "safe-test-password", role: "student" });
  assert.equal(signups, 1);
  await assert.rejects(() => accounts.register({ role: "staff" }), /restricted/i);
  const account = await accounts.authenticate("student@example.com", "safe-test-password", "student");
  assert.equal(account.role, "student");
  assert.equal(accounts.saveSession(account).accountNumber, "TEST-100");
  assert.equal(accounts.isSessionValid(account), true);
  await accounts.clearSession();
  assert.equal(accounts.isSessionValid(account), false);
  activeProfile = staff;
  activeSession = { expires_at: expiresAt };
  const restored = await accounts.restoreSession();
  assert.equal(restored.role, "staff");
  assert.equal(accounts.staffIdentity().accountNumber, "STAFF-100");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(accounts.listStaff().some(x => x.accountNumber === "STAFF-100"));
  await accounts.clearSession();
  assert.ok(signouts >= 2);
  console.log("PASS Supabase auth registration, login, role checks, session restoration and sign-out.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
