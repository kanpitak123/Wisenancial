import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);
const out = {};

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await page.goto(route('/Watchlist'), { waitUntil: 'networkidle' });
await page.locator('[data-test="manual-section"]').waitFor({ state: 'visible', timeout: 25000 });
// known systemic bug workaround
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const sections = await page.locator('[data-test^="radar-section-"]').all();
out.radarSectionCount = sections.length;
out.radarSections = [];
for (const section of sections) {
  const testId = await section.getAttribute('data-test');
  const heading = await section.locator('h2').first().innerText().catch(() => '?');
  const count = await section.locator('.watch-section__count').innerText().catch(() => '?');
  const hasFilters = (await section.locator('.watch-section__filters').count()) > 0;
  out.radarSections.push({ testId, heading, count, hasFilters });
}

out.radarErrorVisible = (await page.locator('[data-test="radar-error"]').count()) > 0;
out.radarEmptyVisible = (await page.locator('[data-test="radar-empty"]').count()) > 0;
out.radarLoadingStuck = (await page.locator('[data-test="radar-loading"]').count()) > 0;

// try applying a sector filter on the first filterable section
const filterSection = page.locator('[data-test^="radar-section-"]', { has: page.locator('.watch-section__filters') }).first();
if (await filterSection.count() > 0) {
  const beforeCount = await filterSection.locator('.watch-section__count').innerText();
  const sectorSelect = filterSection.locator('.watch-filter-field').first();
  await sectorSelect.click();
  await page.waitForTimeout(500);
  const option = page.locator('.q-menu .q-item:not(.disabled)').nth(1);
  if (await option.count() > 0) {
    await option.click();
    await page.waitForTimeout(1000);
    const afterCount = await filterSection.locator('.watch-section__count').innerText();
    out.filterTest = { beforeCount, afterCount, changed: beforeCount !== afterCount };
  }
}

// horizontal scroll check
const firstRail = page.locator('.horiz-scroll, [class*="scroll"]').first();
out.scrollableRailFound = (await firstRail.count()) > 0;

await page.screenshot({ path: 'qa/screenshots/2.2-watchlist-radar.png', fullPage: true });
out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-watchlist-radar.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
