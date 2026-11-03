"use strict";

// Dependency-free SVG charts with native title tooltips and accessible data tables.
window.PortalReportCharts = (() => {
  const colors = ["#3265b8", "#d6a528", "#43a29c", "#8b6ec4", "#d97653", "#6c91b7", "#bc647e", "#638b55"];
  const colorMap = new Map();
  [...window.PortalRequestService.SERVICES, ...window.PortalRequestService.STATUSES, ...window.PortalAppointmentService.STATUSES].forEach((label, index) => { if (!colorMap.has(label)) colorMap.set(label, colors[index % colors.length]); });
  colorMap.set("Other / Unrecognized Service", "#6c91b7");
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function svgNode(tag, attributes = {}, text) { const node = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value))); if (text !== undefined) node.textContent = text; return node; }
  function chart(title, series, type = "bar", options = {}) {
    const unit = options.unit || "records";
    const figure = el("figure", undefined, "report-chart"); figure.append(el("figcaption", title));
    if (options.description) figure.append(el("p", options.description, "demo-note"));
    const maximum = Math.max(0, ...series.map((entry) => Number(entry.value) || 0));
    if (!series.length || maximum === 0 && !options.measured) figure.append(el("p", options.empty || "No matching records for this reporting period.", "staff-empty"));
    else {
      const svg = svgNode("svg", { viewBox: "0 0 700 260", role: "img", "aria-label": `${title}. ${unit}. Exact values are in the accompanying data table.`, tabindex: "0" });
      svg.append(svgNode("title", {}, `${title} (${unit})`));
      if (type === "donut") {
        const total = series.reduce((sum, entry) => sum + entry.value, 0); let offset = 0; const circumference = 2 * Math.PI * 83;
        series.forEach((entry, index) => {
          if (!entry.value) return;
          const length = entry.value / total * circumference;
          const segment = svgNode("circle", { cx: 350, cy: 125, r: 83, fill: "none", stroke: colorMap.get(entry.label) || colors[index % colors.length], "stroke-width": 40, "stroke-dasharray": `${length} ${circumference - length}`, "stroke-dashoffset": -offset, transform: "rotate(-90 350 125)" });
          segment.append(svgNode("title", {}, `${entry.label}: ${entry.value} (${(entry.value / total * 100).toFixed(1)}%)`)); svg.append(segment); offset += length;
        });
        svg.append(svgNode("text", { x: 350, y: 125, "text-anchor": "middle", "font-size": 25 }, String(total)), svgNode("text", { x: 350, y: 146, "text-anchor": "middle" }, unit));
      } else {
        const max = maximum || 1; const left = type === "bar" ? 220 : 55; const top = 20; const width = 700 - left - 30; const height = 195;
        if (type === "bar") {
          const rowHeight = Math.min(38, height / Math.max(1, series.length));
          series.forEach((entry, index) => {
            const y = top + index * rowHeight; const label = entry.label.length > 29 ? `${entry.label.slice(0, 27)}…` : entry.label;
            svg.append(svgNode("text", { x: left - 10, y: y + rowHeight * .57, "text-anchor": "end" }, label));
            const bar = svgNode("rect", { x: left, y, width: entry.value / max * (width - 65), height: rowHeight * .65, rx: 3, fill: colorMap.get(entry.label) || colors[index % colors.length] });
            bar.append(svgNode("title", {}, `${entry.label}: ${entry.value} ${unit}${entry.sampleSize ? `; ${entry.sampleSize} eligible records` : ""}`)); svg.append(bar);
            svg.append(svgNode("text", { x: left + entry.value / max * (width - 65) + 6, y: y + rowHeight * .5 }, unit === "hours" ? entry.value > 0 && entry.value < .01 ? "<0.01" : entry.value.toFixed(2) : String(entry.value)));
          });
          svg.append(svgNode("line", { x1: left, y1: 12, x2: left, y2: top + Math.max(1, series.length) * rowHeight, stroke: "currentColor", opacity: .4 }), svgNode("text", { x: left, y: 248 }, `0 → ${unit === "hours" && maximum > 0 && maximum < .01 ? maximum.toPrecision(2) : maximum.toFixed(unit === "hours" ? 2 : 0)} ${unit}`));
        } else {
          const plotMax = Math.max(4, Math.ceil(max / 4) * 4);
          for (let index = 0; index <= 4; index++) {
            const y = top + height - index / 4 * height;
            svg.append(svgNode("line", { x1: left, y1: y, x2: left + width, y2: y, stroke: "currentColor", opacity: .2 }), svgNode("text", { x: left - 8, y: y + 4, "text-anchor": "end" }, String(plotMax * index / 4)));
          }
          const points = series.map((entry, index) => [left + (series.length === 1 ? width / 2 : index / (series.length - 1) * width), top + height - entry.value / plotMax * height]);
          svg.append(svgNode("polyline", { points: points.map((point) => point.join(",")).join(" "), fill: "none", stroke: "#4381d6", "stroke-width": 3 }));
          points.forEach(([x, y], index) => { const point = svgNode("circle", { cx: x, cy: y, r: 3.5, fill: "#d6a528" }); point.append(svgNode("title", {}, `${series[index].label}: ${series[index].value} ${unit}`)); svg.append(point); });
          const step = Math.max(1, Math.ceil(series.length / 5));
          series.forEach((entry, index) => { if (index % step === 0 || index === series.length - 1) svg.append(svgNode("text", { x: points[index][0], y: 238, "text-anchor": index === 0 ? "start" : index === series.length - 1 ? "end" : "middle" }, entry.label)); });
          svg.append(svgNode("text", { x: 15, y: 12 }, unit), svgNode("text", { x: 350, y: 258, "text-anchor": "middle" }, "Reporting date / bucket"));
        }
      }
      const visual = el("div", undefined, "report-chart-visual"); visual.tabIndex = 0; visual.setAttribute("role", "region"); visual.setAttribute("aria-label", `${title} visualization, scroll horizontally on small screens`); visual.append(svg); figure.append(visual);
    }
    if (type === "donut" || type === "bar") {
      const legend = el("ul", undefined, "report-chart-legend"); series.forEach((entry, index) => { const item = el("li"); const swatch = el("span", undefined, "report-swatch"); swatch.style.background = colorMap.get(entry.label) || colors[index % colors.length]; swatch.setAttribute("aria-hidden", "true"); item.append(swatch, el("span", entry.label)); legend.append(item); }); figure.append(legend);
    }
    const details = el("details"); details.append(el("summary", `Accessible data table: ${title}`));
    const wrap = el("div", undefined, "report-chart-data"); wrap.tabIndex = 0;
    const table = el("table"); const head = el("thead"); const heading = el("tr"); ["Category / date", unit, ...(options.measured ? ["Eligible records"] : [])].forEach((label) => { const cell = el("th", label); cell.scope = "col"; heading.append(cell); }); head.append(heading);
    const body = el("tbody"); series.forEach((entry) => { const row = el("tr"); row.append(el("td", entry.label), el("td", String(entry.value))); if (options.measured) row.append(el("td", String(entry.sampleSize))); body.append(row); });
    table.append(head, body); wrap.append(table); details.append(wrap); figure.append(details);
    return figure;
  }
  return Object.freeze({ chart });
})();
