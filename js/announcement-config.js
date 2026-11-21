"use strict";

// Deployment-managed prototype capabilities. These are not official RTU policies.
window.PortalAnnouncementPolicy = Object.freeze({
  developmentOnly: true,
  approvalRequired: false,
  separateApprover: false,
  categories: Object.freeze(["Academic Services", "Document Requests", "Appointment Advisories", "Office Announcements", "System Maintenance", "General Announcements"]),
  priorities: Object.freeze(["Normal", "Important", "Urgent"]),
  audiences: Object.freeze(["All Students"]), // No secure group targeting is connected.
  defaultCapabilities: Object.freeze(["view", "create", "editOwnDrafts"]),
  accountCapabilities: Object.freeze({
    // Explicit grant to the existing provisioned demo employee, not every staff account.
    "2020-123456": Object.freeze(["view", "create", "editOwnDrafts", "editAny", "review", "approve", "publish", "archive"]),
  }),
});
