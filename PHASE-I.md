# Phase I — Staff Profile, Account Settings & Security

## Delivered pages and scope

- `#/staff/profile`: **My Staff Profile**.
- `#/staff/settings`: **Account Settings**, with Account Information, Password &
  Security, Notification Preferences, and Privacy & Preferences.

The existing views, IDs, staff dropdown, settings tabs, theme and account service
are extended rather than replaced with a second authentication/session system.
No Administrator Portal, MFA provider or Phase J optimization project was added.

The profile has initials/header, actual provisioned employee identity, read-only
employment/account-status information, permitted contact/display edits, explicit
Save/Cancel, errors and last actual browser profile-save time. Settings provides
read-only identity/capability lists, current-password reauthentication, supported
in-app preferences, the existing light/dark theme, honest current-session metadata
and sign-out. Unsupported security capabilities are explanatory text, not fake toggles.

## What the inspected repository supported

`PortalAccounts` already provided separate student registration and provisioned
staff authentication, PBKDF2 password hashes, browser credential overrides, a
role/account marker in sessionStorage, refresh restoration and logout. Staff profile
editing was implemented in `js/staff-dashboard.js` but previously allowed autosaving
name/email/position/department/location/hours into the active staff profile.
Some staff reminder toggles saved flags without connected delivery mechanisms.

The application has no connected authentication server, HR account directory,
secure audit store, MFA enrollment or multi-device session directory. The existing
untracked `server/` folder is not a connected account-management backend.

Phases F/G/H have maintainable per-account capability interfaces; earlier operational
modules generally use the shared staff role. Student/staff shells and hash guards
already existed and remain intact.

## Profile ownership, fields and storage

`PortalStaffAccountService` is an owner-scoped facade over the existing account
service and storage keys:

```text
rtu.portal.staffProfile.<encoded-employee-number>
rtu.portal.settings.<encoded-account-number>
```

It does not create another staff identity database. Owner identity comes from the
current validated staff context and the provisioned account, never form-supplied
employee number/role. The service has no arbitrary-other-account edit parameter.

Allowed edits:

- Display name, optional, up to 100 characters; blank falls back to provisioned name.
- Contact number, optional, up to 20 characters, using the existing supported
  phone-format/digit validation.

Employee number, provisioned/legal name, registered email, position, department,
office attributes, role, account status and capabilities are read-only. Unsupported
fields are rejected by the service even when clients remove readonly or manipulate
payloads. The source's actual email is called Registered Email rather than falsely
claiming a verified university address. Missing optional values are Not provided.
Institutional account/HR status is explicitly not connected when unavailable.

Existing legacy full-name edits can be retained as display aliases; legacy email/
employment overrides are ignored for authenticated identity and privileged fields.
Raw prior profile fields are preserved for review when permitted values are saved,
not silently deleted. They cannot grant rights or override provisioned employment.

Profile saves require explicit submission, validate data, use revision checks and
report success only after persistence. Failed/stale saves preserve unsent fields.
Cancel reloads persisted values. Cross-tab changes warn rather than overwrite an
active editor; discard/navigation reloads the latest saved profile. Reload/navigation/
logout warnings protect ordinary unsaved editing. Forced security invalidation
clears access even if unsaved work exists.

## Stable staff identity and historical attribution

The authenticated account retains the real employee identifier and provisioned
attributes. Header/sidebar/profile initials use the current display label, while
read-only account information distinguishes that label from the provisioned name.
`PortalStaffContext.current()` exposes the current display label for future action
snapshots and preserves the stable account number.

Saving a profile never rewrites request history, appointment history, release
snapshots, announcement versions or support messages. Future actions use the new
name snapshot with the same staff ID. Genuine staff assignment names are read from
the same existing profile key; no duplicate staff roster was introduced.

Assigned-processing notices use actual recorded staff IDs in lifecycle history,
not mutable display-name comparisons. Legacy requests without an attributable ID
are not invented as personal tasks. Optional authorized release-staff analytics
group by stable recorded ID; missing IDs remain an unattributed aggregate instead
of being merged by name or leaking request IDs into aggregate labels.

## Password management and policy

The existing `PortalAccounts.authenticate/changePassword` interface is retained.

- Sensitive updates require the active owner and current password.
- New password must differ from current, be nonblank and use 8–128 characters.
  Spaces and Unicode are supported without forced composition rules; hashes preserve
  the exact supplied value rather than trimming passphrases.
- This is the **development application policy**, not an official RTU policy.
  Use long unique passphrases; a production single-factor policy should establish
  a modern sufficiently long minimum (commonly 15+ characters), breached-password
  checks and appropriate provider-supported controls.
- New registration/password-change hashes use PBKDF2-SHA-256 with a fresh 16-byte
  random salt, 600,000 iterations and native Web Crypto. Existing hashes without
  iteration metadata continue to verify with the previous 100,000 iterations.
- Existing long legacy passwords can still authenticate; the new-password maximum
  is not retroactively used to reject previously permitted credentials.
- No plaintext passwords, MFA secrets, password hashes or salts are returned in
  public account/session objects, rendered account information, notifications or URLs.
  Password forms provide accessible visibility controls and clear on navigation/logout.
- Pending updates are locked per account, recheck owner/session and credential
  revision after asynchronous hashing, and do not persist after logout or detected
  concurrent credential changes. Failed storage leaves the old credential intact.
- Corrupt staff credential overrides fail closed rather than silently restoring
  the bundled provisioned credential hash.

Successful changes persist an opaque credential revision and actual change timestamp,
then invalidate the current sign-in. The UI returns to the appropriate login with
Password changed / Sign in again feedback. Detectable same-origin tabs with an old
revision also sign out; this is **not** remote cross-device revocation.

There is no server rate limiting, CSRF protection endpoint or provider reauthentication
token to integrate. Those are production requirements, not claims made by this demo.

## Sessions, restoration and invalidation

The existing `rtu.portal.session` sessionStorage key now stores a versioned demo
record: role/account number, actual recorded sign-in time, absolute expiration and
opaque credential revision. New sign-ins have an **eight-hour development lifetime**,
not an asserted university session policy. Refresh/preference changes do not extend it.

When remember-on-refresh is disabled, the persisted marker is removed but the current
visit remains active in memory until logout/expiration. Re-enabling persistence
stores that same session rather than inventing a new sign-in. If sessionStorage
cannot persist, the current visit can still work and the UI reports actual persistence.

Legacy `staff:<number>` / `student:<number>` markers are recognized for compatibility
only while their legacy credential revision remains valid. They have **no fabricated
sign-in or expiry time**: the UI says Not recorded and explains how signing out/in
creates timed metadata. Versioned password changes prevent old legacy markers from
reviving the account afterward. Production deployment must replace these markers
with provider/server sessions, not rely on this legacy compatibility.

Current staff context and student profile access validate session/revision synchronously.
Routes, sensitive account methods and existing business service checks therefore
reject expired state independently of the UI timer. A short timer refreshes staff
expiration UI; it is not a server-enforced security boundary. Credential storage
events detect same-origin changes. Expired/unavailable/revised sessions clear their
marker and return to the correct role's login with non-sensitive feedback.

Explicit logout is tab-scoped and clears active state. Forced invalidation bypasses
ordinary unsaved-edit cancellation and clears secrets/private module views. There
is no fabricated IP, location, device history, last activity or active-session list.

## Preferences, delivery and theme

Functional staff preferences are stored under the existing settings key and restored
per owner:

1. Document request attention.
2. Assigned Processing / Ready for Pickup tasks with recorded matching staff IDs.
3. Optional routine support updates.
4. Keep sign-in on refresh.
5. Existing light/dark theme.

Updates validate supported boolean keys, preserve older unused flags and confirm
persistence before applying success feedback. Failed writes roll the UI back.
The header theme toggle and settings selector use the same darkMode flag/key;
there is no second theme store or unsupported System-mode promise.

Assignment/reopen and explicitly Urgent ticket notices remain visible under the
declared development policy even if optional support alerts are disabled. Password/
session invalidation always applies and cannot be disabled by notification settings.
Preference filtering does not delete notices or alter operational records.

There are no fake email/SMS/push options. Appointment reminders, staff announcement
approval notifications and office reminder delivery are not connected and are
explained instead of shown as functional toggles. Existing student announcement
preferences retain their meaning; student Profile/Settings layouts are preserved.

Normal preference keys remain compatible. Provisioned employee IDs are reserved
against new public student registration. For a pre-existing student/staff identifier
collision, the shared key helper isolates the legacy student's preferences using
the `.student` suffix; normal student/staff keys stay unchanged. Ambiguous old
shared-key values are not presented as securely verified ownership. Owner-role
markers prevent overwriting explicitly other-role data.

## Routes, permissions and recovery

Staff and student role-specific route guards remain. Staff navigation additionally
delegates announcement/report/support access to their existing capability services;
the account page shows those capabilities read-only. Standard operational modules
retain their existing staff-role model. No new blanket administrative/export/publisher
grant is inferred from position, department, display name or profile fields.

Appointment mutations now validate the active staff context/ID rather than trusting
an actor role argument alone. Student request cancellation/resubmission validates
the actual current owner in addition to the passed actor identity. Backend endpoints
must enforce every corresponding operation; existing client-readable operational
stores cannot provide production isolation against developer tools.

The staff account dropdown displays dynamic name/role and links to My Profile,
Account Settings and Logout. Mouse, Tab/Enter, arrow/Home/End and Escape behavior
are supported without changing the Student account menu.

Recovery remains an honest preview. It resets no password and sends no recovery
email/link/token, with generic guidance that requires a secure provider. Public
staff registration is blocked in the interface and account service. MFA and remote
session management have no fake enrollment/recovery toggles.

## Activity and audit limitations

Current session times, last actual saved profile time and actual recorded password-
change time are displayed only when available. They are not invented account-history
rows or claimed secure audits. No extra browser-local security-log dataset is created.
Secure login/account-change auditing and administrator access require a backend.

## Verification

Dependency-free account/security suite (uses native Node Web Crypto):

```sh
node portal-phase-i-smoke.js
```

Optional real-sign-in browser suite uses externally installed Playwright/Microsoft
Edge, with `PLAYWRIGHT_MODULE` / `BROWSER_CHANNEL` conventions from prior phases:

```sh
node portal-phase-i-browser-smoke.js
```

It creates its own HTTP server and isolated browser context. Credentials are randomly
generated at runtime and installed as test-only hashes; no universal staff password
is added. It authenticates through the actual login form, changes credentials,
verifies the new passphrase and tests two same-origin tabs. `SCREENSHOT_DIR` can
capture to an existing directory. No runtime dependency was added.

Verified Phase I coverage:

- **34 isolated service scenarios:** legacy/current hashing, no secret fields,
  timed/legacy session semantics, owner-scoped profile/prefs, nonprivileged edit
  whitelist, legacy profile handling, validation, revisions, failed writes,
  historical attribution, stable-ID task notices, mandatory notice filtering,
  remember-on-refresh behavior, expiration, current-password/reuse/bounds,
  pending/logout races, credential failures/revisions, stale markers/corruption,
  legacy long-password compatibility, permissions, student isolation and reserved IDs.
- **13 browser scenarios:** real authentication and identity, explicit Save/Cancel/
  unsaved navigation, forged readonly fields, validation/persistence, history
  preservation/future actor labels, keyboard dropdown/settings/theme/session
  controls, preferences/failure rollback/mandatory notices, cross-tab profile
  conflicts, responsive dark mode, password form/toggles, actual password change,
  same-origin session invalidation, expired login, logout and Student Profile/Settings.
- Layouts were checked at **1440, 768 and 390 pixels**; representative screenshots
  were inspected. Password values are never included in those account screenshots.
- All earlier regression suites passed: D **28 service / 15 browser**, E **21 service /
  18 browser**, F **28 service / 17 browser**, G **32 service / 14 browser**, H **43
  service / 19 browser**. Syntax verification passed for **15** changed/new scripts,
  and Git whitespace verification passed.

These prototype checks do not prove institutional authentication, real HR status,
server-enforced expiration, active directory security, production password/MFA
policy, cross-device revocation, rate limiting or CSRF resistance. Formal assistive-
technology review and a backend security assessment remain deployment work.

## Manual acceptance

1. Serve the project via Live Server or `python -m http.server 5500`; use the
   separately provisioned staff credentials. Open My Profile from the dropdown.
2. Verify actual identity and read-only employment. Edit display/contact, test bad
   phone/oversized values, Cancel, then explicitly Save. Confirm header/initials
   update and registered identity/roles remain unchanged after refresh.
3. Leave an edit unsaved, try navigation and cancel the discard prompt. In another
   same-origin tab, save a profile update; verify the first editor keeps its unsaved
   fields and rejects a stale save until Cancel/reload.
4. Check Account Information/capabilities, Notification Preferences, Light/Dark,
   visit-only persistence and actual session metadata. Disable optional alerts and
   verify required support/security outcomes remain active.
5. In Password & Security, test blank/mismatch/current-password failures and visibility
   toggles. With a known disposable test account, save a valid new passphrase; verify
   logout, cleared inputs, old-password failure, new-password success and detectable
   same-origin session invalidation. Do not use real institutional secrets in the demo.
6. Review MFA/audit/remote-session/recovery unavailability text; no nonfunctional
   security action should claim success. Test staff/student route separation and
   existing Student Profile/Settings independently.
7. Perform representative request, appointment, release, records, announcement,
   reporting and support actions. Verify stable staff IDs and original historical
   name snapshots are preserved when the display name changes.

## Requirements before production

- Institutional authentication/SSO with server-enforced ownership, scopes, active
  staff status, profile field policy and administrator provisioning.
- Provider-supported password hashing/policy, reauthentication, breached-password
  protections, rate limiting, secure recovery and CSRF protection as appropriate.
- Secure HttpOnly/Secure/SameSite server sessions, authoritative expiry/rotation,
  session directory/revocation and sensitive-change invalidation across devices.
- Genuine MFA enrollment/verification/recovery through the selected provider.
- Access-controlled profile/preferences persistence, concurrent-update handling,
  immutable security audits, appropriate retention and privacy controls.
- No production account credentials or institutional records in browser-local
  storage. Browser PBKDF2/revision checks do not substitute for server security.

## Phase I files

Created:

- `js/staff-account-service.js`
- `css/staff-account.css`
- `portal-phase-i-smoke.js`
- `portal-phase-i-browser-smoke.js`
- `PHASE-I.md`

Modified:

- `js/accounts.js`
- `js/staff-dashboard.js`
- `js/dashboard.js`
- `js/script.js`
- `js/settings.js`
- `js/notifications.js`
- `js/student-announcements.js`
- `js/support-service.js`
- `js/appointment-service.js`
- `js/request-service.js`
- `js/report-service.js`
- `components/staff-shell.html`
- `pages/staff-profile.html`
- `pages/staff-settings.html`
- `index.html`
- `portal-phase-g-smoke.js`
- `PHASE-G.md`
- `PHASE-H.md`
- `README.md`

Existing uncommitted work from earlier phases is preserved.
