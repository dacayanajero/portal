# Phase F — Staff Announcements Management

## Completed module

Staff route: `#/staff/announcements`. The existing route/view is extended with
management and archive sections, overview cards, search/category/status/audience/
date filters, sorting, eight-record pagination, details, an accessible editor,
student-style preview, confirmations, publication history and preserved versions.
The editor uses native dialogs within the existing hash architecture rather than
requiring a separate create route.

The existing Student Announcements page now displays the shared published feed.
A small Latest Announcements section shows up to three visible notices on the
Student Dashboard, with details and View All navigation. It is hidden when empty.
Existing staff sidebar and Dashboard announcement actions open management.

The page uses the existing RTU palette, staff cards/tables, Bootstrap 5.3, safe local
renderers, native modal focus behavior, dark theme and responsive scrolling tables.

## Actual architecture and source migration

The inspected application has browser-local authentication, profiles, requests,
appointments and release records; there is no connected backend/database or scheduler.
Previously the staff workspace stored simple announcement objects and seeded sample
office policies. The Student Announcements page had unrelated static welcome text.
The student header's notification count was a hardcoded 1, not a notification inbox.

`PortalAnnouncementService` now reuses the existing key:

```text
rtu.portal.staff.announcements
```

It is the single announcement source for both portals. There is no second student
announcement dataset. New records use stable UUID-based `ANN-...` identifiers and
contain status, content, category, audience, priority, author identity, timestamps,
revision, scheduling/expiry fields, published snapshot, published versions, notice
reference and append-only action history.

Legacy saved records retain their IDs, original content, author/timestamps when
available and complete original object under `legacy`. They migrate to Draft,
because the old source contained no publication authorization/version metadata.
They are not automatically published or counted as official notices. Former Staff
or unsupported audiences require an explicit supported audience selection before
publication. No sample announcements or university policies are generated.

Mutations write browser storage before announcing success. Storage failure throws
an error; publication is not reported as saved and does not fall back to an
unreliable memory-only publication. Invalid/duplicate source data fails closed.

## Publishing permissions and configuration

`js/announcement-config.js` is a deployment-managed **development** policy:

- Default staff: `view`, `create`, `editOwnDrafts`.
- The existing provisioned demo employee `2020-123456` has an explicit grant for
  `view`, `create`, `editOwnDrafts`, `editAny`, `review`, `approve`, `publish`, `archive`.
- The general staff role does not automatically grant publication/archive rights.
- No publisher registration, password, account administrator or bulk export was added.

Capabilities are checked by service methods on every staff operation, including
direct calls; hiding UI controls is not the only prototype permission check.
Author IDs come from the active staff context, not form-supplied identity fields.

The configurable category list contains suggested classifications, not asserted
official RTU categories. Priorities are explicitly selectable Normal/Important/Urgent;
priority never overrides publishing permissions.

Only **All Students** general notices are supported. The service rejects program,
year-level or other targeted audiences even if a client supplies them directly.
There is no secure authoritative group-filtering backend, so targeted controls
are not offered and no student directory data is loaded into the editor.

### Optional approval policy

No university approval procedure exists in the current repository, so
`approvalRequired` defaults to false. The service also supports the guarded draft
workflow when explicitly configured:

```text
Draft → Pending Approval → Approved for Publication → Scheduled / Published
                       ↘ Rejected → Draft / resubmission
```

Review/approval capabilities are checked. `separateApprover` can disallow author
self-approval. Approval binds the core content version; changing approved content
requires reapproval. A scheduled approved version remains approval-bound when due.

Published revisions work directly in the default authorized-publisher policy.
When approval is required, direct revisions of Published records are blocked rather
than bypassing review. A production approved-revision workflow with a separately
reviewed working copy of a live publication remains configuration/backend work;
an authorized separately reviewed new draft can be used without overwriting the
original publication. Do not enable an institutional approval policy before its
full revision and reviewer responsibilities are established.

## Creation, editing, preview and confirmation

- Title/content/category/audience/priority are required. Title is limited to 120
  characters, content to 10,000; category/audience/priority must be configured values.
- Content is accessible **plain text**. Paragraphs and line breaks are preserved.
  HTML, Markdown syntax and URLs are literal text, not executable markup or links.
  No rich-text framework, arbitrary embeds or generated attachments were introduced.
- Both staff preview and student cards use `PortalAnnouncementUI` and safe DOM
  `textContent`. Scripts, event handlers and `javascript:` URLs never become elements.
- Save as Draft never publishes. Drafts can be reopened and edited according to
  ownership/capability; archived records and pending-review records are locked.
- Preview makes no data/status changes and returns to the same editor.
- Published content requires Publish Revision and a final confirmation; prior
  published snapshots and the original publication timestamp remain intact.
- A repeated creation token returns the existing successful record. Existing-record
  edits use optimistic revision checks; stale editor content is preserved with an
  error instead of silently overwriting another edit. Unchanged republication is rejected.

Unsaved input stays in the mounted editor during validation errors, preview and
cancelled navigation. Closing, browser Back/hash navigation, logout and reload have
unsaved-change guards. Draft persistence is explicit; no automatic publication or
undocumented draft autosave occurs. Native browser reload prompts depend on browser
interaction/prompt rules, so save a draft before leaving when persistence is needed.

## Scheduling and expiration

Date/time controls are explicitly Asia/Manila. Conversion stores ISO timestamps
with timezone information in UTC. Invalid calendar dates, timezone-free service
timestamps, past schedules and expiration at/before publication are rejected.

Scheduling requires publication capability and explicit confirmation. Authorized
users may confirm schedule changes or cancel publication separately, returning the
record to Draft. Scheduled records cannot be published before their due time;
cancel/reschedule first if publication timing changes.

**There is no automatic browser-local publisher.** Crossing the scheduled time leaves
the record Scheduled and hidden from students until an authorized user selects
Publish Due Announcement and confirms. Future scheduled records contribute to the
Scheduled statistic; overdue records are separately labeled as awaiting staff action.
Thirty-second UI refreshes update visibility/due indicators only, never publication.

Expired Published records are hidden from the active feed and current-published
count, but remain in staff management with their history. Expiration does not create
a fictional audit event or silently archive/delete the source record.

## Archiving, history and versions

Archive requires explicit confirmation and the archive capability. It records the
staff member and time, hides the notice from the active student feed, and keeps it
in the Staff Archive section. Scheduled publication must be cancelled separately
before archiving. There is no ordinary permanent-delete operation.

Actual creation, editing, scheduling/cancellation, optional approval/rejection,
publication/revision and archiving actions retain staff identity, timestamps and
previous/new statuses. Published content versions are append-only through the API
and available read-only in details. Student projections omit history, internal
remarks, creation tokens and publisher account identifiers.

## Student feed and notifications

The service checks the active student context. Only valid Published snapshots for
All Students, already published and not expired, appear. Draft/Pending/Rejected/
Scheduled/Archived content is inaccessible through the student accessor. Read More
and Dashboard View Details open the full shared card, with keyboard-accessible
Back to Announcements. Expired/archived details close when visibility refreshes.

No shared read/unread inbox existed to reuse. Phase F replaces the existing header's
hardcoded badge and supplies announcement notices distinct from private request
updates. One stable `announcement:<id>` reference is retained per announcement;
notifications are derived from current eligible publications rather than copied
to each student's dataset. Refresh/revisions do not create repeated notices.

Minimal read receipts are stored per signed-in account under
`rtu.portal.announcementReads.<encoded-student-number>`. Opening details marks that
notice read; another student has independent read state. The existing Announcement
Settings switch controls the badge and announcement-notification list while keeping
the published feed accessible. Private request notifications remain in My Request.

Only in-app notices are supported. No email, SMS, push or closed-app scheduled
delivery is claimed. Archived/expired publications do not remain actionable as
active notifications; their source publication history remains preserved for staff.

## Production requirements and unresolved boundaries

This is explicitly a browser-local development prototype. Capability checks and
student projections cannot secure `localStorage` against developer tools, forged
client state or the browser owner. Explicit demo grants are not institutional
authorization. Notices are not cross-device official university publications.

Before deployment:

1. Connect institutional authentication and server-enforced announcement capabilities,
   author ownership, review policy and individual audience access on every endpoint.
2. Use an access-controlled shared database, stable IDs, parameterized queries,
   append-only audit/version records and minimal student-facing projections.
3. Implement atomic revision comparison, idempotent publication transactions and
   unique notification constraints. Browser revision checks do not guarantee atomic
   simultaneous writes across tabs/devices.
4. Add a reliable backend scheduler/job worker that validates approval/current policy,
   due/expiry time, publishes a snapshot and generates eligible notifications atomically.
5. Configure official categories, permitted publishing offices, review/revision
   workflows, retention and authoritative audience membership before enabling targeting.
6. If links/rich text or external delivery are later required, implement approved-link
   validation, robust sanitization and actual verified delivery integrations.

## Tests and manual acceptance

Service tests require no dependencies:

```sh
node portal-phase-f-smoke.js
```

The optional browser suite uses externally installed Playwright and installed
Microsoft Edge. Set `PLAYWRIGHT_MODULE` to that external module path when it is not
available through Node module resolution, then run:

```sh
node portal-phase-f-browser-smoke.js
```

The browser suite creates/closes its own HTTP server and isolated browser with
synthetic prototype sessions and test-only content/accounts. No runtime dependencies
were added. `BROWSER_CHANNEL` selects another installed Chromium channel;
`SCREENSHOT_DIR` optionally saves captures to an existing directory.

Verified results:

- **28 service scenarios**: capability checks, own-draft access, validation/audience
  restrictions, idempotency, drafts/public visibility, confirmations, versions,
  stale/no-op writes, notice/read-receipt deduplication, Manila conversion,
  invalid/past scheduling, expiry, due manual publication, cancellation, archiving,
  fail-closed storage, configured approval/version binding, migration and corrupt data.
- **17 browser scenarios**: staff empty state/capabilities, required fields and
  unsaved navigation, safe preview/formatting, draft reopening/concurrent edits,
  confirmed publication/revisions, scheduling, statistics/filtering/sorting/pagination,
  persistence, student feed/dashboard/details/guards, notification preferences and
  read persistence, archiving and no unexpected JavaScript page errors.
- Responsive staff/student layouts were checked at **1440, 768 and 390 pixels**;
  staff dark-mode screenshots were inspected. Browser-local tests do not prove
  server authorization, reliable scheduled delivery, cross-device isolation or
  concurrent database transactions.
- The Phase D **15 browser scenarios** and Phase E **18 browser scenarios** passed
  after initial integration. These cover existing student service entry pages,
  request/appointment/release behavior, records, profile editing and staff navigation.
- The existing Phase D **28 service scenarios** and Phase E **20 service scenarios**
  also passed during final verification.

Manual walkthrough:

1. Serve the portal with Live Server or `python -m http.server 5500` and sign in
   using separately provisioned staff credentials.
2. Open Announcements. Review migrated legacy drafts if present. Create a new
   general test draft; verify required fields, preview, text safety and reopening.
3. Change the draft, try navigating away and cancel the discard prompt. Confirm
   input remains. Save explicitly and refresh to verify persistence.
4. With an explicitly configured publisher, preview and confirm Publish Now.
   Sign in as a student in the same browser/origin and check the feed, Latest
   Announcements, Read More, actual unread badge and Notification Settings switch.
5. Revise as an authorized publisher; confirm the earlier version remains in staff
   history and the student sees the revised snapshot without another unread notice.
6. Schedule a future notice; verify past dates/invalid expiry are rejected and the
   notice stays hidden from students. When due, use authorized manual publication;
   closing the browser does not execute a publication job.
7. Test filters, dates, sorting/pagination and archive confirmation. Verify archived
   content disappears from the active feed while versions remain in Staff Archive.
8. Remove the demo account's publish grant in a development copy and reload. Verify
   drafts remain possible where permitted, but publication fails both in UI and service.
9. Verify student staff-route denial, light/dark modes, keyboard focus, mobile views,
   and existing request, appointment, document-processing and student-record flows.

## Phase F files

Created:

- `js/announcement-config.js`
- `js/announcement-service.js`
- `js/announcement-ui.js`
- `js/staff-announcements.js`
- `js/student-announcements.js`
- `css/announcements.css`
- `portal-phase-f-smoke.js`
- `portal-phase-f-browser-smoke.js`
- `PHASE-F.md`

Modified:

- `pages/staff-announcements.html`
- `pages/announcements.html`
- `pages/dashboard.html`
- `components/dashboard-shell.html`
- `components/icons.html`
- `js/staff-dashboard.js`
- `js/settings.js`
- `js/app.js`
- `index.html`
- `README.md`

Prior uncommitted Phase D/E work is preserved in the working tree.
