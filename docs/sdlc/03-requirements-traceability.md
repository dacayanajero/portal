# Requirements traceability matrix

Retrospective requirement IDs are assigned for documentation, not presented as original stakeholder-approved IDs. Test procedures are in the accompanying register. Merged implementation does not mean acceptance passed.

| ID | Requirement | Design / implementation | Change evidence | Verification |
|---|---|---|---|---|
| FR-01 | Register and authenticate student accounts | Supabase Auth, profiles | [#2](https://github.com/dacayanajero/portal/pull/2) | TC-01 |
| FR-02 | Submit and track academic document requests | requests, portal-supabase-storage.js | [#4](https://github.com/dacayanajero/portal/pull/4) | TC-02 |
| FR-03 | Schedule appointments with overlap safeguards | appointments, booking RPC and lock | [#4](https://github.com/dacayanajero/portal/pull/4), [#8](https://github.com/dacayanajero/portal/pull/8) | TC-03 |
| FR-04 | Review requests and persist preparation checks | request lifecycle and checklist | [#5](https://github.com/dacayanajero/portal/pull/5), [#6](https://github.com/dacayanajero/portal/pull/6) | TC-04 |
| FR-05 | Mark prepared documents released | request release workflow | [#9](https://github.com/dacayanajero/portal/pull/9) | TC-05 |
| FR-06 | Publish announcements and read status | announcements, versions, reads | [#12](https://github.com/dacayanajero/portal/pull/12) | TC-06 |
| FR-07 | Receive live user-specific notifications | notifications, portal-realtime.js | [#14](https://github.com/dacayanajero/portal/pull/14), [#15](https://github.com/dacayanajero/portal/pull/15) | TC-07 |
| FR-08 | Create and resolve support tickets | support_tickets, support_messages | [#18](https://github.com/dacayanajero/portal/pull/18), [#19](https://github.com/dacayanajero/portal/pull/19) | TC-08 |
| FR-09 | Interpret natural-language service inquiries | portal-nlp.js, assistant-service.js | [#22](https://github.com/dacayanajero/portal/pull/22) | TC-09 |
| FR-10 | Report request and release statistics | report-service.js, staff-reports.js | [Phase G](../../PHASE-G.md) | TC-10 (known defect) |
| FR-11 | Recover account password | Supabase email recovery | [#7](https://github.com/dacayanajero/portal/pull/7) | TC-11 |
| NFR-01 | Restrict records to authorized users and roles | RLS, staff_capabilities, profile role | [#20](https://github.com/dacayanajero/portal/pull/20), [#18](https://github.com/dacayanajero/portal/pull/18) | TC-12 |
| NFR-02 | Expire browser session after ten minutes idle | accounts.js, session timeout policy | [#21](https://github.com/dacayanajero/portal/pull/21) | TC-13 |
| NFR-03 | Preserve booking integrity under concurrent load | transaction lock, atomic RPC | [#8](https://github.com/dacayanajero/portal/pull/8) | TC-03 |
| NFR-04 | Avoid inventing official information or exposing private records in NLP answers | intent fallback, authenticated account scope | [#22](https://github.com/dacayanajero/portal/pull/22) | TC-09, TC-12 |
| NFR-05 | Preserve safe rendering and accessible interaction | text rendering, labeled UI controls | source review; no comprehensive audit claimed | TC-14 |
| NFR-06 | Support repeatable release and rollback | Git history, deployment docs | [#10](https://github.com/dacayanajero/portal/pull/10), [#11](https://github.com/dacayanajero/portal/pull/11) | TC-15 |

Acceptance owner and sign-off: to be assigned by the team. Stakeholder approval and performance targets remain unverified. FAQ storage remains browser-local; no cross-device persistence is claimed.
