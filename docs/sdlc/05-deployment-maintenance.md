# Deployment, maintenance and evidence control

## Environment
Frontend: [GitHub Pages portal](https://dacayanajero.github.io/portal/). Backend: Supabase Auth, PostgreSQL and Realtime. The browser uses a publishable key; never commit a service-role or secret key. The deployed commit and database migration state must be recorded at each release; repository merge status alone is insufficient.

## Release process
1. Record requirement or defect and acceptance criteria.
2. Create a feature branch and implement the smallest relevant change.
3. Run automated tests; review security, permissions and database dependencies.
4. Test with dedicated student and staff accounts in preview.
5. Review pull request; for SQL changes, back up schema/data and document compatible migration and recovery order.
6. Merge after approval; verify GitHub Pages deployment and correct asset revision.
7. Run post-deployment smoke checks and update traceability and defect registers.
8. If a defect is introduced, revert the relevant frontend commit when appropriate and use a separately reviewed database rollback. A Git revert does not undo SQL changes automatically.

## Maintenance backlog as of 24 November 2026
| Priority | Work | Status |
|---|---|---|
| Critical | Export full current schema with RLS, functions, triggers and grants; verify rebuild | Pending |
| Critical | Review security advisor findings and verify role permissions | Pending |
| High | Fix report release validation and reconcile CSV exports | Pending |
| High | Update outdated README and feature persistence documentation | Pending |
| High | Produce verified ERD and data dictionary | Pending |
| Medium | Review unused AI history/preferences tables and staff_directory view; retain FAQ integration option | Analysis only; no deletion approved |
| Medium | Evaluate centralized FAQ knowledge and cross-device preferences | Proposed |
| High | Execute final NLP, support, scheduling and session acceptance tests | Pending |

## Release record template
Release date / version or SHA / PR links / migration IDs / tester / approval / deployment URL / test evidence / rollback steps / result.

## Annex evidence checklist
- Approved proposal, objectives, scope and original Gantt chart: team to attach.
- Stakeholder requirements and approvals: team to attach if available.
- UI wireframes, use case, DFD, verified physical ERD and data dictionary: team to attach.
- SDLC methodology, dated GitHub history, RTM, test register and defect log: provided in this folder.
- Actual automated and manual test logs, screenshots and acceptance sign-off: pending.
- Deployment proof, user and administrator manuals: team to attach or complete.

Keep evidence anonymized. Do not upload screenshots containing private records, credentials, tokens or secrets. Update this folder when requirements, deployment or test status changes.
