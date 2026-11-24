# Ten-minute inactivity policy

Student and staff use the same browser-level timeout. Genuine interaction extends the deadline; background fetches, notifications and token refresh do not. At nine minutes a warning offers Stay Logged In or Log Out. Refreshing/reopening within the existing deadline restores the session without resetting the clock. After expiration, login is required. Existing sessions created before this change must sign in once.

The activity record is keyed by Supabase session ID, not email or password. Cross-tab storage events synchronize the timer. This is browser-level protection, not a server-side JWT revocation guarantee; use server-enforced session policies before production.

## Manual acceptance tests
- Sign in as student, refresh and reopen before ten minutes; verify no second login.
- Leave portal idle nine minutes; verify warning appears. Choose Stay Logged In and verify warning disappears and ten-minute deadline resets.
- Leave it idle ten minutes; verify login screen and expiry message.
- Close browser and reopen after ten minutes; verify protected dashboard does not render.
- Repeat as staff, including an open ticket conversation.
- Open two tabs; activity in one should extend the shared deadline; expiration or logout should invalidate both.
- Verify background realtime notifications do not extend deadline.
- Verify manual logout, password reset and password changes still work.
- Verify no credentials are stored by the inactivity feature.

No database schema changes are required. Browser acceptance tests are pending.
