# Supabase Auth integration (Phase 2)

This update connects the **existing portal login and registration interface** to Supabase Authentication and reads the signed-in account from `public.profiles`.

## Before merging / testing

1. Verify `js/supabase-config.js` contains the correct **Supabase Project URL** and **publishable** key. Never use a secret/service-role key in GitHub Pages.
2. Run `sql/portal_patch_1.sql` in your **existing Supabase project** if your `profiles` table does not have the `college` column. Do not rerun the original full schema.
3. In **Authentication > URL Configuration**, use `https://dacayanajero.github.io/portal/` as the portal Site URL. Include `https://dacayanajero.github.io/portal/reset-password.html` in Redirect URLs. For local testing, also allow the exact address served by Live Server, for example `http://localhost:5500/reset-password.html`.
4. In **Authentication > Sign In / Providers**, enable email/password signup. For real accounts, keep email confirmation enabled and use an accessible email address.
5. Use test data. Student-number ownership is **not verified** by this prototype.
6. For delivery to students, configure an email provider in the project's SMTP settings. Supabase's built-in sender limits delivery to organization team addresses. The reset-password email template should link to `{{ .ConfirmationURL }}` so Supabase verifies the link before returning to the portal.

## Browser test

- Register a new test student using the **main portal**. Confirm the email if required.
- Verify the account in **Authentication > Users** and its automatically inserted row in **Table Editor > profiles**.
- Sign in with the **email** and password. The student dashboard should display the profile's student number and name.
- Refresh: the Supabase session should restore.
- Sign out: the same browser should return to the login screen.
- Choose **Forgot Password?** and enter the sign-in email for a test mailbox you control. Open the email link, enter and confirm a new password, then return to the portal and sign in using that password. A direct visit to the reset page displays instructions for requesting a link.
- A staff login requires an already provisioned account with `profiles.role = 'staff'` or `'admin'`. Do **not** let a student self-promote in frontend code.

For local focused tests, run `npm run test:auth`.

## Boundaries and known limitations

- **Only authentication and profile identity** have moved to Supabase. Request, appointment, profile editing, notification, reports, FAQ, and support service persistence remain browser-local. Do not treat them as shared/official university transactions.
- The legacy demo accounts are no longer accepted for authentication; previously registered browser-only accounts are not automatically migrated. Register a new test account with Supabase.
- The legacy **remember session** toggle is disabled because Supabase currently manages browser persistence; sign out when finished.
- Staff directory is loaded asynchronously from `profiles`. The UI still contains browser-local capability checks; database RLS must remain authoritative. Staff modules will need further integration.
- Existing `portal-phase-*-smoke.js` tests were written for demo account storage and may fail; they require rewriting for Supabase Auth. The new `test:auth` exercises the auth adapter in isolation.
- This change has **not** been end-to-end tested against your live Supabase project; perform the steps above before rolling out.
