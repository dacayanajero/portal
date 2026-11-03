"use strict";

window.PortalSupportPolicy = Object.freeze({
  categories: Object.freeze(["Document Requests", "Appointments", "Student Records", "Account and Login", "Portal Technical Support", "General Academic Services"]),
  priorities: Object.freeze(["Normal", "High", "Urgent"]),
  defaultCapabilities: Object.freeze(["viewAssigned", "reply", "note", "manage", "faqView", "faqCreate", "faqEditOwn"]),
  accountCapabilities: Object.freeze({
    "2020-123456": Object.freeze(["viewAll", "reply", "note", "manage", "assign", "resolve", "close", "reopen", "faqView", "faqCreate", "faqEditOwn", "faqManage", "faqPublish", "faqArchive"]),
  }),
  allowStudentReopenResolved: true,
  allowStaffReopenClosed: true,
  bundledGuideEnabled: true, // Trusted portal usage content, never official RTU policies.
});
