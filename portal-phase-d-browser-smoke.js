"use strict";

// Optional UI regression suite. Install Playwright outside the application, then
// set PLAYWRIGHT_MODULE to its module path if it is not on Node's search path.
// Uses an isolated browser profile and synthetic sessions; never real credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = __dirname;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }); response.end(content);
  });
});
let browser;
let passed = 0;
function pass(label) { passed++; console.log(`PASS ${label}`); }

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem("rtu.portal.session", "staff:2020-123456"));
  await page.goto(`${base}/#/staff/document-processing`);
  assert.equal(await page.evaluate(() => window.PortalApp.ready), true);
  await page.locator('[data-view="staff-document-processing"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("#document-stats .staff-stat-card").count(), 4);
  assert.equal(await page.locator("#document-stats strong").allTextContents().then((values) => values.every((value) => value === "0")), true);
  pass("Staff route mounts with restored staff session");
  const fixture = await page.evaluate(async () => {
    const account = await window.PortalAccounts.register({ fullName: "Phase D Student", accountNumber: "TEST-D-STUDENT", email: "phase-d@example.test", password: crypto.randomUUID(), college: "College of Information Technology", program: "BS Information Technology" });
    const service = window.PortalRequestService;
    const staff = window.PortalStaffContext.current();
    const actor = { role: "staff", accountNumber: staff.account.accountNumber, name: staff.profile.fullName };
    const create = (number, name, type = "Grade Slip") => service.create({ student: { accountNumber: number, fullName: name }, document: type, purpose: "Browser regression", details: { copies: "2", academicYear: "2026–2027", appointmentDate: "2099-10-30", appointmentStart: "08:00", appointmentEnd: "09:00" } });
    const target = create(account.accountNumber, account.fullName);
    service.updateStatus(target.id, service.STATUS.APPROVED, actor);
    for (let i = 0; i < 12; i++) {
      const request = create(`OTHER-${i}`, `Other Student ${i}`, service.SERVICES[i % service.SERVICES.length]);
      service.updateStatus(request.id, service.STATUS.APPROVED, actor);
    }
    const rejected = create("REJECTED", "Rejected Student"); service.updateStatus(rejected.id, service.STATUS.REJECTED, actor, { reason: "Test rejection" });
    const correction = create("CORRECTION", "Correction Student"); service.updateStatus(correction.id, service.STATUS.CORRECTION, actor, { reason: "Test correction" });
    return { id: target.id, account };
  });
  assert.equal(await page.locator("#document-rows tr").count(), 10);
  assert.match(await page.locator("#document-result-count").innerText(), /13 documents/);
  await page.locator("#document-next").click(); assert.equal(await page.locator("#document-rows tr").count(), 3);
  pass("Eligible queue, dynamic totals and pagination");
  await page.locator('#document-filters input[name="search"]').fill(fixture.id);
  assert.equal(await page.locator("#document-rows tr").count(), 1);
  await page.evaluate(() => { location.hash = "#/staff/requests"; });
  await page.locator('[data-view="staff-requests"]').waitFor({ state: "visible" });
  await page.evaluate((id) => document.dispatchEvent(new CustomEvent("portal:staffrequestopen", { detail: id })), fixture.id);
  await page.getByRole("button", { name: "Open Document Processing & Release", exact: true }).click();
  await page.locator('[data-view="staff-document-processing"]').waitFor({ state: "visible" });
  await page.locator("#document-details").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Start Processing", exact: true }).click();
  await page.locator("#document-confirm-cancel").click();
  assert.equal(await page.getByRole("button", { name: "Start Processing", exact: true }).evaluate((node) => node === document.activeElement), true);
  await page.getByRole("button", { name: "Start Processing", exact: true }).click();
  await page.locator("#document-confirm-submit").click();
  assert.equal(await page.evaluate((id) => window.PortalRequestService.get(id).status, fixture.id), "Processing");
  assert.equal(await page.getByRole("button", { name: "Mark Ready for Pickup", exact: true }).isDisabled(), true);
  assert.match(await page.locator("#document-details-body").innerText(), /Development preparation checklist/);
  const checks = page.locator("[data-preparation-check]");
  assert.equal(await checks.count(), 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(await checks.nth(i).isEnabled(), true);
    await checks.nth(i).check();
  }
  assert.equal(await page.getByRole("button", { name: "Mark Ready for Pickup", exact: true }).isEnabled(), true);
  await checks.nth(4).uncheck();
  assert.equal(await page.getByRole("button", { name: "Mark Ready for Pickup", exact: true }).isDisabled(), true);
  pass("Default development checks are interactive; readiness enables only after all required checks");
  await page.getByLabel("Add an internal note (not visible to students)").fill("PRIVATE NOTE <script>throw new Error('unsafe')</script>");
  await page.getByRole("button", { name: "Save internal note", exact: true }).click();
  assert.match(await page.locator("#document-details-body").innerText(), /PRIVATE NOTE/);
  assert.equal(await page.locator("#document-details-body script").count(), 0);
  pass("Internal notes safely render as text");
  await page.locator("#document-close").click();
  await page.reload(); assert.equal(await page.evaluate(() => window.PortalApp.ready), true);
  assert.match(await page.locator("#document-result-count").innerText(), /13 documents/);
  assert.equal(await page.evaluate((id) => window.PortalRequestService.get(id).processing.notes.length, fixture.id), 1);
  pass("Processing and internal notes survive refresh");

  // Supply test-only policy via response interception before modules initialize.
  // Official identity verification stays unconfigured in the repository.
  await page.route("**/js/document-processing-config.js", async (route) => {
    await route.fulfill({ contentType: "text/javascript", body: `window.PortalDocumentPolicy = ${JSON.stringify({
      version: "test-policy-only-v1",
      services: Object.fromEntries(["Grade Slip", "Registration Form", "ID Printing", "Transcript of Records", "Certificate of Enrollment"].map((type) => [type, { configured: true, items: [{ id: "prepared", label: "Test preparation complete", required: true }] }])),
      verification: { configured: true, methods: [{ id: "test-method", label: "Test verification method" }], allowRepresentative: false, releaseChecks: [] }, exportAllowed: true,
    })};` });
  });
  await page.reload(); assert.equal(await page.evaluate(() => window.PortalApp.ready), true);
  await page.locator('#document-filters input[name="search"]').fill(fixture.id);
  await page.getByRole("button", { name: "View / Manage", exact: true }).click();
  await page.getByLabel("Test preparation complete (required)").check();
  assert.equal(await page.getByLabel("Test preparation complete (required)").evaluate((node) => node === document.activeElement), true);
  await page.getByRole("button", { name: "Mark Ready for Pickup", exact: true }).click();
  await page.locator("#document-confirm-submit").click();
  assert.equal(await page.getByRole("button", { name: "Release Document", exact: true }).isDisabled(), true);
  assert.match(await page.locator("#document-details-body").innerText(), /Representative collection is not configured/);
  pass("Configured preparation allows readiness; release still requires verification");
  await page.getByRole("combobox", { name: /^Approved verification method/ }).selectOption("test-method");
  await page.getByLabel("I confirm that I completed the selected approved verification method for this recipient.").check();
  await page.getByRole("button", { name: "Record Recipient Verification", exact: true }).click();
  await page.getByRole("button", { name: "Release Document", exact: true }).click();
  assert.equal(await page.locator("#document-handover").isChecked(), false);
  await page.locator("#document-confirm-submit").click();
  assert.equal(await page.evaluate((id) => window.PortalRequestService.get(id).status, fixture.id), "Ready for Pickup");
  await page.locator("#document-handover").check(); await page.locator("#document-confirm-submit").click();
  assert.equal(await page.evaluate((id) => window.PortalRequestService.get(id).status, fixture.id), "Released");
  assert.match(await page.locator("#document-details-body").innerText(), /Explicitly confirmed/);
  pass("Recipient verification and explicit handover required for release");
  await page.locator("#document-close").click();
  await page.getByRole("button", { name: "Ready for Pickup", exact: true }).click();
  assert.equal(await page.locator("#document-rows tr").count(), 0);
  await page.getByRole("button", { name: "Release History", exact: true }).click();
  assert.equal(await page.locator("#document-rows tr").count(), 1);
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#document-export").click(); const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "document-release-history.csv");
  const stream = await download.createReadStream();
  const parts = []; for await (const chunk of stream) parts.push(chunk);
  const csv = Buffer.concat(parts).toString("utf8");
  assert.match(csv, /REL-REQ-/);
  assert.doesNotMatch(csv, /TEST-D-STUDENT|PRIVATE NOTE|Test verification method|Phase D Student/);
  pass("Released document leaves pickup queue, persists in history and exports when permitted");
  await page.locator('#document-filters input[name="from"]').fill("2100-01-01");
  assert.equal(await page.locator("#document-rows tr").count(), 0);
  await page.getByRole("button", { name: "Clear Filters", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("#document-rows tr").length === 1);
  pass("Release history date filtering and clear filters");
  await page.evaluate(() => { location.hash = "#/staff/dashboard"; });
  await page.locator('[data-view="staff-dashboard"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("#staff-stat-released").innerText(), "1");
  await page.evaluate((id) => { location.hash = "#/staff/requests"; document.dispatchEvent(new CustomEvent("portal:staffrequestopen", { detail: id })); }, fixture.id);
  await page.locator('[data-view="staff-requests"]').waitFor({ state: "visible" });
  assert.equal(await page.evaluate((id) => window.PortalRequestService.get(id).status, fixture.id), "Released");
  pass("Dashboard and Request Management use shared updated lifecycle");
  await page.evaluate(() => { location.hash = "#/staff/document-processing"; });
  await page.locator('[data-view="staff-document-processing"]').waitFor({ state: "visible" });
  await page.locator("#staff-theme-toggle").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow at ${width}px`);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `phase-d-${width}.png`), fullPage: true });
  }
  pass("Dark mode and 1440/768/390px layouts have no horizontal page overflow");
  await page.getByRole("button", { name: "View Release Details", exact: true }).click();
  assert.equal(await page.locator("#document-details").evaluate((node) => node.getBoundingClientRect().width <= innerWidth), true);
  await page.keyboard.press("Escape");
  await page.locator("#document-details").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate((account) => {
    document.querySelector("#staff-logout-button").click();
    window.PortalAccounts.saveSession(account);
    document.dispatchEvent(new CustomEvent("portal:login", { detail: account }));
    location.hash = "#/staff/document-processing";
  }, fixture.account);
  await page.waitForFunction(() => location.hash === "#/dashboard");
  assert.equal(await page.locator('[data-view="staff-document-processing"]').isVisible(), false);
  assert.equal(await page.evaluate(() => window.PortalRequestService.listForStudent("OTHER-0").length), 0);
  pass("Student route guard and student-scoped data access");
  await page.evaluate(() => { location.hash = "#/my-request"; });
  await page.locator('[data-view="requests"]').waitFor({ state: "visible" });
  assert.equal(await page.locator(".student-request-list-card").count(), 1);
  await page.getByRole("button", { name: "View Progress", exact: true }).click();
  await page.getByRole("button", { name: "View Request Details", exact: true }).click();
  assert.match(await page.locator('[data-view="requests"]').innerText(), /Release reference/);
  assert.match(await page.locator('[data-view="requests"]').innerText(), /recorded as released/);
  assert.doesNotMatch(await page.locator('[data-view="requests"]').innerText(), /PRIVATE NOTE|Test verification method|Other Student/);
  pass("Student sees own release, progress and in-app notices; internal notes and verification stay private");
  for (const route of ["grade-slip", "registration-form", "id-printing"]) {
    await page.evaluate((name) => { location.hash = `#/services/${name}`; }, route);
    await page.locator(`[data-view="${route}"]`).waitFor({ state: "visible" });
  }
  await page.evaluate(() => { location.hash = "#/academic-records"; });
  await page.waitForFunction(() => location.hash === "#/dashboard");
  assert.equal(await page.locator('[data-view="dashboard"]').isVisible(), true);
  pass("Existing three service forms still mount and the removed Academic Records route falls back to the dashboard");
  assert.deepEqual(errors, []);
  pass("No unexpected JavaScript page errors");
  console.log(`\n${passed} browser UI scenarios passed (synthetic browser-local sessions and test policy only).`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
