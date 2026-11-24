# Supabase support ticket integration

## Deployment order
1. Review SUPABASE-SUPPORT-TICKETS.sql in this branch. Run it once in the RTU_Scheduling SQL Editor before merging; the frontend RPCs require it. No live database changes were made by this PR.
2. Review staff permissions in staff_capabilities. Existing staff have viewAssigned/reply/note/manage; grant assign, resolve, close, reopen and viewAll only to designated support supervisors as appropriate. Do not grant them to students.
3. Merge the PR, deploy GitHub Pages, hard refresh and sign in again.
4. Test with two different student accounts and an authorized staff account on different browsers.

## Acceptance tests
- Submit a ticket with subject/description and optional owned request/appointment. Verify one support_tickets row and one initial support_messages row; a retry must not duplicate either.
- Verify an invalid linked record or empty description causes no partial ticket.
- Confirm the generated reference number is displayed, and the other student cannot see the ticket or its messages.
- Verify staff sees the unassigned queue, replies and adds a private note; the student sees only the public reply.
- Check staff assignment, priority and permitted status transitions, including a resolution summary, reopening and closure.
- Verify new tickets/replies/status updates appear without manual refresh, and clicking a database notification opens the matching ticket.
- Verify logout clears in-memory ticket data and switching accounts cannot leak it.
- Confirm requests, appointments and announcements still work.

## Scope and limitations
Existing local demo tickets are not automatically imported; browser-only FAQ management is unchanged. Attachments are not included. Existing notification trigger routing is reused and requires a separate review of authorized staff recipient scope. The adapter reads RLS-scoped records with the existing API default row limit; backend pagination is future work. Browser end-to-end and migration execution have not been performed. Rollback: revert the frontend PR; the additive SQL functions/column may remain, but policy/publication changes require separate database rollback review. Never drop existing ticket data.
