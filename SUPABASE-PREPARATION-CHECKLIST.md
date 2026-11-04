# Phase 4: Supabase preparation checklist fix

The Staff Portal's five preparation checkboxes previously called a deliberately unsupported local function, so each check immediately reverted. This PR implements database-backed check updates.

## Required order

1. Open Supabase Dashboard > **SQL Editor > New query**.
2. Copy and run the entire `sql/portal_patch_4_preparation_checklist.sql` from this branch.
3. Inspect and merge this PR after the SQL patch succeeds.
4. Hard-refresh your GitHub Pages RTU Portal. Sign in with an **active staff** account.
5. Choose a **test** request that is already in **Processing** status (staff should first approve and start processing).
6. Tick **Required academic information checked**. The checkbox should stay selected and show **Saved to Supabase**. The progress should advance by one.
7. Reload and reopen the same request. Verify that the check and its staff/time metadata are still present.
8. Complete the other four test checks. The **Mark Ready for Pickup** button should enable. Confirm it, then verify **Table Editor > requests** shows `Ready for Pickup` and `ready_at`.
9. Reopen the same request with another authorized staff login and confirm the saved status/checks are visible there.

### How it works

- The frontend calls `save_request_preparation_check` for each checked/unchecked item, then reloads the shared Supabase request cache and re-renders the panel.
- The RPC confirms the caller is active staff, verifies a valid checklist item, and accepts changes only while the request is **Processing**.
- Completed checks are stored under `requests.processing.checks`, including `checked`, `version`, `timestamp`, `actor`, `staffId`.
- `mark_request_ready` advances the request only when the server trigger confirms all five required checks are saved against the current development policy version.
- A separate staff-only audit entry records each checklist change.
- Student accounts cannot update the checklist through these RPCs.
- The confirmation dialog now awaits database writes; it does not claim success early.

### Known limitations

- **Development-only checklist**: These five steps are not validated or approved institutional RTU policy. Complete them only for test data. Before real use, an authorized administrator must approve a real workflow and server-side verification requirements.
- This patch does **not** enable recipient verification or final document release. Those remain intentionally blocked.
- It also does not connect internal processing notes or other local-only modules.
- The SQL editor must run the patch manually; merging a GitHub PR **cannot** alter your live Supabase database.
- Do **not** rerun the original schema or erase existing data. This is an additive migration with a targeted trigger on `public.requests`.
- If you get a missing RPC error, verify you're using the same Supabase project, the SQL was executed successfully, and API schema cache has refreshed.
- If the checkbox reverts and displays a permissions error, verify the logged-in user's `profiles.role` is staff/admin and `is_active = true`.

## Security caution

The server-side guard validates the five saved flags, not the underlying truth of the document verification actions. Authorized staff must check these tasks only after doing the actual work. Additional controls are needed for a real university records workflow.
