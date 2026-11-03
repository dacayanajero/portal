# Phase D — Document Processing & Release

## Implementation and route

Open `#/staff/document-processing` using an existing provisioned staff account.
The page extends the existing HTML/hash-router/vanilla-JavaScript architecture and
uses the shared RTU staff styling, Bootstrap 5.3, light/dark theme, and native dialogs.

Features:

- Four deduplicated, data-driven cards: Awaiting Processing, In Processing,
  Ready for Pickup, Released Documents.
- Processing Queue, Ready for Pickup, and read-only Release History views.
- Request/student search, document/status/assigned-staff filters, date ranges,
  date sorting, empty states, and ten-row pagination. Date boundaries use Manila
  dates; the date column depends on the selected queue.
- Student/document details, related appointment information, persistent preparation
  checks, append-only internal notes, and a timeline of recorded actions.
- Confirmed start/readiness transitions, recorded recipient verification, and
  an explicit actual-handover confirmation before release.
- Minimal CSV export of filtered Phase D release records, only when permission
  is enabled. Exports omit student identifiers, recipient names, internal notes,
  and verification methods and escape spreadsheet formula prefixes.

## Development checklist and official policy configuration

`js/document-processing-config.js` is a deployment-managed policy configuration.
Preparation ships with an enabled, clearly labeled **development checklist**.
Staff can save its checks and mark a Processing request ready after completing
every required item. Identity verification remains **unconfigured**, blocking release.
The checklist entries are examples, not official RTU rules.
There are no invented ID, payment, clearance, signature,
delegation, pickup-location, or retention requirements.

An authorized policy administrator must review official requirements and update
the file through the deployment process:

1. Set a new stable `version` whenever policy/checklist requirements change.
2. Configure each service separately in `services`: set `configured: true`,
   replace example definitions with approved requirements, remove `developmentOnly`
   (or set it to false), and define stable item IDs, labels, and `required` flags. At least one checklist
   definition is required to activate readiness. Configure any required academic
   authorization as a required item; do not use a service operationally before these are known.
3. Set `verification.configured: true` and supply approved `methods` as
   `{ id, label }` objects. Until then verification/release are blocked.
4. Supply any approved `releaseChecks` as `{ id, label }` objects. Each must be
   confirmed during recipient verification.
5. Leave `allowRepresentative: false` until an official delegation policy has
   been established. When enabled, staff may record a permitted representative's
   name and must complete the configured approved verification method and release
   checks. The deployment must first confirm that this minimal information model
   satisfies the actual delegation policy; add approved structured fields if needed.
6. Leave `exportAllowed: false` unless export has been authorized. This prototype
   has a single staff role, so enabling it grants export to that role. Production
   requires an individual server-enforced export permission.

There is no existing administrator role or policy-management backend to reuse.
Policy editing is therefore deployment-managed, rather than an unrestricted
staff settings form. Reload the page after a configuration deployment. Checklist
and verification records store the policy version; older-version confirmations
do not satisfy current checks. Prior verification attempts are retained.

The automated tests inject **test-only** policy definitions in isolated contexts;
these do not enable or modify the checked-in production policy file.

## Shared workflow and audit data

`Approved → Processing → Ready for Pickup → Released`

The existing `PortalRequestService` owns these transitions and enforces the same
rules regardless of which UI invokes it:

- Start requires Approved and a matching active staff context. It records the
  assigned staff, start timestamp, and original shared status history entry.
- Readiness requires Processing and completion of every required preparation item
  under the current configured policy. Checks persist with staff identity and time.
- Release requires Ready for Pickup, recorded recipient verification under the
  current policy, all configured release checks, no previous release, and
  `handoverConfirmed: true`. A legacy `verification: true` checkbox cannot bypass it.
- Rejected, Cancelled, Needs Correction, and already Released requests cannot enter
  document processing. Completing appointments never advances these statuses.
- Every successful transition adds one lifecycle history entry and an in-app
  request notification. Repeated transitions are rejected. Re-saving an unchanged
  checklist value does not add a duplicate event.

Phase D fields are nested in the **same request record**, under
`rtu.portal.requests.v1`:

| Field | Purpose |
| --- | --- |
| `processing.checks` | Current item state, author, timestamp, policy version |
| `processing.notes` | Append-only internal notes; no delete/edit API |
| `processing.events` | Internal checklist, note, and verification audit events |
| `recipientVerification` | Current verification reference and allowed recipient details |
| `recipientVerifications` | Append-only verification snapshots across policy changes |
| `release` | One release snapshot with deterministic `REL-<request-id>` reference |
| `notifications` | Actual processing/readiness/release notices for this request |

Release snapshots record the request/document, copies if recorded, recipient type
and permitted name, releasing staff identity, timestamp, verification reference,
and explicit handover confirmation. They have no edit/delete action. Requests
marked Released by older phases remain visible as legacy records; missing release
or verification information is labeled as missing and is not fabricated. CSV
exports include only actual Phase D release snapshots.

Notes are validated to 1–1,000 characters, safely rendered as text, and kept separate
from public remarks and student lifecycle history. Internal remarks supplied to
Phase D status transitions are not copied into student-visible fields.

## Integration

### Student Portal

My Request keeps its existing layout and progression interface. It now shows
Approved and Released using the shared status names, processing/readiness/release
timestamps, release reference, and per-request in-app notices. It displays actual
appointment status independently of document status.

Student-scoped request access checks the active student's account. The public
projection excludes processing notes/checklists/internal events, identity
verification details, and recipient names. Direct request-detail lookup now uses
the owner-scoped accessor. Browser-local storage itself is still accessible to
the browser owner; these projections are not a security boundary against a
malicious user with developer tools.

### Staff Dashboard and Request Management

- Navigation, page titles, dashboard quick action, and a processing attention badge
  link to Phase D. Existing dashboard statistics and recent requests automatically
  update from `portal:requestschanged` and the shared request source.
- Approved, Processing, and Ready requests in Request Management link directly to
  their Phase D details. Review/approval/rejection and correction remain in Phase B.
- Status definitions, request IDs, and lifecycle history remain shared. There is no
  separate document dataset or new competing lifecycle.

### Appointments

Details show the actual related appointment ID, date, time and status from
`PortalAppointmentService`. Staff can navigate to Appointment Management, and
appointment details can open the related document. A scheduled appointment does
not approve a request; completing/cancelling one does not release/cancel a document.
Phase D does not create appointments or change their statuses.

### Notifications

No general notification-delivery service exists in the current repository.
Phase D therefore stores actual in-app notices with their underlying requests and
shows them in student request details. There is no claimed email/SMS delivery,
background messaging, unread-notification system, or cross-device synchronization.

## Persistence and production boundaries

There is no connected API/database in the inspected application. The existing
untracked `server/` folder contains no connected server implementation. Requests,
including Phase D records, reuse browser `localStorage`. Same-page changes refresh
the existing modules through request events; storage events refresh other same-origin
tabs. The module reports memory-only fallback if browser storage cannot save; such
changes are lost on reload. The session model remains the existing tab-scoped
browser demo login.

Client-side staff-context checks improve prototype behavior but are **not server
authorization**. Browser storage cannot provide secure institutional audit records,
cross-device sharing, multi-tab atomicity, or guarantees against tampering. The
duplicate-release checks cover ordinary same-context clicks/retries and persist
one release per request; simultaneous writes in separate tabs/devices require a
backend transaction and unique database constraint.

Before a university deployment:

- Connect official authentication and server-enforced staff capabilities, request
  ownership, individual export permissions, and a real administrator role.
- Store shared requests, notes, checklists, verification, release snapshots, and
  notifications in an access-controlled database; return public student projections
  from the server, never sensitive fields or other students' requests.
- Validate all transitions and current policy versions server-side. Release must
  atomically compare Ready status, validate recipient verification, write the audit
  event/release snapshot, and update status. Enforce a unique release per request,
  idempotency keys, and optimistic concurrency/version checking.
- Protect immutable audit records and apply institution-approved data retention,
  privacy, timezone, delegation and release requirements. No ID images are stored
  by this implementation.
- Configure approved preparation/verification/export policies. Add official policy
  fields only when requirements are established.
- Add reliable backend in-app delivery and optional email/SMS integrations if
  authorized, and conduct server authorization, concurrency and recovery testing.

## Verification

Run the dependency-free service suite:

```sh
node portal-phase-d-smoke.js
```

The optional browser suite uses Playwright and installed Microsoft Edge. Keep
test dependencies outside the application; no runtime package dependency was added.
Set `PLAYWRIGHT_MODULE` to the externally installed Playwright module path, or use
an environment where `require('playwright')` resolves, then run:

```sh
node portal-phase-d-browser-smoke.js
```

The suite starts/closes its own temporary HTTP server and uses an isolated browser
profile, synthetic browser-local sessions, random student test passwords, and a
test-only policy response. `BROWSER_CHANNEL` can select another installed Chromium
channel. `SCREENSHOT_DIR` optionally saves layout captures to an existing directory.

### Verified results

- **28 service scenarios:** active-staff checks; invalid lifecycle transitions;
  history and timestamps; duplicate start/check/release prevention; unconfigured
  and incomplete checklist gates; persistence and memory-only fallback; note
  validation; student ownership and projections; approved method/recipient/release
  requirement checks; explicit handover; read-only post-release behavior;
  shared statistics; appointment independence; all five service submission types.
- **15 browser scenarios:** staff route restoration; eligible queue and pagination;
  start confirmation; interactive default development checks and required-item readiness gate; safe
  notes; refresh; configured preparation/readiness; verification and handover;
  pickup removal/history/permission-enabled CSV download; date filters/reset;
  dashboard integration; student route guards/own data/progress/notices/privacy;
  existing service page mounting; dark mode and no page overflow at 1440, 768,
  and 390 pixels; no unexpected JavaScript page errors.
- Desktop and mobile dark-mode screenshots were inspected. Syntax and whitespace
  checks are part of the final verification.

These are frontend-prototype results, not proof of physical document handover,
production security, official policy compliance, external delivery, or atomic
multi-client release. The browser suite mounts the existing service wizards and
tests submission types through the shared service; it does not automate every
field/step of all existing student forms. Formal assistive-technology review and
live backend/concurrency/permission tests remain deployment work.

### Manual acceptance walkthrough

1. Serve the repository using Live Server or `python -m http.server 5500`.
2. Register/sign in as a student. Submit an existing Grade Slip, Registration Form,
   or ID Printing request; also exercise TOR and COE requests from the Services page.
3. Sign out, sign in using the separately provisioned staff credentials, and approve
   a request in Request Management. Open its Document Processing shortcut.
4. Confirm Start Processing. Verify the request, dashboard and Phase B counts/status
   update. Add an internal note, refresh, and verify it persists.
5. With the checked-in configuration, confirm that preparation is labeled as a
   development checklist and its checkboxes are enabled while Processing. Official
   deployment requires an authorized policy administrator to replace these examples
   with approved requirements and configure identity-verification methods.
6. Check only some required items: readiness stays disabled. Complete all required
   items, confirm Ready for Pickup, and check the pickup queue and student notice.
7. Confirm that release remains disabled until recipient verification. Select an
   approved configured method, complete configured release requirements and attest
   verification. Representative collection remains unavailable unless configured.
8. Open Release Document. Cancel once; status must remain Ready. Reopen it, leave
   handover unchecked and attempt submission; it must remain Ready. Only confirm
   handover when it has actually happened, then submit the final confirmation.
9. Verify one release snapshot/reference, staff/time/recipient/verification data,
   queue removal, read-only history, shared totals, and disabled duplicate release.
10. Test history search, date boundaries, pagination, and permission-gated CSV export.
11. Complete/cancel a related appointment separately and verify document status is
    unaffected. Verify Phase D never changes appointment status.
12. Sign back in as the requesting student. Check progress, actual status, notice,
    release reference and related appointment. Internal notes and verification
    information must be absent. Another student sees only their own requests;
    student navigation to `#/staff/document-processing` returns to the dashboard.
13. Repeat navigation, keyboard-only dialogs/checklists, Escape/cancel, dark mode,
    and mobile layout checks. Exercise full existing wizard submission flows.

## Files

Created:

- `pages/staff-document-processing.html`
- `css/staff-document-processing.css`
- `js/staff-document-processing.js`
- `js/document-processing-config.js`
- `portal-phase-d-smoke.js`
- `portal-phase-d-browser-smoke.js`
- `PHASE-D.md`

Modified:

- `index.html`
- `js/app.js`
- `js/request-service.js`
- `js/dashboard.js`
- `js/staff-dashboard.js`
- `js/staff-requests.js`
- `js/staff-appointments.js`
- `components/staff-shell.html`
- `components/icons.html`
- `pages/staff-dashboard.html`
- `README.md`
