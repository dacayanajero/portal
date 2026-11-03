# Phase G — Staff Reports & Analytics

## Workspace and implementation

Route: `#/staff/reports`. Open Reports & Analytics from the Staff sidebar or the
new View Reports shortcut on the existing Staff Dashboard.

Delivered features:

- Six data-driven overview cards with explicit date/cohort definitions.
- Today, Last 7 Days, Last 30 Days, This Month through today, Last Month and Custom
  inclusive Manila reporting periods.
- Combined service, current request status and current self-reported program filters.
- Daily/weekly/monthly trends, service bars, status donuts, release activity and
  measured processing intervals.
- Service comparison sorting, searchable/sortable/paginated detailed request reports,
  and direct navigation to the corresponding Phase B record.
- Six authorized CSV export types with definitions, applied filters, quality notes
  and actual data. No new export/report persistence store.
- Existing RTU styling, responsive tables and SVGs, dark/light modes, keyboard
  controls, accessible chart data tables, empty/error states and busy semantics.

No chart framework or new application runtime dependency was added. Native SVG
charts expose title tooltips, legends, labeled axes and accompanying exact-value
tables. Small screens can scroll within individual visualizations/tables to retain
readable labels without horizontal page overflow.

## Actual data sources and integration

The application remains browser-local; no connected backend or database aggregation
endpoint exists. The untracked `server/` directory is not a connected reporting API.

| Source | Reporting use |
| --- | --- |
| `PortalRequestService` / `rtu.portal.requests.v1` | Submitted requests, current shared statuses, actual lifecycle fields and approval/rejection history |
| `PortalAppointmentService` / `rtu.portal.appointments.v1` | Unique appointments, current scheduled dates/statuses and recorded reschedule events |
| Phase D `request.release` snapshots | Actual handover-confirmed releases, copies and permitted staff attribution |
| `PortalStudentRecordService.reportingAttributes()` | Minimal authorized student-number/program mapping; no names, email, phone or address |

`PortalReportService` centralizes filtering, definitions, aggregation, durations,
detail projections and export datasets. It reads existing services rather than
creating report copies of operational records. Only aggregates and the current
authorized detail page are returned to the view; source arrays are transient.
The original appointment service may initialize legacy bookings from saved requests
as it already does elsewhere; reports introduce no scheduling/status mutation.

Small shared-service additions expose source availability so corrupt/unavailable
storage cannot silently become a fabricated zero report. Invalid request rows
rejected by the existing source are reported as quality exclusions. Memory-only
request state is clearly identified. Missing appointment history timestamps now
remain empty/unknown rather than being normalized to the current time, preventing
invented reschedule activity; genuine historical timestamps are preserved.

The existing dashboard continues using its shared request summary. Report submission
cohort status counts use that same summary function. Dashboard/report values agree
when scopes and evidence definitions match. An all-time Dashboard Released status
count can legitimately differ from period-specific audited release snapshots.

Phases B–F retain their workflows, permissions and routes. Reports never change
request/appointment statuses, prepare/release documents, edit student profiles or
publish announcements. No announcement readership, engagement or delivery metric
is inferred from the local notification/read-receipt implementation.

## Metric definitions

Global service/current-request-status/program filters apply to all metrics below.
Dates use distinct, clearly labeled event/cohort bases:

| Statistic | Calculation and date basis |
| --- | --- |
| Total Requests | Unique requests submitted during the inclusive reporting period; unsent form drafts are absent from the shared request service |
| Pending Requests | Current Pending Review among that submission cohort |
| In Processing | Current Processing among that submission cohort |
| Released Documents | Unique requests with a valid, handover-confirmed Phase D release snapshot dated in the period, regardless of submission date |
| Total Appointments | Unique appointments with current scheduled date in the period, including recorded cancelled/completed appointments |
| Average Processing Time | Mean elapsed calendar hours from valid recorded approval to actual release for valid release snapshots in the period |

### Requests

Document/status distributions and submission trends use the submission-period
cohort. Current status is **not** reconstructed as historical status at period end.
Current Approved/Rejected/Ready/Released/Cancelled values are labeled accordingly.
Current Released cohort counts may include legacy status-only records, unlike the
separately labeled actual-release metric.

Recorded approval/rejection activity is independent of submission date: unique
requests with a real Phase B status-changing Approved by Staff / Request Rejected
event timestamp in the period. Imported demo status changes are not treated as
historical approval events. Missing history is not inferred from current status.

### Appointments

Date activity uses current scheduled appointment dates, not booking/completion
timestamps or rescheduling history entries. Rescheduling can move an appointment
into/out of a selected date cohort; reports are current-state views, not frozen
historical snapshots of previous schedules. Each appointment ID is counted once.

Upcoming means future start and an active appointment status within the selected
scheduled-date cohort. Completed, Cancelled and No Show are current appointment
statuses. Request Status filters through the linked request's current status; it
does not become an appointment-status filter. Orphan appointments remain in All
Statuses/All Programs when other filters do not require unavailable linkage.

Recorded reschedules are a separate count of distinct actual history events whose
timestamp falls in the period, across the same non-date appointment scope. They
can refer to appointments whose current scheduled date lies outside the period;
they never increase Total Appointments.

### Processing durations

Three measured intervals are provided:

1. Approval → Processing Start, endpoint = processing start during the period.
2. Processing Start → Ready, endpoint = readiness during the period.
3. Approval → Release, endpoint = valid release snapshot during the period.

The headline metric uses interval 3. A pair is eligible only when both timestamps
are valid timezone-aware calendar timestamps, neither is in the future, and end
is not earlier than start. Missing/invalid/reversed timestamps are excluded, not
zero-filled. A genuine recorded zero interval is valid. Unknown measurements show
N/A; tiny positive UI durations show `<0.01 h`. CSV retains numeric precision.

Exclusion counts refer to records with a valid endpoint in the selected period
but an invalid/missing start. An unknown endpoint cannot be assigned to a period.
Invalid release snapshots are reported separately in quality diagnostics.

Per-service means include eligible/excluded sample counts. A single observation
is displayed as such in the table/headline, not presented as a reliable trend.
The comparison chart requires at least two valid observations per service. No
official processing deadline, SLA, business-hours assumption or efficiency label
is invented.

### Releases and copies

An eligible release must have the correct request ID, a non-empty unique release
reference, an actual valid timestamp, handover confirmation, and Released request
status. The timestamp cannot be in the future. Duplicate references, mismatched
IDs, invalid/missing timestamps and unconfirmed handovers are excluded. A legacy
Released status or root `releasedAt` alone is not treated as a physical handover.

Release totals count requests, not copies. Positive recorded integer quantities
are summed; missing/fractional/invalid quantities are reported as unknown, never
assumed to be one. No releases means zero copies. Releases with entirely unknown
quantities show N/A; partial known sums are labeled Known copies released and the
unknown-record count is displayed. Large valid sums retain exact integer precision.

Monthly/date/service release charts use the actual release timestamp in Manila.
Staff attribution is available only with the separate `staffMetrics` capability.
Phase I groups attributed releases by recorded stable staff ID, retaining a
historical action-name label. Changing display names does not split one known
staff identity into multiple groups. Missing IDs are an unattributed bucket,
not inferred identities or individual request IDs in aggregate labels.
Recipient identities, verification methods and credentials are never part of
general report projections or exports.

## Filters and aggregation

- Reporting boundaries are Manila 00:00 through 23:59:59.999 inclusive.
- Last 7/30 Days include today plus the previous 6/29 days. This Month runs from
  the first through today; Last Month covers the complete previous calendar month.
- Custom dates must exist, be ordered and span at most 3,661 days. This is a
  browser resource bound, not an RTU policy. Large institutional queries belong
  on a paginated/aggregating server.
- Weekly buckets begin Monday; first/last buckets may be partial. Monthly buckets
  use calendar months. Empty buckets retain zero volume where dates are known.
- Program options come only from the authorized student profile projection. They
  are current **self-reported**, not registrar-verified or historical program data.
  Profile changes can therefore change current program grouping of older requests.
- All Programs includes unknown/unavailable program mappings. An unavailable
  program source is explicit; a selected program report fails rather than silently
  dropping the filter.
- All Services includes genuine unrecognized service values under an explicit
  Other / Unrecognized Service category so totals reconcile; no fictional service
  records are generated. Individual service choices use the shared supported list.
- Filters combine. New form edits must be applied before export; displayed period
  and export metadata always identify the applied filters.

Quality counters cover the selected non-date scope across all dates, because
missing event dates cannot be placed in a reporting period. Rejected raw source-row
counts are source-wide. These diagnostics are not extra period activity totals.

Detailed reports use the submission cohort, with lifecycle dates possibly outside
the period. Search/sort affects only that table and the detailed CSV. The service
returns ten matching rows per page. Current restricted student identifiers cannot
be searched to circumvent missing sensitive-report capabilities.

## Permissions and privacy

`js/report-config.js` is an explicit development capability policy:

| Capability | Scope |
| --- | --- |
| `aggregate` | View aggregate reports |
| `details` | View minimal request-level rows and existing-module links |
| `export` | Generate authorized report CSV datasets |
| `studentIdentifiers` | Include/search student numbers in authorized details |
| `staffMetrics` | Include staff attribution/comparison fields |

Ordinary staff default to aggregate access. The existing provisioned demo employee
`2020-123456` has an explicit aggregate/details/export grant; this does not grant
student identifiers or staff performance metrics. No public role registration,
hardcoded password or general-staff automatic export grant was added.

Every report/export operation validates the active staff role and relevant
capabilities. Aggregate-only callers receive no detailed rows, student numbers,
recipient information or staff names. Student report routes are redirected, and
direct reporting service calls are denied. Rendered report data is cleared at logout.

`minimumProgramGroupSize` supports an approved distinct-student privacy threshold
for program-filtered reports. Below-threshold results and exports fail without
revealing exact cohort size. It defaults to zero in this explicitly local demo,
because no official suppression policy has been established. Set an approved
threshold and enforce it server-side before institutional deployment.

Client-side guards cannot secure browser-owned storage or forged client state.
These are prototype behavior checks, not a secure institutional reporting system.

## CSV exports and auditing

Available types:

1. Document Request Summary.
2. Appointment Summary.
3. Document Processing Summary.
4. Document Release Summary.
5. Service Performance Summary.
6. Filtered Detailed Report (`details` capability also required).

Phase H adds an Authorized Support Summary using the same export pipeline. Its
separate date/authorized-support scope is labeled explicitly; document-service,
program and request-status filters do not apply to support statistics. It contains
aggregates only, never private conversations, notes or student identities.

Exports include report title, inclusive Manila period, UTC generation time, applied
filters, relevant definitions, quality notes, column headings and actual values.
Detailed CSV includes all matching pages, respecting the current detail search/sort.
Empty counts export as zero and unavailable durations/quantities as N/A.

CSV is UTF-8 with BOM and proper comma/quote/newline escaping. Spreadsheet formula
prefixes (`=`, `+`, `-`, `@`, including leading whitespace/control characters) are
escaped. Filenames contain the actual applied period. Confirmation and a download
cooldown help prevent accidental/repeated downloads. No optional Excel/PDF library
was introduced solely for extra formats.

No report files, sensitive downloads, or fake persistent export history are stored
in localStorage. There is no secure backend audit infrastructure to record export
events; the interface and export metadata state this limitation. Browser download
storage is controlled by the user/browser, not an application report archive.

## Testing

Run deterministic accuracy/privacy tests:

```sh
node portal-phase-g-smoke.js
```

Run the optional isolated browser suite with externally installed Playwright and
Microsoft Edge (set `PLAYWRIGHT_MODULE` to its external module path if needed):

```sh
node portal-phase-g-browser-smoke.js
```

The suite starts/closes its own local HTTP server and isolated browser. It uses
synthetic prototype sessions, test-only student accounts, request/release fixtures
and temporary verification configuration. It does not alter real browser data or
introduce runtime dependencies. `BROWSER_CHANNEL` selects another installed Chromium
channel; `SCREENSHOT_DIR` optionally saves captures to an existing directory.

Verified:

- **32 deterministic Phase G scenarios:** empty/N/A behavior, presets and exact
  Manila boundaries, strict timestamps, invalid ranges, unique records, release
  evidence, missing/reversed/true-zero durations, copy precision, sample-size gates,
  rescheduling, linked status filters, combined program filters, history activity,
  daily/weekly/monthly reconciliation, quality diagnostics, privacy projections,
  pagination/search, all six export datasets, empty CSVs, formula escaping,
  capabilities, suppression, read-only data and unauthorized access.
- **14 Phase G browser scenarios:** truthful initial state, actual shared figures,
  accessible SVG/table reconciliation, combined filters, unapplied-filter export
  guard, invalid/custom/reset periods, aggregation, duration context, detailed
  navigation/pagination/search/sort/privacy, downloaded CSV totals, no report
  persistence, capability/suppression gates, dashboard consistency/shortcut,
  refresh, student route/service denial and no unexpected JavaScript page errors.
- Dark mode and scroll-safe reports/charts were checked at **1440/768/390 pixels**;
  representative screenshots were inspected. Mobile charts retain scrollable label
  sizes and accompanying exact-value tables.
- Prior suites passed during integration: Phase D **28 service / 15 browser**,
  Phase E **21 service / 18 browser**, Phase F **28 service / 17 browser**. These
  cover previous request, appointment, release, profile, student records and
  announcement workflows. The extra Phase E test covers missing audit timestamps.

Backend-dependent checks remain unverified: server authorization, institutional
program verification, university-wide completeness, cross-device consistency,
atomic report snapshots, secure export audits and approved privacy suppression.
Formal assistive-technology review and full field-by-field wizard acceptance are
not replaced by these prototype tests.

## Manual acceptance

1. Serve with Live Server or `python -m http.server 5500`. Sign in with the
   separately provisioned staff account and open Reports & Analytics.
2. On an empty browser source, confirm zero counts and N/A duration. Create actual
   student requests/appointments through existing workflows and refresh reports.
3. Process/release documents through Phase D, including its configured recipient
   verification and actual-handover confirmation. Compare audited release counts
   and known copy quantities; legacy status-only releases must remain excluded.
4. Apply each date preset/custom range, service, current status and program filter.
   Confirm the period/basis labels and that invalid ranges are rejected.
5. Expand chart data tables, compare distribution/trend sums, and switch daily/
   weekly/monthly aggregation. Check sample sizes and N/A rather than fake averages.
6. Search/sort/page detailed rows, open a request, and return to reports. Verify
   student/staff columns appear only with their separate configured capabilities.
7. Export each CSV type. Compare totals and date/filter metadata. Test empty exports,
   quotes/newlines and formula-like fields using isolated synthetic development data.
8. Remove details/export grants in a development policy copy and reload. Verify
   aggregate access remains, detailed data/download service calls are denied. Test
   an approved program threshold with small cohorts in the same isolated setup.
9. Sign in as a student and try `#/staff/reports` and direct report calls; confirm
   denial and continued access to their own My Request/Profile/Announcements pages.
10. Repeat with keyboard controls, dark/light modes and mobile widths. Compare
    Dashboard figures only when period, status cohort and release evidence agree.

## Production requirements

- Institutional authentication with server-enforced aggregate/detail/export/student/
  staff capabilities, relevant staff scopes, minimal response fields and access logs.
- A centralized authoritative database and stable foreign keys, indexed date/service/
  status/program queries, safe parameterized queries, server-side pagination and
  aggregation rather than loading unrestricted university records into the browser.
- Authoritative program/enrollment provenance, approved small-cell suppression,
  data-retention and Philippine institutional privacy controls. Do not treat current
  self-reported profiles as verified enrollment or historical membership.
- Validated timezone-aware lifecycle/release fields, immutable handover records,
  source-quality monitoring and explicit historical-versus-current snapshot semantics.
- Consistent/transactional reporting snapshots where required, secure append-only
  export-generation auditing and approved storage/delivery/retention for downloads.

## Phase G files

Created:

- `pages/staff-reports.html`
- `css/staff-reports.css`
- `js/report-config.js`
- `js/report-service.js`
- `js/report-export.js`
- `js/report-charts.js`
- `js/staff-reports.js`
- `portal-phase-g-smoke.js`
- `portal-phase-g-browser-smoke.js`
- `PHASE-G.md`

Modified:

- `index.html`
- `js/app.js`
- `js/staff-dashboard.js`
- `js/request-service.js`
- `js/appointment-service.js`
- `js/student-record-service.js`
- `components/staff-shell.html`
- `components/icons.html`
- `pages/staff-dashboard.html`
- `portal-phase-e-smoke.js`
- `PHASE-E.md`
- `README.md`

Existing uncommitted Phase D/E/F work is preserved.
