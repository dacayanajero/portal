# Supabase document requests and appointment scheduling (Phase 3)

This branch replaces browser-local request and appointment persistence with Supabase-backed operations, while keeping the existing RTU frontend pages.

## REQUIRED: Apply SQL migration before merging

1. Open Supabase Dashboard > **SQL Editor** > New query.
2. Open `sql/portal_patch_3_requests_appointments.sql` in this branch, copy the whole file, and **Run** it in your existing Supabase project.
3. Do **not** rerun the original full v2 schema or drop any tables. The patch creates two RPC functions and improves the existing slot-capacity check.
4. Verify the two RPCs exist:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
and routine_name in (
  'create_document_request_and_appointment',
  'cancel_document_request_and_appointment'
)
order by routine_name;
```

The results should contain **two rows**. You must be signed in with an active `student` profile for student request submission. Your project must also have the original `requests`, `appointments`, `audit_log`, and related Row Level Security policies.

## Changes

- New `js/portal-supabase-storage.js` substitutes the request/appointment services' persistent methods, retaining their synchronous **read/display** interfaces via a database-loaded in-memory cache. It never reads the old request or appointment localStorage.
- Submissions now await a successful Supabase insert or atomic RPC **before** opening the success page.
- The Grade Slip, Registration Form, and ID Printing forms save a document request + one-hour appointment transactionally.
- The quick generic request form saves a document request without an appointment, as before.
- My Requests and staff pages load saved records from Supabase after authenticated sign-in; logout clears cached records.
- Student correction resubmission and cancellation, staff request approval/rejection/status changes, and staff appointment status changes use Supabase.
- The database patch validates appointment durations and prevents competing bookings with overlapping time ranges and a transaction-level lock.

## Test using a dedicated TEST student and TEST staff account

1. Merge after SQL patch and review, then hard-refresh `https://dacayanajero.github.io/portal/`.
2. Log in as the test student. Ignore any old browser-local request records; those were never in Supabase and **are not migrated**.
3. Submit **Grade Slip** with a future weekday appointment inside 8:00 AM–5:00 PM.
4. Look in Supabase **Table Editor > requests**: confirm a `Pending Review` row.
5. Look in **Table Editor > appointments**: confirm a `Pending Confirmation` row with `request_id` equal to the new request UUID.
6. Log out, use an incognito browser, log in as the same test student, and check **My Requests**. The same reference number should appear.
7. Log in with a provisioned staff account in a different browser; see the request and appointment. Test approve and schedule confirmation. Reload the student page to see new statuses.
8. Use a second test student to request the same time slot; the database should reject it when capacity is 1. The failing submission must not leave a request without its appointment.

### Troubleshooting

- **Could not find function ... in schema cache**: SQL patch missing or not run in the configured Supabase project. Rerun the patch after verifying the correct project and wait for API schema cache to refresh.
- **permission denied / row-level security policy**: the signed-in profile role, grants, and RLS need to match the original v2 schema.
- **This time slot is full**: choose another day or time. Capacity is validated by the database, not the student's local view.
- **Old requests disappeared**: expected; old browser-local drafts/requests were not imported into the shared database. Their browser data is unchanged, but the new pages deliberately ignore it.
- **No records after sign-in**: use the browser console and the My Requests feedback for the Supabase query error. Verify `profiles` and signed-in Auth user belong to the same project.

## Important known boundaries

This is a staged prototype integration, **not a production-ready university records system**. We have **not** modified your live Supabase project or verified a full browser test against its real records.

- Document **preparation checklists**, **recipient verification**, and **release/handover** actions are intentionally blocked until they have secure database-backed workflows. These must not silently update localStorage or bypass server authorization.
- Appointment availability in the browser is **tentative**, because students cannot read other students' appointments under RLS. The server validates conflicts at submission. A later safe availability RPC can provide a real-time count without disclosing identities.
- Other modules (profile edits, announcements, FAQ, reports, notifications, help/support) still have local browser persistence, unless separately migrated.
- Existing browser-only requests are **not automatically uploaded**, because ownership, historical states and appointment capacity cannot be verified. You may retain old data for reference but must create fresh test requests.
- Student identity numbers from self-registration are still not institutionally verified. Do not use real student records without university authorization and a verification procedure.
