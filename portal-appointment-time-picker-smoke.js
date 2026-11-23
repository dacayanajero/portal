"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { chromium } = require("playwright");

test("student time picker prevents lunch selections and preserves valid boundaries", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div><input id="start" type="time" min="08:00" max="16:00"><button id="open">Open</button></div>');
    await page.addScriptTag({ path: "js/appointment-service.js" });
    await page.addScriptTag({ path: "js/appointment-time-picker.js" });
    await page.evaluate(() => {
      window.PortalAppointmentTimePicker.attach(document.querySelector("input"), document.querySelector("button"));
      window.changes = [];
      document.querySelector("input").addEventListener("change", (event) => window.changes.push(event.target.value));
    });
    const hours = page.getByLabel("Appointment hour", { exact: true });
    const minutes = page.getByLabel("Appointment minute", { exact: true });
    const input = page.locator("#start");
    await input.click();
    assert.equal(await hours.locator('option[value="12"]').evaluate((option) => option.disabled), true);
    await hours.selectOption("11");
    assert.equal(await minutes.locator('option[value="0"]').evaluate((option) => option.disabled), false);
    assert.equal(await minutes.locator('option[value="1"]').evaluate((option) => option.disabled), true);
    assert.equal(await input.inputValue(), "11:00");
    await hours.selectOption("13");
    assert.equal(await input.inputValue(), "13:00");
    await minutes.selectOption("23");
    assert.equal(await input.inputValue(), "13:23");
    await hours.selectOption("16");
    assert.equal(await input.inputValue(), "16:00");
    assert.equal(await minutes.locator('option[value="1"]').evaluate((option) => option.disabled), true);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await page.locator(".appointment-time-picker").isHidden(), true);
    await input.press("ArrowDown");
    assert.equal(await page.locator(".appointment-time-picker").isVisible(), true);
    await hours.press("Escape");
    assert.equal(await page.locator(".appointment-time-picker").isHidden(), true);
    assert.equal(await input.evaluate((element) => element.readOnly), true);
    assert.deepEqual(await page.evaluate(() => window.changes), ["11:00", "13:00", "13:23", "16:00", "16:00"]);
  } finally {
    await browser.close();
  }
});
