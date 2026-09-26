import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

const EXPECTED_PLAYWRIGHT = "1.56.0";
const EXPECTED_CHROMIUM = "141.0.7390.37";
const root = path.resolve(process.argv[2] ?? "tests/fixtures/receipt-synthetic-v1.1");
const htmlDir = path.join(root, "html");
const outputDir = path.join(root, "pdf_digital");

const playwrightPackage = JSON.parse(await fs.readFile(new URL("../../node_modules/playwright/package.json", import.meta.url), "utf8"));
if (playwrightPackage.version !== EXPECTED_PLAYWRIGHT) {
  throw new Error(`playwright_version_mismatch:${playwrightPackage.version}`);
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const browserVersion = browser.version();
  if (browserVersion !== EXPECTED_CHROMIUM) throw new Error(`chromium_version_mismatch:${browserVersion}`);

  for (const filename of (await fs.readdir(htmlDir)).filter((name) => /^S\d{2}\.html$/u.test(name)).sort()) {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(htmlDir, filename)).href, { waitUntil: "load" });
    await page.emulateMedia({ media: "screen" });
    const dimensions = await page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }));
    const raw = await page.pdf({
      printBackground: true,
      preferCSSPageSize: false,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      tagged: true,
    });
    await page.close();

    const pdf = await PDFDocument.load(raw, { updateMetadata: false });
    const epoch = new Date("2000-01-01T00:00:00.000Z");
    pdf.setProducer(`Homory synthetic-v1.1 / Playwright ${EXPECTED_PLAYWRIGHT} / Chromium ${EXPECTED_CHROMIUM}`);
    pdf.setCreator("Homory synthetic-v1.1");
    pdf.setCreationDate(epoch);
    pdf.setModificationDate(epoch);
    const normalized = await pdf.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
    await fs.writeFile(path.join(outputDir, filename.replace(/\.html$/u, ".pdf")), normalized);
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify({
  fixture: path.relative(process.cwd(), root),
  playwright: EXPECTED_PLAYWRIGHT,
  chromium: EXPECTED_CHROMIUM,
  pdfCount: (await fs.readdir(outputDir)).filter((name) => name.endsWith(".pdf")).length,
})}\n`);
