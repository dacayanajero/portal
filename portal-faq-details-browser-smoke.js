"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");
const source = (file) => readFileSync(join(__dirname, file), "utf8");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
    await page.goto("http://localhost/");
    await page.setContent(`<div id="staff-screen" data-current-page="staff-help-support">${source("pages/staff-help-support.html")}</div>${source("components/support-dialogs.html")}`);
    await page.evaluate(() => {
      document.querySelector('[data-view="staff-help-support"]').hidden = false;
      window.PortalStaffContext = { current: () => ({ account: { role: "staff", accountNumber: "REGULAR-STAFF", fullName: "Regular Staff" } }) };
      window.PortalSupportPolicy = { bundledGuideEnabled: true, categories: ["General"], priorities: ["Normal"] };
      window.PortalHelpGuide = [{ key: "documents", question: "What documents can I request?", answer: "Original built-in answer", category: "General", keywords: ["documents"], relatedService: "" }];
      window.PortalRequestService = { SERVICES: [] };
      window.PortalReportService = { timestamp: (value) => Date.parse(value) };
      window.PortalSupportService = {
        STATUS: { OPEN: "Open" }, capabilities: () => ["faqView", "faqCreate", "faqEditOwn"],
        listStaff: () => [], summary: () => ({ total: 0, open: 0, progress: 0, waiting: 0, closed: 0, resolved: 0 }),
      };
    });
    for (const file of ["js/faq-service.js", "js/support-ui.js", "js/staff-help-support.js"]) await page.addScriptTag({ content: source(file) });
    await page.evaluate(() => { window.initializeSupportUI(); window.initializeStaffHelpSupport(); });
    await page.getByRole("button", { name: "FAQ Management", exact: true }).click();
    assert.equal(await page.locator("#staff-support-feedback").innerText(), "");
    await page.getByRole("button", { name: "View / Manage FAQ", exact: true }).click();
    const details = page.locator("#staff-faq-details");
    assert.equal(await details.getByRole("button", { name: "Edit Answer", exact: true }).isVisible(), true);
    assert.equal(await details.getByRole("button", { name: "Delete FAQ", exact: true }).isVisible(), true);
    await details.getByRole("button", { name: "Edit Answer", exact: true }).click();
    const editor = page.locator("#staff-faq-editor"); const answer = editor.locator('[name="answer"]');
    assert.equal(await answer.inputValue(), "Original built-in answer");
    assert.equal(await answer.evaluate((node) => node === document.activeElement), true);
    await answer.fill("Edited staff answer");
    await editor.getByRole("button", { name: "Save FAQ Draft", exact: true }).click();
    await page.getByRole("button", { name: "View / Manage FAQ", exact: true }).click();
    assert.match(await details.innerText(), /Edited staff answer/);
    await details.getByRole("button", { name: "Delete FAQ", exact: true }).click();
    await page.locator("#support-confirm-cancel").click();
    assert.equal(await details.isVisible(), true);
    await details.getByRole("button", { name: "Delete FAQ", exact: true }).click();
    await page.locator("#support-confirm-submit").click();
    await details.waitFor({ state: "hidden" });
    assert.equal(await page.locator("#staff-faq-rows tr").count(), 0);
    assert.equal(await page.evaluate(() => window.PortalFAQService.publicList().length), 0);
    assert.deepEqual(errors, []);
    console.log("PASS Regular staff sees Edit Answer and Delete FAQ in built-in FAQ details; editing, cancellation and deletion work.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
