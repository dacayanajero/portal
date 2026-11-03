"use strict";

// Development-only capability configuration, not institutional authorization.
window.PortalReportPolicy = Object.freeze({
  defaultCapabilities: Object.freeze(["aggregate"]),
  accountCapabilities: Object.freeze({
    // Explicit demo grant. Student identities and staff-comparison metrics are excluded.
    "2020-123456": Object.freeze(["aggregate", "details", "export"]),
  }),
  // Set an approved privacy threshold before enabling institutional program reporting.
  // Zero means no small-cohort suppression in this local development prototype.
  minimumProgramGroupSize: 0,
});
