# Phase H — Staff Help & Support Management

## Delivered module

Staff: `#/staff/help-support`. Student Help remains `#/help` with its existing
heading, portal shell and assistant entry point.

The staff workspace provides four dynamic cards, an authorized ticket queue with
search/category/status/priority/assignment/submission-date filters, sort/reset,
ten-ticket pagination, conversation details, replies, private notes, assignment,
explicit status actions, preserved resolutions and activity history. FAQ Management
and Knowledge Base & Assistant tabs share the same FAQ service; FAQs have eight-row
pagination, search, category/status filters, editing, preview, publication, archive
and preserved versions.

Student Help provides published FAQ search/accordions, academic-service categories,
the existing assistant, Contact Support, six-ticket My Support Tickets pagination,
conversations/replies/eligible reopening and links to relevant published advisories.
Native dialogs and existing RTU staff cards/tables are reused with responsive,
keyboard-accessible controls, readable messages and light/dark styling.

## What was actually present

Phases A–G use browser-local accounts/profiles, shared requests/appointments, release
snapshots inside requests, shared announcements, staff/student guards and read-only
reporting. No connected backend or institutional support service exists. The
untracked `server/` directory is not a running support API.

The previous Help page had three static FAQ answers, including outdated session-only
request tracking text. The dashboard assistant maintained a separate keyword/answer
table. Announcements had real local read receipts, private request updates lived
inside requests, and the staff header used request attention counts. There was no
ticket or FAQ administration source to reuse.

## Shared data architecture

Two new canonical sources are introduced because those entities did not exist:

```text
rtu.portal.support.tickets.v1
rtu.portal.help.faqs.v1
```

Tickets contain stable UUID IDs, signed-in student identity snapshots, subject,
category, timestamps, current status/priority/assignment, revision, creation token,
public messages, separate internal notes, resolution records, activity and minimal
recipient-scoped notice references. Related requests/appointments are stored as
IDs only and read from existing services, not copied into another dataset.

FAQ records contain question/answer/category/keywords/related service, author and
update metadata, status, revision, current published snapshot, published versions
and activity. The same published snapshot powers student Help and assistant matching.
There is no separate approved-answer runtime table.

Writes fail closed if browser storage is unavailable/full. The UI reports success
only after storage confirms the change. It does not claim an office received a
ticket/reply or that email/SMS was delivered. Same-origin storage events refresh
other tabs; this is not cross-device synchronization.

## Identity, access and permissions

`js/support-config.js` contains deployment-managed prototype capabilities and
central categories/priorities. Ordinary staff default to assigned-ticket viewing,
public replies, internal notes, active-ticket management, FAQ viewing, creation
and own-entry editing. They do not automatically receive publication, assignment,
resolution/closure or all-ticket access.

The existing provisioned demo employee `2020-123456` has explicit management,
assignment, resolution/closure/reopening and FAQ publication/archive grants.
There is no new public publisher/staff registration or password.

Each service operation validates the active role and record ownership/scope, not
just visible buttons. Students can only list/read/reply to their own tickets;
staff with assigned-only scope cannot read unrelated/unassigned conversations.
Publication and archival have separate capabilities. Optional `studentContact`
is required for staff email display and is not granted by default.

Contact Support identity is derived from `PortalProfile` and the signed-in account.
Changing read-only DOM fields or supplying another student number does not change
the recorded owner. Every optional request/appointment reference is checked for
exact current-student ownership. Names are not used as identity keys.

Assignment uses a minimal staff-gated projection of genuine provisioned accounts,
never password hashes/contact details. Configured inactive accounts are excluded,
and eligible assignees must have support viewing/reply capabilities. This remains
a provisioned-account prototype; real staff directory/activity enforcement needs
the institutional backend.

## Ticket workflow and audit

```text
Open → In Progress → Resolved → Closed
            ↕
      Waiting for Student

Resolved → Open (eligible student or authorized staff reopening)
Closed → Open (authorized staff only, when configured)
```

- New inquiries start Open with Normal priority. No keyword assigns urgency.
- Staff replies append to the public conversation; they never automatically resolve
  the ticket or complete an academic request/appointment.
- Waiting for Student requires an explicit staff action. A permitted student reply
  resumes In Progress and records that actual information-received transition.
  Students cannot arbitrarily set privileged staff statuses.
- Resolve requires eligibility and confirmation. Its optional summary is explicitly
  student-visible, separate from the Internal Staff Note control.
- Each resolution is appended, so reopening/re-resolution never overwrites a previous
  summary or timestamp. Closing also requires an eligible explicit confirmation.
- Student reopening is limited to their own Resolved tickets by the configured
  policy. Closed-ticket reopening is a staff capability/configuration decision.

The cards are current exact states: Open only, In Progress only, Resolved only
(excluding Closed), plus Total in the authorized scope. Waiting/Closed and total
unresolved are explained beside the cards. Reopening decreases current Resolved
and increases Open while historical resolution events remain.

Messages/notes/activity are append-only through the API. Stable submission tokens
prevent repeated inquiry/reply retries from creating duplicates. Unchanged
assignment/priority saves do not append duplicate activity. Optimistic revisions
reject stale writes without clearing unsent text. This does not provide atomic
cross-client transactions; the backend must enforce revision/idempotency constraints.

## Private notes and conversation UI

Reply to Student and Internal Staff Note have explicit distinct visibility labels.
Notes are persisted in a separate ticket array. Student projections omit that array,
internal-note audit entries, sender/creation tokens and assignment account IDs.
Staff notes require the note capability. General report projections never include
student messages, internal notes, subjects or identities.

All free text is rendered with safe DOM `textContent`; paragraphs/line breaks are
preserved. HTML, scripts, embeds and JavaScript URLs remain literal text. Subjects
are limited to 160 characters, inquiry/reply bodies to 5,000 and internal notes/
status remarks to 2,000. No ID photos, academic records or passwords are requested.

Unsent conversation text is retained in memory per ticket and response mode, never
copied into a different ticket or persisted as an undocumented draft. Contact form
content survives closing/reopening during the visit; it resets on successful save
or logout. FAQ editors have discard/navigation/reload guards. Rendered private
conversation content is cleared at logout and when ticket access is withdrawn.

## FAQs and trusted bundled guidance

Useful previously public portal instructions are consolidated in
`js/support-knowledge.js`. On a fresh knowledge source, trusted configuration imports
the verified usage guides with a truthful Built-in portal guide (development)
provenance and actual import timestamp. It does not invent student inquiries,
university policies, historical staff approvals or office delivery.

The guides distinguish the actual Grade Slip/Registration Form/ID Printing wizard
flows from TOR/COE request dialogs, explain browser persistence, self-reported
profiles, the recovery preview, appointment independence and new support behavior.
Scheduling hours are explicitly prototype control settings, not official office
hours/capacity. No fees, official processing times, requirements or pickup location
are fabricated.

Set `bundledGuideEnabled: false` before first initialization to start with an empty
knowledge source. This flag does not delete already maintained records. An existing
empty array or archived guide is never silently reseeded. Published guide changes
are subsequently managed through FAQ permissions and versioned publication.

New staff FAQs start as Draft unless an authorized publisher explicitly confirms
publication. Questions/answers/categories/keywords/related services are validated.
Exact normalized duplicate questions are rejected; uncertain matching is handled
conservatively rather than selecting an arbitrary conflicting answer.

Saving working edits to an already Published FAQ keeps its old published snapshot
live. The staff table labels unpublished working changes. Confirmed publication
adds a new version and switches the active snapshot. Archive removes an entry from
student Help and assistant results while preserving versions/history. No ordinary
permanent-delete operation exists.

## Existing assistant integration

The existing assistant dialog, Dashboard entry points, suggested questions and
`PortalAssistant.answer()` interface are preserved. The Registration Form inline
assistant already uses that interface and therefore receives the same updates.

The old independent keyword-answer table is replaced with published FAQ matching.
Questions are normalized for case/whitespace/punctuation and common Grade Slip/
regiform aliases. Known phrases and meaningful title overlap are scored; ambiguous
ties or no reliable match use the explicit safe fallback:

> I couldn't find a reliable answer to that question. You can browse the FAQs or
> submit a support inquiry for additional assistance.

Drafts, unpublished working answers and archived entries never supply responses.
The assistant does not query private student records or fabricate grades/statuses.
It is explicitly labeled keyword-based, not a live generative AI service. Publishing
updates the shared source and subsequent/open assistant answers use that snapshot.

## Cross-module integration

- **Staff Dashboard:** unresolved authorized-queue count, View Open Support Tickets
  shortcut and Manage FAQs & Knowledge shortcut. Existing request cards remain.
- **Requests (B):** linked records are ownership-checked and shown as fresh minimal
  summaries; View Request opens the exact existing Request Management record.
- **Appointments (C):** owned appointment ID/date/time/service/current status are
  displayed; View Appointment opens the exact record. Support does not schedule,
  cancel or complete it.
- **Documents / Student Records (D/E):** their data and workflows remain separate;
  support concerns do not grant grade/profile editing or document-release rights.
- **Announcements (F):** Help links only current published/authorized service,
  maintenance, document or appointment advisories. Private ticket content is never
  copied into a public announcement.
- **Reports (G):** the existing reporting pipeline consumes permission-scoped
  aggregate support statistics and adds Authorized Support Summary CSV. No private
  detailed support export or duplicated analytics service was introduced.

### Support report definitions

Support is a separate date/authorization scope. Document service, request status
and program filters do not apply to support categories. Submission-period tickets
are grouped by current status and category. Recorded resolutions count unique
tickets with an actual resolution in the period, even when subsequently reopened.

Mean first response measures creation to the first public staff reply for tickets
created in the period; internal notes do not count as responses. Mean resolution
measures creation to the latest recorded resolution during the period per eligible
ticket. These are elapsed calendar hours, with valid/excluded counts, no SLA or
satisfaction claim. Missing/invalid/reversed/future timestamp pairs yield N/A when
no valid measurements remain. Report date validation/time parsing is reused.

## Notifications: one adapter, existing sources

`PortalNotifications` is an adapter, not another persisted inbox. It delegates to:

- Existing announcement notices/read receipts.
- Existing current staff request attention.
- Minimal recipient-specific notices stored atomically inside their support ticket.

The existing header buttons now open an accessible in-app notification view with
links to the corresponding original announcement/request/ticket. Existing announcement
pages and private My Request notices remain available. Announcement preferences
control announcement alerts and staff request preferences control request attention;
private support updates remain separate from those unrelated source preferences.

Phase I adds an owner-scoped optional staff support-alert preference. Routine
updates may be hidden, but assignment, reopened-ticket and explicitly Urgent ticket
notices remain visible under the declared development policy. Records and read
receipts are never deleted to implement preference filtering.

Assignment, public staff replies, Waiting for Student, resolution, student replies,
reopening and closure create stable event-linked support notice IDs. Internal notes
do not notify students. Assigned staff receive relevant notices; unassigned work
goes to the authorized support queue, not invented employee identities. Queue read
state is per authorized staff account. Students cannot read/acknowledge someone
else's updates. Refresh/receipt changes do not create duplicate messages/activity.

Notice titles contain generic ticket references, never private message excerpts.
Unavailable providers are identified without discarding healthy announcement
updates. No email, SMS, push or real university delivery is claimed.

## Prototype limitations and production requirements

Browser-local storage is not secure shared university infrastructure. A browser
owner can inspect/tamper with raw local data or forge client context. Role/record
checks demonstrate behavior, not production authorization. Real confidential
support concerns must not be deployed into this prototype store. Cross-device
delivery and secure institution-wide auditing are not connected.

Before deployment:

1. Connect institutional authentication; enforce student ownership, staff assigned/
   queue scopes, active staff eligibility and FAQ publishing permissions server-side.
2. Persist tickets/messages/internal notes/activity/resolutions/notices and FAQ
   snapshots/versions in access-controlled shared tables; send minimal student DTOs.
3. Use transactional writes, unique idempotency keys, optimistic concurrency and
   append-only audits. Protect notes even in internal notifications/logs/exports.
4. Add backend pagination, indexed queue searches, authorized aggregate reporting,
   appropriate rate limiting, abuse protection and account-recovery workflows.
5. Configure institutional routing, approved FAQ content/publication procedures,
   data retention/deletion/access auditing and applicable Philippine privacy controls.
6. Integrate actual notification delivery only when supported and verified. Never
   claim an office received a client-local inquiry based on a browser write.

## Verification

Dependency-free service suite:

```sh
node portal-phase-h-smoke.js
```

Optional browser suite uses externally installed Playwright and installed Microsoft
Edge, with the same `PLAYWRIGHT_MODULE` / `BROWSER_CHANNEL` conventions as earlier
phases:

```sh
node portal-phase-h-browser-smoke.js
```

It starts/closes its own HTTP server and isolated browser, uses synthetic sessions,
random student test passwords and explicit test-only records. It does not touch a
real user browser profile. `SCREENSHOT_DIR` can capture layouts in an existing
directory. No application runtime dependencies were added.

Results:

- **43 service scenarios** cover actual empty tickets, genuine staff assignment,
  signed-in identity, required fields/lengths, owned links, idempotency, role and
  record isolation, internal notes, revisions, lifecycle confirmations, first
  response/resolution metrics, report privacy, notices/receipts, storage failures,
  trusted bundled guidance, matching/fallback, FAQ permissions/drafts/versioning,
  archiving and corrupt-source handling.
- **19 browser scenarios** cover student/staff workflows, search/date filters/sort/
  pagination, actual assignment/priority, safe text, private conversations/notices,
  exact related-record navigation, resolution/reopen/close history, FAQ editing/
  preview/publication/working snapshots, synchronized assistant answers, archival,
  aggregate reporting, Dashboard shortcuts, refresh/logout and no unexpected
  JavaScript page errors.
- Staff/student dark-mode layouts and conversations are checked at **1440, 768 and
  390 pixels**. Representative screenshots were inspected. Native accordion/dialog
  checks wait for actual open/visible content rather than animation timing.
- Regression suites passed: Phase D **28 service / 15 browser**, Phase E **21 service /
  18 browser**, Phase F **28 service / 17 browser**, Phase G **32 service / 14 browser**.
  JavaScript syntax checks passed for **17** changed/new scripts; Git whitespace
  verification passed.

Backend delivery/security/rate limiting, cross-device isolation, real employee
activity, institutional policy approval and concurrent database transactions cannot
be verified by these frontend tests. Formal assistive-technology review and full
field-by-field acceptance of all pre-existing student wizards remain deployment work.

## Manual acceptance

1. Serve with Live Server or `python -m http.server 5500`. Register/sign in as a
   student, open Help, search/expand published FAQs and ask the existing assistant
   known/unknown questions. Verify prototype labels and no official policy claims.
2. Create an inquiry with an optional own request/appointment. Check required
   validation, confirmation text and My Support Tickets. Another student must see
   only their own inquiries and be denied staff support routes.
3. Sign in using provisioned staff credentials. Test queue search/filters/date/sort,
   pagination, assignment to eligible accounts and explicit priority changes.
4. Start In Progress, add an internal note, send a public reply and mark Waiting for
   Student. As the student, verify the note is absent and the private notification
   opens the correct ticket. Reply and confirm resumption of In Progress.
5. Resolve with a student-visible summary, reopen as the student, resolve again and
   confirm closure as staff. Verify previous messages/resolutions remain and related
   document/appointment statuses never change through support actions.
6. Create/preview a FAQ draft. Verify it is absent from public search/assistant.
   Publish with an explicitly permitted account, save working edits without publishing,
   then publish a revision. Compare Help, Knowledge Base and assistant answers.
7. Archive the FAQ and confirm it disappears from active matching while versions
   remain in staff history. Try removing publication capability in a development
   policy copy; service calls must fail as well as the UI hiding the action.
8. Review support aggregates in Reports and optional support CSV; no subjects,
   student identities or private messages/notes should appear. Test Dashboard queue
   count/shortcuts, keyboard controls, light/dark themes and mobile widths.

## Phase H file list

Created:

- `pages/staff-help-support.html`
- `components/support-dialogs.html`
- `css/support.css`
- `js/support-config.js`
- `js/support-knowledge.js`
- `js/support-service.js`
- `js/faq-service.js`
- `js/support-ui.js`
- `js/notifications.js`
- `js/staff-help-support.js`
- `js/student-help.js`
- `portal-phase-h-smoke.js`
- `portal-phase-h-browser-smoke.js`
- `PHASE-H.md`

Modified:

- `index.html`
- `js/accounts.js`
- `js/app.js`
- `js/dashboard.js`
- `js/staff-dashboard.js`
- `js/student-announcements.js`
- `js/report-service.js`
- `js/staff-reports.js`
- `components/dialogs.html`
- `components/staff-shell.html`
- `pages/help.html`
- `pages/staff-dashboard.html`
- `pages/staff-reports.html`
- `PHASE-G.md`
- `README.md`

Existing uncommitted work from earlier phases is preserved.
