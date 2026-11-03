# Phase E — Staff Student Records Management

## Delivered workspace

- Directory: `#/staff/student-records`.
- Student details: `#/staff/student-records/<encoded-student-number>`.
- Backward-compatible aliases: `#/staff/records` and its student-detail suffix.
- The route retains the existing internal `staff-records` view key and file,
  `pages/staff-records.html`, so existing sidebar/dashboard controls keep working.

The workspace provides four dynamic overview cards, directory search, program/year/
semester filters, sorting, ten-student pagination, read-only student details, and
five keyboard-accessible sections: Personal Information, Academic & Enrollment
Information, Document Request History, Appointment History, and Document Release
History. Each history has independent eight-record pagination. The activity timeline
shows the latest 50 actual lifecycle events; complete source histories remain in
their history sections and originating modules.

The interface reuses the existing staff shell, hash router, blue/light-blue/white/
gold palette, Bootstrap 5.3, icons, staff summary cards, theme, and responsive table
patterns. Tables scroll within their labeled keyboard-focusable regions instead
of creating horizontal page overflow. Directory and detail errors, empty states,
read status announcements, and busy semantics are included.

## What the repository actually contained

Phases A–D use browser-local accounts, student profiles, shared requests and
appointments. Phase D stores preparation and release snapshots within request
records. There is no connected backend or authoritative enrollment database.
The untracked `server/` folder is not a connected application service.

The former staff records lookup combined a hardcoded six-student roster with
registered accounts, labeled accounts as Enrolled, and did not load saved profile
edits. Phase E replaces that lookup with the real saved-account projection; it
does not alter the Student Portal layout or existing student profile editor.

Existing announcements behavior is preserved; no Phase F work was introduced.

## Source, identity, and statistics

`PortalStudentRecordService` is a **read-only projection**, not a new persisted
student dataset. Its core operations are `search(options)` and `get(studentNumber)`.
Both require an active staff context on every call, including individual lookups.
Phase G also uses the staff-gated `reportingAttributes()` projection, which returns
only student identifiers and self-reported programs, without profile names/contact data.

1. `PortalAccounts.listRegisteredStudents()` returns a staff-gated public projection
   of actual saved student accounts under `rtu.portal.accounts`. Passwords and
   password hashes are never returned. The older seeded account-list API remains
   compatible with existing callers but is not used by Phase E.
2. Existing account-specific profiles under
   `rtu.portal.profile.<encoded-student-number>` supply whitelisted display values:
   full name, email, program, year level, semester, and the actual profile-save time.
   Phone numbers and addresses are not included in the staff projection.
3. Saved profile fields take precedence over registration fields, with provenance
   shown. Missing values appear as Not provided. Malformed/unavailable profiles
   fall back to registration fields and show an availability explanation.
4. Students are deduplicated strictly by the existing account/student number,
   never by their names. Only accounts represented in this source appear in the
   directory. An orphan/legacy request does not create a synthetic student account;
   its student-record link shows an unavailable-source message if no account exists.
5. Requests and appointments come from their existing shared services. There is
   no separate student request, appointment, processing, or release store.

The global overview cards count:

| Card | Actual calculation |
| --- | --- |
| Total Students | Unique account identifiers in the directory source |
| Students With Active Requests | Unique known students with a shared request for which the existing `isActive` returns true |
| Students With Upcoming Appointments | Unique known students with Pending Confirmation, Scheduled, or Checked In appointments whose start is in the future, using Manila time |
| Students With Released Documents | Unique known students with at least one shared request in Released status, including explicitly labeled legacy release records |

Statistics are global to this authorized local source, not the current search
page. Directory rows show the actual number of active requests. Shared request/
appointment events refresh the workspace while it is open. Browser storage events
also refresh account/profile information changed in another same-origin tab.
Errors reading account/history sources display an unavailable workspace rather
than fabricated zero counts. A genuinely empty source shows zeros and an empty state.

## Search and filters

- Search covers student number, full name, and program.
- Search ignores case, leading/trailing whitespace, and repeated whitespace.
- Program, year-level and semester filters combine with search and each other.
- Dropdown values come from available saved profiles. Missing optional values
  are not presented as invented programs/semesters.
- Name and student-number sorting are stable, with student number as a tie breaker.
- Changing filters resets pagination; search results clamp out-of-range pages.
- Clear Filters restores the directory. Form/filter state stays mounted during
  in-session navigation and is reset at logout.

No authoritative enrollment status source exists, so there is no misleading
Verified/Enrolled filter. The API is shaped for future server-side pagination,
but current filtering operates on data already stored locally in this demo.

## Personal, academic, and verification handling

Personal and academic fields are **self-reported**, not registrar-verified.
The Academic & Enrollment section explicitly says:

> Official enrollment verification is not connected.

There are no invented grades, GPA/GWA, courses, transcript rows, academic standing,
academic-year enrollment claims, graduation eligibility, or verification dates.
The actual profile-save timestamp is labeled as a save time, not a verification.

Information review distinguishes Profile Information Available from Additional
Information Needed based on display-field completeness, and always states Pending
Official Verification. It explains that this check is neither official verification
nor a new university processing requirement. Verification procedures have not been
configured in an authoritative system, so the interface is read-only and has no
button that can claim official verification.

For discrepancies, staff can open the relevant submitted request and use Phase B's
existing correction workflow when its current status permits. The module never
silently modifies student profiles, approvals, or unrelated records. Students
continue editing their own profiles through the existing My Profile/Settings flow.

## Histories and cross-module integration

### Requests — Phase B

The selected student's exact identifier filters the shared request list. It shows
request ID, document type, submitted time, purpose, current shared status, and real
lifecycle history. View Request opens the corresponding Request Management dialog.
Eligible approved/processing/ready requests also have a direct View Processing shortcut.
That dialog can open the student's record and retain an in-session return link to
the original request. The existing review/correction/approval permissions remain.

### Appointments — Phase C

History uses the actual student's appointments, including cancelled/completed
appointments and recorded rescheduling events. Current date/time, status, booking
date, related request and service are shown. Future active appointments are labeled
Upcoming. Appointment details can open the student's record, and records can open
the exact appointment through a route-ready navigation intent.

### Processing and release — Phase D

Release history reads the existing `request.release` snapshots; it does not create
or edit releases. It shows release reference, request, document, copies when known,
release time, releasing staff and recipient type. Recipient names, verification
references/methods, ID credentials and internal processing notes are excluded from
the Phase E projection. Older Released requests without Phase D snapshots are
clearly labeled Legacy with missing fields left unrecorded.

View Release Record opens the existing Phase D read-only release detail. Document
details can open the requesting student's record and display that request snapshots
are student-entered, not official enrollment evidence. Readiness/release still
require the existing Phase D checks and handover workflow.

### Quick actions and context

- View Active Requests opens Phase B with an exact student-ID and active-status scope.
- View Appointments opens Phase C with an exact student scope for its list/calendar.
- View Released Documents opens Phase D Release History with an exact student scope.
- Review Available Enrollment Information selects the academic section.

Each originating module displays its scope and offers its existing Reset/Clear
Filters action to return to all records. No substring matching is used to associate
students. Request/appointment/document origin references are in-memory navigation
state, not new persisted records, and are cleared at logout. Refresh preserves the
student detail URL but does not promise to preserve an originating dialog reference.

The timeline projects existing request/appointment lifecycle histories once each,
with real timestamps and references. It does not fabricate account-created events
when the account source lacks a creation timestamp, or duplicate release snapshots
as extra release events. Internal preparation/identity audit events are excluded.

## Permissions, persistence, and production limitations

The module reuses the existing staff role and tab-scoped session. Student navigation
to either a directory or individual staff record is redirected to the student
dashboard. The records service and new saved-account accessor also check the active
staff role; hiding navigation alone is not the only prototype access check.

The interface is read-only. There is no editing API, bulk export, official
verification mutation, account administration, grade editing or document release
operation in Phase E. Profile changes do not overwrite historical request/release
snapshots. Staff-rendered record panels are cleared at logout.

This remains a **development-only browser-local prototype**. Client-side guards and
public projections do not provide production security against developer tools,
forged client state, or browser-storage access. It does not provide secure
cross-device access, an official registrar database, or institution-wide audit
guarantees. Sensitive official university records must not be loaded into this
prototype storage. There is no new database or backend migration in this phase.

Before production:

1. Reuse/connect institutional authentication and enforce staff capabilities and
   individual-record authorization on every server endpoint. Return only fields
   necessary for the staff member's assigned responsibility.
2. Integrate the authoritative student/enrollment source and identify provenance,
   last verification, evidence references, and approved verification procedures.
   Keep staff record modification in a separately authorized audited workflow.
3. Implement indexed server-side student search and pagination, stable student IDs
   and foreign keys to existing request/appointment/release tables. Use safe,
   parameterized queries; avoid an unrestricted browser dump of university records.
4. Apply institution-approved access auditing, retention, privacy controls and data
   minimization under applicable Philippine privacy requirements. Configure any
   future exports separately and authorize them server-side.
5. Verify server authorization, student isolation, database recovery, cross-device
   consistency and concurrent updates. These cannot be proven by browser-local tests.

## Testing

Dependency-free service tests:

```sh
node portal-phase-e-smoke.js
```

Optional isolated browser tests use externally installed Playwright and Microsoft
Edge, as in Phase D. Set `PLAYWRIGHT_MODULE` to an external Playwright module path
when it is not available through Node resolution, then run:

```sh
node portal-phase-e-browser-smoke.js
```

No runtime dependencies were added. The browser test starts and closes its own HTTP
server and isolated browser, registers synthetic test students with random passwords,
uses synthetic prototype staff sessions, and restores default policy after creating
release fixtures. `BROWSER_CHANNEL` selects another installed Chromium channel;
`SCREENSHOT_DIR` optionally saves screenshots to an existing directory.

### Verified

- **21 Phase E service scenarios:** actual empty source, projection privacy, saved
  profiles/provenance, all search types, combined filters, sorting/pagination,
  identifier deduplication, same-name separation, missing/malformed profiles,
  exact history ownership, unique-student totals, rescheduling/cancellation,
  release projection, real timeline, historical snapshot preservation,
  read-only behavior, staff guards, unavailable-source errors and preservation of
  missing appointment audit timestamps as unavailable rather than invented activity.
- **18 Phase E browser scenarios:** authorized/legacy routes, zero state, unique
  statistics, pagination/search/filters/sorting, read-only details, academic
  provenance, keyboard tabs, request history pagination and return context,
  appointment rescheduling and navigation, Phase D release integration, exact
  student-scoped quick actions, direct detail refresh, missing/incomplete profiles,
  dashboard navigation, student route/service guards, real student profile editing,
  historical snapshot preservation, no unexpected JavaScript page errors.
- Directory/details dark mode and horizontal page overflow were checked at
  **1440, 768 and 390 pixels**; representative screenshots were inspected.
- Existing **28 Phase D service scenarios and 15 Phase D browser scenarios** passed
  after initial Phase E integration, covering earlier document/appointment lifecycle,
  student ownership, service entry pages and release safeguards.

These are prototype tests, not server security/privacy certification. Existing
service forms retain their implementation; Phase D checks their route mounting
and shared submission types, not every field and wizard step. Formal assistive-
technology review, full student-form acceptance and backend/cross-device testing
remain deployment work.

### Manual acceptance checklist

1. Serve the project with Live Server or `python -m http.server 5500`.
2. Register two students, update one student's My Profile, and submit document
   requests using the existing service forms or the TOR/COE controls on the Services page.
3. Sign in with the separately provisioned staff account and select Student Records
   from the sidebar or Staff Dashboard. Confirm only saved accounts appear and no
   registration is labeled officially enrolled.
4. Search by number/name/program, combine program/year/semester filters, sort,
   clear filters, and exercise pagination with more than ten accounts.
5. Open a record; check saved-profile provenance, missing fields and the explicit
   enrollment-source message. Verify there are no profile/grade editing controls.
6. Check each history belongs to the exact selected student. Expand lifecycle
   history, review rescheduling/cancellation, and compare current module statuses.
7. Open a request, appointment and release; use View Student Record and its return
   link to confirm the original identifier/reference is preserved.
8. Exercise all quick actions and their Reset/Clear Filters controls. Confirm no
   unrelated student's rows appear in the scoped module results.
9. Refresh an individual student URL. Try an unavailable student identifier and
   confirm an unavailable message without another student's profile appearing.
10. Sign in as a student and try the directory and another student's staff-detail
    URL. Verify redirection and that My Request still shows only their requests.
11. Edit My Profile as the student, return as staff, and verify current profile
    values update while historical request/release snapshots remain unchanged.
12. Repeat with keyboard navigation, dark/light modes and mobile widths. Run full
    existing Grade Slip, Registration Form, ID Printing, TOR and COE submissions.

## Phase E file list

Created:

- `js/student-record-service.js`
- `js/staff-student-records.js`
- `css/staff-student-records.css`
- `portal-phase-e-smoke.js`
- `portal-phase-e-browser-smoke.js`
- `PHASE-E.md`

Modified:

- `pages/staff-records.html`
- `js/accounts.js`
- `js/app.js`
- `js/staff-dashboard.js`
- `js/staff-requests.js`
- `js/staff-appointments.js`
- `js/staff-document-processing.js`
- `components/staff-shell.html`
- `index.html`
- `README.md`

Pre-existing uncommitted Phase D files remain part of the working tree. No commit
or push was created by this implementation.
