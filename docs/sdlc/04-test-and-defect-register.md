# Test and defect register

## Execution protocol
Use dedicated test accounts and nonproduction records. Record date/time (Manila), tester, build SHA, environment, actual result, pass/fail, and anonymized evidence link. All tests below are **not yet independently executed for this register** unless explicitly marked observed. Do not use merged PRs as pass evidence.

| ID | Test procedure | Expected result | Status |
|---|---|---|---|
| TC-01 | Register test student, confirm email, sign in | Authorized student dashboard loads | Pending |
| TC-02 | Submit Grade Slip and refresh/relogin | One persisted request appears in student and staff views | Pending |
| TC-03 | Submit competing bookings for same full slot, cancel/reschedule | Capacity enforced; no partial request; date/time consistent | Pending |
| TC-04 | Staff saves checklist and reloads; attempt ready before checklist complete | Checks persist; premature transition rejected | Pending |
| TC-05 | Mark ready document released | Student sees Released; actual timestamp retained | Pending |
| TC-06 | Create draft, publish, read and expire announcement | Draft hidden; published item visible; read state persists | Pending |
| TC-07 | Use two browsers; create request/update status | Correct account receives live update; read notice dismissed | Pending |
| TC-08 | Create ticket, reply, add private note, resolve and close | Correct lifecycle; private note hidden from student | Pending |
| TC-09 | Ask for regiform, typo gradeslp, Taglish appointment and unknown topic | Correct route or clarification; own status only | Pending final run |
| TC-10 | Report Nov 21–23 release period with all filters | Grade Slip and Registration Form eligible with four records each if baseline unchanged | Observed defect BUG-01 |
| TC-11 | Request reset and use valid email recovery link | Password can be reset and new sign-in succeeds | Pending |
| TC-12 | Test cross-account reads, role escalation and unauthorized updates | No unauthorized access or modification | Pending |
| TC-13 | Remain active, then idle ten minutes; reopen before/after deadline | Active session retained; idle session expires | Pending |
| TC-14 | Keyboard navigation, labels, malicious text input, error feedback | Accessible controls and safe text display | Pending |
| TC-15 | Deploy a reviewed revision in preview and rehearse rollback | Matching frontend/schema; rollback procedure documented | Pending |

## Existing automated test artifacts
Run in repository root with Node installed:
```sh
node portal-phase-d-smoke.js
node portal-phase-e-smoke.js
node portal-phase-f-smoke.js
node portal-phase-g-smoke.js
node portal-phase-h-smoke.js
node portal-phase-i-smoke.js
node tests/portal-nlp.test.cjs
```
These scripts cover service-level behavior and fixtures. They do not replace live integration or usability testing. Record the actual command, exit code and output; no passing result is asserted here. See [README](../../README.md) and the feature-specific QA guides.

## Defect register
| ID | Finding | Evidence / root cause | Status |
|---|---|---|---|
| BUG-01 | Report mean N/A and chart empty | 24 Nov read-only inspection: 10 released records with valid database timestamps; all lacked old handoverConfirmed field required by report-service.js | Open; align validation with current release workflow and rerun report/CSV tests |
| BUG-02 | Checklist persistence and error feedback | PRs #5–6 | Merged fix; regression pending |
| BUG-03 | Booking overlaps, cancellation and reschedule inconsistencies | PR #8 | Merged fix; regression pending |
| BUG-04 | Announcement persistence and cached assets | PRs #12–13; earlier change reverted in #11 | Merged fix; regression pending |
| BUG-05 | Notifications required manual refresh / read items remained | PRs #14–15 | Merged fix; regression pending |
| BUG-06 | Contact support persistence and ticket completion | PRs #18–19 | Merged fix; regression pending |
| BUG-07 | Staff role/identity display | PR #20 | Merged fix; regression pending |
| BUG-08 | Browser session stayed signed in after inactivity | PR #21 | Merged fix; regression pending |
| BUG-09 | Privileged view and function permission warnings | Live security advisor inspection, 24 Nov | Open; review individually before changes |

## Test execution record template
Test ID / date / tester / commit / environment / input / expected / actual / result / evidence / linked defect / retest date.
