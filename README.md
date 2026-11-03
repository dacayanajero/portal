# RTU Pasig Academic Services Portal

A responsive recreation of the provided login and student dashboard designs, built with HTML, Bootstrap 5.3, CSS, and vanilla JavaScript.

## Run

Serve the project with VS Code's **Live Server** extension, or run this command from the project folder if Python is installed. No installation or build step is required to run the portal:

```sh
python -m http.server 5500
```

Then visit **http://localhost:5500**.

The portal loads its separate HTML page files using `fetch`, so run it through an HTTP server rather than opening `index.html` as a `file://` URL. Continue using the same server address and port to access your existing browser-saved demo accounts.

Bootstrap loads from jsDelivr. The page also includes local styling for its core layout and controls, so the demo remains usable when the CDN is unavailable.

## Tests

The deterministic service suites require Node.js 18 or later and no third-party packages. From this folder:

```sh
node portal-phase-d-smoke.js
node portal-phase-e-smoke.js
node portal-phase-f-smoke.js
node portal-phase-g-smoke.js
node portal-phase-h-smoke.js
node portal-phase-i-smoke.js
```

Or run all six with `npm test` after `npm install`.

The optional browser suites use Playwright and the installed Microsoft Edge channel by default. They create isolated browser profiles and synthetic sessions; they do not use real credentials.

```sh
npm install
npm run test:browser
```

Set `BROWSER_CHANNEL=chrome` to use another installed Playwright channel. `npm test` does not require Playwright. These suites exercise browser-local services only; they do not test server authorization, concurrent transactions, or production persistence. See the phase documents for those requirements.

## Features

### Phase I: Staff Profile, Account Settings & Security

The existing `#/staff/profile` and `#/staff/settings` pages now provide My Staff
Profile and Account Settings. Only display name and contact number are editable,
using explicit Save/Cancel, validation and revision checks. Provisioned name,
employee number, email, role and employment data remain read-only. Historical
operational attribution is preserved through stable staff identifiers.

Supported request/processing/support preferences and the existing light/dark theme
remain account-specific. Mandatory assignment/reopen/Urgent support notices and
security sign-out outcomes cannot be muted through optional alert controls.
Unsupported reminder delivery, MFA and remote-session controls are explained rather
than presented as working features.

`PortalAccounts` now supports timed demo session metadata, current-password
reauthentication, credential revisions and password-change invalidation. New hashes
use native PBKDF2-SHA-256 with 600,000 iterations; legacy 100,000-iteration hashes
still verify. This remains browser-local development authentication, not production
security or cross-device session revocation.

See [PHASE-I.md](PHASE-I.md) for storage compatibility, permissions, session limits,
testing, manual acceptance and deployment requirements. Run `node portal-phase-i-smoke.js`
for isolated account tests; the optional real-sign-in browser suite is
`portal-phase-i-browser-smoke.js`.

### Phase H: Help & Support Management

Open `#/staff/help-support` for authorized ticket queues, conversations, private
staff notes, genuine staff assignment, status/resolution history, FAQ Management
and the shared Knowledge Base. Student Help (`#/help`) now provides searchable
published FAQs, Contact Support, My Support Tickets and published service advisories.

The existing assistant UI is preserved and now reads the same published FAQ
snapshots as Help. It is a local keyword-based guide, not a generative AI service.
Verified bundled portal-usage guidance preserves useful existing help without
inventing university policies; new staff publication requires explicit permission.

Tickets and replies are development-only browser records, not submissions delivered
to a university office. The notification adapter delegates to existing announcement
receipts, request attention and ticket-scoped support notices without another inbox
database. Reports includes authorized aggregate support statistics and a support CSV.

See [PHASE-H.md](PHASE-H.md) for workflows, permissions, storage, privacy boundaries,
manual acceptance and backend requirements. Run `node portal-phase-h-smoke.js` for
isolated service checks; `portal-phase-h-browser-smoke.js` is the optional browser suite.

### Phase G: Reports & Analytics

Open `#/staff/reports` for read-only operational reporting over the existing shared
request, appointment and release sources. The workspace includes six overview
cards, inclusive Manila date filters, service/current-status/self-reported-program
filters, accessible SVG charts, measured processing intervals, service comparisons,
paginated details and six permission-gated CSV export types.

Metric date bases are explicit: submitted-request cohorts, current statuses,
scheduled appointment dates and actual Phase D release snapshots are kept distinct.
Missing timestamps produce N/A rather than invented zero-hour measurements.
`js/report-config.js` gives ordinary staff aggregate access; detailed/export access
is an explicit demo grant, while student identifiers and staff metrics require
separate capabilities. Reports remain browser-local, not institution-wide analytics.

See [PHASE-G.md](PHASE-G.md) for all definitions, privacy controls, exports, testing
and backend requirements. Run `node portal-phase-g-smoke.js` for deterministic
accuracy tests; `portal-phase-g-browser-smoke.js` is the optional Playwright suite.

### Phase F: Announcements Management

Open `#/staff/announcements` for draft creation, safe plain-text previews,
permission-aware publishing, prototype scheduling, versioned revisions, audit
history, and archiving. The existing Student Announcements page and a small Latest
Announcements dashboard section now read the same published data. The student
header badge shows actual unread announcement notices and respects Settings.

This is a browser-local general-announcement prototype. Publishing capabilities
are explicitly configured per account in `js/announcement-config.js`; the staff
role alone does not grant publication. Scheduled records require authorized manual
publication when due. Secure group targeting and a backend scheduler are not connected.
Existing legacy saved notices are retained as unpublished drafts for review.

See [PHASE-F.md](PHASE-F.md) for permissions, workflows, migration, testing and
production requirements. Run `node portal-phase-f-smoke.js` for service tests;
`portal-phase-f-browser-smoke.js` is the optional Playwright UI suite.

### Phase E: Student Records Management

Open `#/staff/student-records` for the read-only student directory, dynamic
unique-student statistics, search/filter/sort controls, and paginated records.
Individual records use `#/staff/student-records/<encoded-student-number>`.
The former `#/staff/records` route remains an alias.

The directory uses actual saved student accounts and their existing self-reported
profile values. It no longer seeds a staff roster or labels registration as verified
enrollment. Student details include personal/academic information, shared request,
appointment and release histories, recorded lifecycle activity, and contextual
navigation to Phases B–D. Official enrollment verification is not connected.

See [PHASE-E.md](PHASE-E.md) for data-source rules, privacy boundaries, the full
file list, manual testing, test results, and production requirements. Run
`node portal-phase-e-smoke.js` for the dependency-free service tests; the optional
Playwright UI suite is `portal-phase-e-browser-smoke.js`.

### Phase D: Document Processing & Release

Staff can open `#/staff/document-processing` to manage approved documents using
the existing shared request lifecycle: **Approved → Processing → Ready for Pickup
→ Released**. The workspace includes dynamic statistics, searchable/filterable
queues, saved preparation checks, private append-only staff notes, recipient
verification, explicit actual-handover confirmation, and read-only release history.
Student My Request shows the same statuses and actual in-app request notices.
Appointments retain an independent lifecycle.

**Development checklist enabled:** `js/document-processing-config.js` supplies a
clearly labeled example preparation checklist. Staff can complete its required
checks to enable Mark Ready for Pickup. Identity-verification requirements remain
unconfigured, so release requires approved definitions. Official deployment also
requires replacing the example checklist with approved requirements. These are browser-local
prototype workflows, not production authorization or secure institutional storage.

See [PHASE-D.md](PHASE-D.md) for configuration, the complete file list, integration
details, persistence boundaries, test results, manual acceptance instructions, and
backend requirements. Run `node portal-phase-d-smoke.js` for the dependency-free
service regression suite; an optional Playwright browser suite is also documented.

### Existing portal features

- Responsive split layout with the reference's pale blue, royal blue, and gold palette.
- Student and staff login modes with corresponding labels.
- Accessible password visibility toggle and inline form validation.
- Password recovery and registration dialogs with keyboard focus management and Escape-to-close support.
- Browser-local student registration and sign-in, without a built-in password.
- Provisioned staff sign-in using an employee number, with no public staff registration.
- Separate role-specific staff workspace with its own shell, navigation, routes, and student-route guards.
- Staff dashboard with request statistics, a recent-request queue, quick actions, and service volume.
- Shared browser-local request data source used by both Student My Request and Staff Request Management, with persisted status propagation.
- Staff Request Management with summary cards, search, status and document filters, sorting, pagination, details, lifecycle actions, and status history.
- Student request lifecycle statuses: Pending Review, Needs Correction, Approved, Rejected, Processing, Ready for Pickup, Released, and Cancelled.
- Staff Appointment Management with summary cards, interactive month/week/day calendar, appointment list, filters, pagination, details, and lifecycle actions.
- Appointment statuses: Pending Confirmation, Scheduled, Checked In, Completed, Cancelled, and No Show.
- Staff student-records search with program filters, profile details, and related request history.
- Shared staff/student announcements with drafts, explicit publisher permissions, version history and archiving, plus staff profile editing and account settings.
- Duplicate student-number/email checks and salted password hashes for registered demo accounts.
- Tab-scoped sign-in session that survives refresh, records the account's role, and is cleared by Log out.
- Header sun/moon button for light and dark mode, saved separately for each demo account.
- Reference-inspired dashboard with university branding, navigation, assistant search, and quick services.
- Services, request previews, announcements, help, profile, and logout.
- Expandable Services navigation with separate Grade Slip, Registration Form, and ID Printing pages and active-service indicators.
- Three-step Grade Slip form with profile-prefilled information, validation, progress, account-specific draft autosave, and request review.
- Grade Slip pick-up schedule confirmation with YES/NO actions and a dedicated Schedule Complete screen.
- Reference-style three-step ID Printing form with profile-prefilled personal information, printing schedule, request review, and account-specific draft autosave.
- ID Printing YES/NO schedule confirmation and a dedicated Schedule Complete screen showing the confirmed date and time.
- Collapsible RTU sidebar with an icon-only navigation rail, labeled icon tooltips, and expandable Services on desktop and mobile.
- Shared subtle press feedback, route and form-step transitions, animated menus and dialogs, and reduced-motion support.
- Responsive mobile navigation and document request dialogs.
- Individual URL routes with direct links and browser Back/Forward navigation.
- A separate HTML file for every route, plus reusable shared layout, icons, and dialogs.
- Reference-inspired My Profile page with personal information, academic details, and contact fields.
- Reference-inspired Settings workspace with Account Information, Change Password, Notification Settings, and Privacy and Security sections.
- Account-specific profiles populated from registration, with a pencil Edit control and automatic browser-local saving for personal, academic, and contact details.
- Keyword-based assistant guidance and suggested questions.
- Local SVG assistant illustration and the Rizal Technological University seal.

## Files

```text
index.html                     Small entry point: styles, scripts, and app mount point
package.json                   Node test scripts and Playwright development dependency
package-lock.json              Locked development dependency versions
pages/login.html               Login page
pages/dashboard.html           Dashboard route
pages/services.html            Academic Services route
pages/grade-slip.html          Grade Slip service route
pages/grade-slip-complete.html Grade Slip Schedule Complete route
pages/registration-form.html   Registration Form three-step service route
pages/registration-form-complete.html Registration Form Schedule Complete route
pages/id-printing.html         ID Printing service route
pages/id-printing-complete.html ID Printing Schedule Complete route
pages/my-request.html          My Request route
pages/announcements.html        Announcement route
pages/help.html                 Help route
pages/profile.html              My Profile route
pages/settings.html             Settings route and its section panels
pages/staff-dashboard.html      Staff dashboard route
pages/staff-requests.html       Staff Request Management route
pages/staff-appointments.html   Staff Appointment Management route
pages/staff-document-processing.html Staff document preparation and release route
pages/staff-records.html        Staff student-records route
pages/staff-announcements.html  Staff announcements route
pages/staff-reports.html        Staff Reports & Analytics route
pages/staff-help-support.html   Staff Help & Support Management route
pages/staff-profile.html        Staff profile route
pages/staff-settings.html       Staff settings route and its section panels
components/dashboard-shell.html Shared student header, account menu, sidebar, and view container
components/staff-shell.html     Shared staff header, account menu, sidebar, and view container
components/support-dialogs.html Support conversation, confirmation, and notification dialogs
components/icons.html          Shared SVG icon library
components/dialogs.html        Request, schedule confirmation, assistant, recovery, and registration dialogs
css/style.css                  Reference-inspired design and responsive styles
css/dashboard.css              Dashboard layout, cards, and mobile navigation
css/my-request.css             Student My Request cards, progress, history, and dark-mode styles
css/staff.css                  Staff workspace, records, announcements, and settings styles
css/staff-requests.css         Staff Request Management, details, actions, and dark-mode styles
css/staff-appointments.css     Staff Appointment Management, calendar, details, and dark-mode styles
css/staff-account.css          Shared staff profile and account-settings styles
css/staff-document-processing.css Document preparation, release queue, and dark-mode styles
css/staff-student-records.css  Student directory, details, and dark-mode styles
css/announcements.css          Announcement cards, editor, preview, and dark-mode styles
css/staff-reports.css          Reports filters, metrics, charts, and dark-mode styles
css/support.css                Student help, staff support queues, notifications, and dark-mode styles
css/grade-slip.css             Grade Slip multi-step form layout and theme styles
css/registration-form.css      Registration Form blue workspace and inline assistant
css/id-printing.css            ID Printing layout using shared service-wizard styles
css/theme.css                  Dark-mode colors for dashboard and staff views, settings, and dialogs
css/motion.css                 Shared interaction, sidebar, dialog, and reduced-motion styles
js/motion.js                   Shared cancellable transitions and delegated interaction feedback
js/accounts.js                 Provisioned staff and saved student accounts, password hashing, role-aware sessions
js/announcement-config.js      Development capability and audience policy for announcements
js/announcement-service.js     Shared announcement storage, publication lifecycle, and receipts
js/announcement-ui.js          Shared announcement card and date renderer without HTML parsing
js/app.js                      Student and staff route maps, HTML loading, and app initialization
js/script.js                   Registration, sign-in, role switching, and account dialogs
js/dashboard.js                Student dashboard navigation, request previews, My Request, assistant, and logout
js/request-service.js          Shared request storage, lifecycle, validation, and status propagation
js/appointment-service.js      Shared appointment storage, scheduling validation, capacity, and lifecycle
js/staff-dashboard.js          Staff dashboard, records, announcements, profile, settings, and shared stats
js/staff-requests.js           Staff Request Management filtering, details, and lifecycle actions
js/staff-appointments.js       Staff Appointment Management calendar, list, details, and actions
js/staff-document-processing.js Staff preparation checklist and release queue UI
js/staff-announcements.js      Staff announcement editor, preview, publication, and archive UI
js/staff-reports.js            Staff report filters, metrics, charts, and export UI
js/staff-help-support.js       Staff ticket queues, FAQ management, and support UI
js/staff-student-records.js    Staff directory, filters, pagination, and student details
js/staff-account-service.js    Owner-scoped staff profile and notification preferences
js/student-announcements.js    Student published-announcement feed and receipts
js/student-help.js             Student FAQ search, advisories, and support ticket UI
js/student-record-service.js   Student directory projections from requests and appointments
js/support-config.js           Support categories, priorities, assignment, and capability policy
js/support-service.js          Browser-local support ticket lifecycle, replies, notes, and assignment
js/support-ui.js               Shared support tickets, conversation, and notification UI
js/support-knowledge.js        Bundled portal-usage guidance used by Help and the assistant
js/faq-service.js              Shared FAQ/Knowledge Base storage, publication, and search
js/notifications.js            Adapter combining announcements, request attention, processing, and support updates
js/report-config.js            Development reporting capabilities and defaults
js/report-service.js           Read-only request, appointment, document, and support reporting
js/report-charts.js            Dependency-free SVG charts with accessible data tables
js/report-export.js            CSV export with spreadsheet-formula escaping
js/document-processing-config.js Development preparation and release policy definitions
js/settings.js                 Settings sections, account editing, password changes, and preferences
js/grade-slip.js               Grade Slip steps, validation, saved drafts, and submission
js/registration-form.js        Registration steps, account-scoped drafts, requests, and chat
js/id-printing.js              ID Printing steps, profile sync, saved drafts, and submission
assets/images/assistant.svg    Robot illustration
assets/images/rtu-logo.png      Rizal Technological University seal
assets/images/university-seal.svg SVG university seal artwork (currently unreferenced)
```

The university seal matches the supplied reference and is stored locally. Source: [RTU website](https://www.rtu.edu.ph/wp-content/uploads/2022/08/rtulogo.png).

### Editing pages

Edit a route's markup in its matching `pages/*.html` file. Edit the shared header/sidebar in `components/dashboard-shell.html`, the shared icons in `components/icons.html`, dialogs in `components/dialogs.html`, and support/notification dialogs in `components/support-dialogs.html`. These files are HTML fragments rendered inside the entry page; navigate using the portal URLs below.

`js/app.js` defines the student and staff route maps and their HTML files. On startup it fetches the page and component files in parallel, mounts them once, then initializes the shared services and route-specific UI modules in order. This keeps form state and in-memory requests intact when changing routes and ensures handlers are attached only after their elements exist. If a file cannot load, the entry page shows the failed path and a reload button.

Keep the `<body>` boundaries in imported page and component files. They let Live Server inject its reload script once at the end of each response instead of repeatedly inside inline SVG icons. The loader parses each response as an HTML document, removes injected scripts, and imports only its body content. Live reload remains active through the entry page's script.

## Demo behavior

In **Student** mode, choose **Register**, enter your full name, student number, university email, and a password of at least eight characters, then choose **Create account**. The account is saved in this browser's `localStorage`. After successful registration, the dialog closes and your student number is filled into the login form. Enter your password to sign in. Duplicate student numbers and registered emails are rejected. Registration reports a failure if browser storage cannot save the account.

The registered name, student number, and email appear in **My Profile**. Your name also appears in the header and dashboard, and your student number appears in document request previews. New accounts show **Not provided** for year level, program, and semester, with an optional phone number you can add in My Profile. Profiles are saved separately for each account, so signing into another account loads that user's details. Accounts and saved profiles remain after reload or logout in the same browser. Clearing this site's browser storage removes them.

There is no built-in student password. Create your own demo account using **Register** before signing in for the first time. The original student number **2023-103319** remains reserved for compatibility: it can sign in only if it already has a password hash saved in this browser, and retains Juan Dela Cruz's reference profile and existing saved profile edits. Incorrect credentials are rejected. Staff accounts are provisioned rather than self-registered; public staff registration is not available.

A demo session record identifying the signed-in account and role is stored in `sessionStorage` when remembered sign-in is enabled. New sign-ins record their actual local sign-in time, an eight-hour absolute demo expiration and an opaque credential revision. Refresh does not extend that lifetime. Legacy role/number markers remain compatible with explicitly unavailable sign-in/expiry metadata. **Log out** clears the current tab session; password changes invalidate the current and detectable same-origin credential-revision sessions. Passwords/hashes are never included in the session record. Visit-only sign-in remains active in memory but cannot survive refresh. These client checks are not server-enforced security.

Document requests are browser-local demo records saved under `rtu.portal.requests.v1`. Students can create requests from Services and track status, appointment details, staff remarks, correction or rejection reasons, and status history in **My Request**. Staff can review and process them in **Request Management**, and status changes propagate between both views in the same browser. They are not official registrar submissions, are not shared across devices, and are not synchronized with a university system. Reloading preserves your sign-in session and opens the page specified in the URL. The assistant provides local, keyword-based guidance rather than a live AI or registrar connection. Announcements use the shared browser-local publishing workflow documented in Phase F.

### Staff workspace

Choose **Staff** on the login screen and sign in with the provisioned staff employee number and password. The staff account is provisioned in `js/accounts.js` as a salted PBKDF2-SHA-256 password hash; the plaintext password is provided separately and is not stored in the repository. Staff registration is not available. The staff routes are guarded: a student visiting a `#/staff/...` route is returned to `#/dashboard`, and a staff member visiting a student route is returned to `#/staff/dashboard`.

The staff workspace uses `components/staff-shell.html` and a separate set of pages. **Staff Dashboard** shows live request counts, recent submissions, shortcuts, service volume and support queue information. Request, appointment, document-processing, student-records, announcement, reporting and support workflows remain shared as documented in their phase guides. **My Staff Profile** shows provisioned identity/employment information and allows explicit saving of display name/contact number only. **Account Settings** provides read-only account/capability information, current-password-verified credential changes, functional in-app preferences, shared light/dark theme, current demo session metadata and sign-out. No user-editable role/department or fake MFA controls are provided.

Requests, appointments, student accounts and student profiles are shared browser-local sources used by the authorized portal views. Staff announcements, staff profiles, preferences and password changes use their existing browser-local keys. The Student Records directory uses saved accounts rather than a seeded roster; none of these sources is synchronized with an official university system. Changing the staff password updates the stored hash and requires the new password on the next sign-in. Staff sessions restore after refresh like student sessions, and logging out clears the staff session and returns to the login screen. Signing into another role does not overwrite existing saved records.

### Appointments

Staff Appointment Management derives appointments from student requests that include a booking date and time. Appointments are stored under `rtu.portal.appointments.v1` with their own lifecycle and history. Staff can confirm, check in, complete, cancel, mark no-show, and reschedule appointments. Operating hours are 8:00 AM-5:00 PM with one-hour slots and a 4:00 PM latest start; past dates are rejected. The default development capacity is one appointment per overlapping time slot and is explicitly labeled as not an official university capacity. Confirming or completing an appointment does not approve or release the related document request. Cancelled and no-show appointments remain in history.

### Page routes

Each page has its own hash route and source file:

| Page | Route | Source file |
| --- | --- | --- |
| Dashboard | `#/dashboard` | `pages/dashboard.html` |
| Services | `#/services` | `pages/services.html` |
| Grade Slip | `#/services/grade-slip` | `pages/grade-slip.html` |
| Schedule Complete | `#/services/grade-slip/complete` | `pages/grade-slip-complete.html` |
| Registration Form | `#/services/registration-form` | `pages/registration-form.html` |
| Registration Form Schedule Complete | `#/services/registration-form/complete` | `pages/registration-form-complete.html` |
| ID Printing | `#/services/id-printing` | `pages/id-printing.html` |
| ID Printing Schedule Complete | `#/services/id-printing/complete` | `pages/id-printing-complete.html` |
| My Request | `#/my-request` | `pages/my-request.html` |
| Announcement | `#/announcements` | `pages/announcements.html` |
| Help | `#/help` | `pages/help.html` |
| My Profile | `#/profile` | `pages/profile.html` |
| Settings | `#/settings` | `pages/settings.html` |

Staff pages use a separate route map and shell:

| Page | Route | Source file |
| --- | --- | --- |
| Staff Dashboard | `#/staff/dashboard` | `pages/staff-dashboard.html` |
| Request Queue | `#/staff/requests` | `pages/staff-requests.html` |
| Staff Appointments | `#/staff/appointments` | `pages/staff-appointments.html` |
| Document Processing & Release | `#/staff/document-processing` | `pages/staff-document-processing.html` |
| Student Records Management | `#/staff/student-records` | `pages/staff-records.html` |
| Announcements | `#/staff/announcements` | `pages/staff-announcements.html` |
| Reports & Analytics | `#/staff/reports` | `pages/staff-reports.html` |
| Help & Support Management | `#/staff/help-support` | `pages/staff-help-support.html` |
| Staff Profile | `#/staff/profile` | `pages/staff-profile.html` |
| Staff Settings | `#/staff/settings` | `pages/staff-settings.html` |

`#/staff/records` and `#/staff/records/<student>` remain aliases that redirect to the student-records route.

For example, open `http://localhost:5500/#/services` and sign in to go directly to Services, or open `http://localhost:5500/#/staff/requests` and sign in as staff to open the request queue. Navigation updates the URL, page title, and active navigation item. Browser Back/Forward restores the matching page. Unknown routes fall back to the signed-in role's home page. Logging out clears the current route and returns to login.

Select **Services** in the sidebar to expand or collapse its **Grade Slip**, **Registration Form**, and **ID Printing** links. The active service has a gold indicator, highlighted background, and `aria-current="page"`; page headings also identify the current service. Opening a service through a direct link, refresh, browser history, the service catalog, or dashboard shortcuts automatically expands the Services menu and selects the matching item. Each service page can create a demo request that appears in **My Request**. Use **View All Services** on the dashboard or a **Services** breadcrumb to open the complete catalog. The disclosure supports Enter/Space and Escape, and service navigation also works in the mobile sidebar and dark mode.

Use the **hamburger button above Dashboard** to switch between the expanded sidebar and a compact **72px icon-only rail**. The university seal, hamburger, and all six menu icons remain available when collapsed, with labels shown on hover and accessible names for screen readers. Selecting **Services** from the rail expands navigation and opens its submenu. On desktop, collapsing navigation gives the content more horizontal space without shifting it vertically, and the sidebar's open/closed state is kept while moving between pages during the current visit. On mobile, selecting a page, clicking outside, or pressing Escape closes the expanded overlay menu back to the icon rail. The button supports Enter/Space and announces whether navigation is expanded. Completion screens retain their full-width layout. Long program fields adjust when the content width changes.

### Grade Slip form

The Grade Slip page follows the reference's light-blue section headers, white form area, and three-step progress header:

1. **Personal Information:** student number, full name, program, year level, and semester are prefilled from the signed-in account's profile. Student number is fixed; other values can be adjusted for this request. Long program names wrap and expand automatically. Changes here do not overwrite My Profile.
2. **Grade Slip Details:** the reference-style Enrollment Details panel has academic-year and requested-semester dropdowns, a calendar appointment-date field, and a clock start-time field. Available hours are **8:00 AM–5:00 PM**, with start times limited to **8:00 AM–4:00 PM**. Choose or type a start time; the read-only end time is always calculated one hour later (for example, `8:00 AM → 9:00 AM`). The last appointment is **4:00 PM–5:00 PM**. Out-of-hours times cannot proceed to review or submission, including in restored drafts. The date must be today or later. Calendar/clock buttons open the browser's native pickers, and keyboard entry is supported. Expand **Additional request details** to change the default Personal copy purpose, 1–10 copies, or optional notes. The displayed 150-student capacity is reference/demo copy; the demo does not check live appointment availability.
3. **Review & Submit:** the reference-style review shows student details on the left, academic-year/semester pills beneath them, and selected-date and calculated-time cards on the right. Expand **Additional request details** to review the purpose, copies, and notes. Check **I confirm that the information above is correct and complete**, then choose the green **Confirm Schedule** button to open a blurred-backdrop confirmation asking whether to proceed with the selected pick-up schedule. The checkbox must be checked again after returning from an earlier step, receiving updated profile information, or reloading a draft. **NO**, Escape, or clicking outside returns to the review form without creating a request or clearing its draft. **YES** creates the demo request once and opens **Schedule Complete!**, showing a green check mark, the actual selected date/time, and the request reference. Use **Back to Dashboard** or **View My Request** to continue; **View request details** in My Request displays the submitted snapshot, including the appointment schedule.

The selected step and draft values autosave separately for each account in browser storage and survive navigation, refresh, and logout. Previously saved drafts retain their information when the new scheduling fields are added and return to Details if a required date/time is missing. Invalid drafts can be saved, but must be corrected before moving forward or confirming submission. A draft is cleared only after choosing YES and successfully creating its request, so the next Grade Slip request starts fresh. Submitted demo requests and their completion screen remain in memory for the current visit and are cleared on refresh or logout. A completion URL without a confirmed request returns to the Grade Slip form. The progress indicator, Next/Back controls, confirmation, success screen, assistant shortcut, and autosave footer work on mobile and in dark mode.

### ID Printing form

Open **Services → ID Printing** to use the reference-style three-step form. **Personal Information** prefills the student number, name, program, year level, and semester from the signed-in profile. The section heading has a full-width light-blue strip, and the fields retain their blue backgrounds. Student number is read-only; other edits apply to this request. Long program names wrap automatically.

**Printing Schedule** collects the academic year, semester, printing date, and start time. The calendar and clock buttons open native pickers, with keyboard entry also supported. Dates must be today or later; start times run from **8:00 AM to 4:00 PM**, and the read-only end time is calculated one hour later, ending by **5:00 PM**. The 150-student capacity text follows the reference; the demo does not check live availability. Optional notes are available under **Additional request details**. **Review & Submit** shows student details beside the selected date/time cards. Expand **Additional request details** to review the academic year, requested semester, and notes. Confirm the information's accuracy and choose the green **Confirm Schedule** button beneath the review; a punctuality reminder appears below it.

**Confirm Schedule** opens a light-blue YES/NO dialog with a blurred backdrop and the selected date/time. **NO**, Escape, or clicking outside returns to review and preserves the draft. **YES** revalidates the information, creates one demo request, and opens **Schedule Complete!** with a green check mark, the confirmed date/time, and **Back to Dashboard**. The completion screen hides the sidebar. The request appears in **My Request**, where its full snapshot includes the printing schedule. Drafts autosave separately from Grade Slip and separately for each account, survive refresh and navigation, and clear only after successfully confirming YES. Older enrollment-only drafts retain their values and return to Printing Schedule to supply a date and time. The checkbox is not restored from a saved draft. A completion URL without a confirmed request in the current session returns to the ID Printing form. The form, dialog, and completion screen support mobile layouts and dark mode.

### Registration Form

Open **Services → Registration Form** for the reference-inspired three-step workspace. **Personal Information** prefills student number, full name, program, year level, and semester from your profile. The student number is read-only; other edits apply only to this request. Program is an auto-growing text field, matching Grade Slip, so any saved program name fits.

**Enrollment Details** follows Grade Slip Details: a light-blue heading strip with the reference's 150-student capacity text, a white form area, academic-year and semester dropdowns, and calendar/clock appointment pickers. The date must be today or later. Start times are **8:00 AM–4:00 PM**, and the read-only end time is calculated one hour later, ending by **5:00 PM**. The capacity text is demo copy; live availability is not checked. Expand **Additional request details** to change the purpose, 1–10 copies, or optional notes.

**Review & Submit** follows the reference's white workspace and light-blue heading strip. Student name, year level, student ID, current semester, and program appear on the left; the selected date's month, weekday, and day and the calculated time range appear in cards on the right. Expand **Additional request details** to review the academic year, requested semester, purpose, copies, and notes. The compact **RTU AI ASSISTANT** shortcut opens the existing assistant dialog. Check the information-confirmation box and choose the green **Confirm Schedule** button above the punctuality reminder. A light-blue YES/NO dialog with a blurred backdrop shows the selected date and time: **NO**, Escape, or clicking outside preserves the draft; **YES** revalidates it, creates one demo request, and opens **Schedule Complete!**.

The completion screen hides the sidebar and shows the reference's large green check mark, success message, confirmed date/time card, request reference, and **Back to Dashboard** button. The request snapshot is available under **My Request**. Completion details stay in memory for the current visit and are cleared on refresh, logout, or account change. Opening the completion URL without a confirmed request returns to the Registration Form. The confirmation dialog and completion screen support mobile layouts and dark mode.

Required fields and appointment hours are checked before advancing or confirming. The draft is saved separately for each account, independently of Grade Slip and ID Printing, and survives navigation, refresh, and logout. Older enrollment-only drafts retain their values and return to Enrollment Details to supply the new date and time. Drafts clear after a successful confirmation. The information-confirmation box must be checked again after editing or restoring a draft.

The inline **RTU AI ASSISTANT** panel greets the signed-in student and answers questions using the portal's existing local keyword-based guidance. Conversation text stays in memory and resets on logout or account change. The blue workspace, form controls, assistant, progress indicator, and autosave footer support mobile layouts and dark mode.

### Profile editing

Click the name/avatar in the header to open the account dropdown, then select **My Profile**, **Settings**, or **Log out**. On mobile, tap the avatar. The dropdown closes when you select a page, click outside, move focus outside, or press Escape.

Profile fields start in read-only mode. Select the pencil **Edit** button beside **Personal Information** to edit your full name, year level, program, semester, email address, optional phone number, and address. Valid changes are automatically saved to the signed-in account's browser-local profile. Select **Done** to save any pending changes and return to read-only mode; invalid entries keep editing open and receive focus. On small screens, the control shows a pencil to edit and a check mark to finish. Student number remains fixed as the account's sign-in identifier. Saved profile details remain after reload or logout, and the name and program label update throughout the profile. Existing saved profiles from before academic editing are supported. Profile saving is local to this browser and does not update university records.

### Settings

Open **Settings** from the account dropdown, or visit `#/settings` while signed in. The section menu switches between:

- **Account Information:** a reference-style account summary with a pencil **Edit Info** control. Name, year level, program, semester, phone, email, and address are editable; student ID remains the sign-in identifier. Valid edits autosave and stay synchronized with My Profile. Choose **Done** to finish editing.
- **Change Password:** enter your current password and confirm a new password of at least eight characters. The saved password hash is updated, and subsequent sign-in requires the new password. This works for registered accounts and the original demo account.
- **Notification Settings:** reference-style left-aligned switches for **Service Updates**, **Announcement**, and **Reminders**, with italic descriptions. Service Updates controls demo request confirmations, Announcement controls the header badge, and Reminders saves the account's deadline-reminder preference. The demo does not currently have scheduled deadlines to send reminders for. All three choices are saved per account, including across refreshes; existing saved service/announcement choices are preserved.
- **Privacy and Security:** displays the supplied **Privacy Policy** and **How We Protect Your Information** content in the reference-style panel. Expand **Session preferences** below the policy to control whether sign-in survives refresh or to log out. Turning off remembered sign-in clears the tab's session marker; the next refresh requires login.

Preferences are saved per account in `localStorage`. Announcement alerts control the actual unread header badge and announcement-notification list; published notices remain accessible when alerts are disabled. The menu supports keyboard arrow keys, Home, and End, and rearranges above the panel on smaller screens. The **RTU AI ASSISTANT** shortcut opens the existing assistant dialog.

### Appearance

Use the moon/sun button beside the header's notification and account controls to switch between **light mode** and **dark mode**. The button displays the mode you can switch to, with an accessible label and pressed state. The theme applies to every dashboard route, the account dropdown, document dialogs, and the assistant. It is saved with the signed-in account's preferences and restored after refresh or the next sign-in. Each account defaults to light mode until changed. Logging out returns the login screen to light mode. If storage is unavailable, switching still works for the current visit.

Registration validates required fields, email format and the development password policy (8–128 characters; use a long, unique passphrase). New password records use salted PBKDF2-SHA-256 hashes with 600,000 iterations; legacy 100,000-iteration hashes remain compatible. No plaintext password is persisted. Hashing uses Web Crypto on localhost/HTTPS. Recovery remains a preview: it sends no email/link/token and changes no password. The policy is not asserted as an official RTU requirement.

Demo accounts are checked in client-side JavaScript using this browser's saved data; no account details or passwords are sent to a server. This browser-local demo does not provide production authentication or university account creation. Official authentication, records, request processing, and password recovery require a backend integration.
