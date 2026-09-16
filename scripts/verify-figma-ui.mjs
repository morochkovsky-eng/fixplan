import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.UI_BASE_URL || "http://localhost:3010";
const output = process.env.UI_SCREENSHOT_DIR || "/tmp/fixplan-figma-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const errors = [];
try {
  for (const width of [1440, 1280, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push({ width, error: error.message }));
    // Preview data only. Never send mutations to the real application backend.
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") return route.fulfill({ status: 403, json: { error: "Visual review is read-only" } });
      if (path === "/api/apartments") return route.fulfill({ json: { apartments: [{ id: "test", name: "Шпалерная, 34Б", address: "" }], selectedId: "test" } });
      if (path === "/api/assistant") return route.fulfill({ json: { messages: Array.from({ length: 12 }, (_, index) => ({ id: `review-${index}`, role: index % 2 ? "assistant" : "user", content: index % 2 ? "Задание на диагностику бойлера подготовлено. Проверьте время и исполнителя." : "Проверь историю ремонта бойлера и подготовь задание мастеру.", channel: "web" })) } });
      return route.fulfill({ json: {} });
    });
    for (const path of ["dashboard", "assets", "plan", "tasks", "documents", "utilities", "log", "settings", "assets/s-wc-boiler-control"]) {
      await page.goto(`${base}/${path}?ui-preview=1`);
      await page.locator(".product-header").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headerHeight: document.querySelector(".product-header").getBoundingClientRect().height,
        controls: [...document.querySelectorAll('[data-slot="button"], [data-slot="select-trigger"]')].filter(e => e.getBoundingClientRect().height > 0).slice(0, 24).map(e => {
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          return { text: e.textContent?.trim().slice(0, 60), height: r.height, font: s.fontSize, radius: s.borderRadius };
        }),
      }));
      results.push({ width, path, ...geometry });
      await page.screenshot({ path: `${output}/${width}-${path.replaceAll("/", "-")}.png`, fullPage: true });
      await page.screenshot({ path: `${output}/${width}-${path.replaceAll("/", "-")}-viewport.png` });
      assert.ok(geometry.scrollWidth <= width + 1, `${width} ${path}: page overflows to ${geometry.scrollWidth}`);
    }
    const tabs = page.locator('.asset-page [role="tab"]');
    for (let i = 1; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      await page.screenshot({ path: `${output}/${width}-asset-tab-${i}.png`, fullPage: true });
    }
    await tabs.first().click();
    await page.getByRole("button", { name: "Редактировать паспорт", exact: true }).click();
    await page.locator("#plan-asset-name").waitFor();
    await page.screenshot({ path: `${output}/${width}-asset-edit.png` });
    await page.goto(`${base}/assets/s-wc-boiler-control?ui-preview=1`);
    await page.locator(".asset-identity").waitFor();
    await page.getByRole("combobox", { name: "Выбрать объект" }).click();
    await page.getByRole("option", { name: "Добавить объект…" }).waitFor();
    await page.screenshot({ path: `${output}/${width}-apartment-select.png` });
    await page.getByRole("option", { name: "Добавить объект…" }).click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({ path: `${output}/${width}-apartment-dialog.png` });
    await page.keyboard.press("Escape");
    const launcher = page.locator(".assistant-mobile-toggle");
    await launcher.click();
    await page.screenshot({ path: `${output}/${width}-chat-open.png` });
    assert.equal(await launcher.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await launcher.getAttribute("aria-expanded"), "false");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: `${output}/${width}-asset-dark.png`, fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(`Verified ${results.length} screens; screenshots and measurements: ${output}`);
