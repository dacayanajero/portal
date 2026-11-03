"use strict";

// Deployment-managed configuration. These examples are NOT official RTU policy.
// An authorized policy administrator must review these definitions, increment
// version, and replace the development checklist before operational use.
(() => {
  const examples = [
    { id: "student", label: "Student information verified", required: true },
    { id: "request", label: "Request details reviewed", required: true },
    { id: "academic", label: "Required academic information checked", required: true },
    { id: "prepared", label: "Document prepared", required: true },
    { id: "accuracy", label: "Document reviewed for accuracy", required: true },
  ];
  window.PortalDocumentPolicy = Object.freeze({
    version: "development-preparation-v1",
    services: Object.freeze(Object.fromEntries([
      "Grade Slip", "Registration Form", "ID Printing", "Transcript of Records", "Certificate of Enrollment",
    ].map((service) => [service, Object.freeze({
      configured: true,
      developmentOnly: true,
      items: Object.freeze(examples.map((item) => Object.freeze({ ...item }))),
    })]))),
    verification: Object.freeze({
      configured: false,
      methods: Object.freeze([]), // Approved { id, label } methods only; no ID images.
      allowRepresentative: false,
      releaseChecks: Object.freeze([]), // Optional approved { id, label } release requirements.
    }),
    exportAllowed: false, // Enable only after export permission has been approved.
  });
})();
