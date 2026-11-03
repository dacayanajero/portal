"use strict";

window.PortalReportExport = Object.freeze({
  csv(dataset) {
    const cell = (value) => {
      let text = String(value ?? "");
      if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return `\uFEFF${[...dataset.metadata, ...dataset.rows].map((row) => row.map(cell).join(",")).join("\r\n")}`;
  },
});
