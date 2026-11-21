# Supabase Realtime notifications

Uses the existing authenticated Supabase client and Postgres Changes. No paid add-on, push service, or secret key. One channel per signed-in tab, coalesced refreshes, 60-second foreground reconciliation, refresh on focus/reconnect, and cleanup on logout/session invalidation. Realtime is not background OS push.

## Database setup
The migration enable_portal_realtime was applied to RTU_Scheduling and publication membership verified for requests, appointments, notifications, announcements, announcement_reads. Existing RLS remains in force. For another project, add those tables to supabase_realtime publication in the dashboard. Subscribe to INSERT/UPDATE only; re-fetch on reconciliation for deletion, expiry and revoked visibility. No table data modified.

## QA before merge/deployment
- Sign in as student and staff in separate browsers; keep both open.
- Submit a document request; staff queue and notification count should update without reload.
- Approve, reschedule, mark ready and release; student records and database notification bell should update.
- Publish an announcement with an authorized publishing account; student feed and badge should update. Drafts must not be visible to students. Open notice to sync read status.
- Check that students cannot receive another student's request or notification.
- Verify logout, account switching, reconnect, and no toast storm on initial page load.
- Verify notification preferences; check scheduled/expired notices within reconciliation interval.
- Confirm GitHub Pages deployment and hard refresh once to load versioned scripts.
- Support tickets and FAQs remain browser-only and are not integrated by this PR.

## Rollback
Revert the GitHub PR. Publication membership is a separate database setting and is not reverted by GitHub. If desired, remove the five tables from supabase_realtime publication (not DROP TABLE). Do not remove tables used by other clients. Existing polling resumes with the previous frontend.

Browser end-to-end tests pending. Database publication membership verified.
