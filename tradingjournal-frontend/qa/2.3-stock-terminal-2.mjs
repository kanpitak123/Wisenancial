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
await page.locator('text=Stock Terminal').first().click();
await page.waitForURL('**/stock/**', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('.q-tab', { timeout: 25000 });
await page.waitForTimeout(3000);

// ---- symbol switch, real before/after comparison ----
out.symbolBefore = await page.locator('.symbol').first().innerText().catch(() => null);
out.priceBefore = await page.locator('.chip-price').first().innerText().catch(() => null);
const row = page.locator('.popular-row').first();
if (await row.count() > 0) {
  const rowText = await row.innerText();
  await row.click();
  await page.waitForTimeout(2500);
  out.clickedRowText = rowText.split('\n')[0];
} else {
  out.clickedRowText = '(no .popular-row found)';
}
out.urlAfterSwitch = page.url();
out.symbolAfter = await page.locator('.symbol').first().innerText().catch(() => null);
out.priceAfter = await page.locator('.chip-price').first().innerText().catch(() => null);
out.symbolActuallyChanged = out.symbolBefore !== out.symbolAfter;
out.staleDataCheck = out.symbolActuallyChanged && out.priceBefore !== out.priceAfter
  ? 'symbol and price both changed -- no stale bleed observed'
  : `symbolChanged=${out.symbolActuallyChanged}, price stayed the same=${out.priceBefore === out.priceAfter} (could be coincidence if same price)`;

// ---- search bar cross-reference: does it hit the same GET /stocks slowness? ----
console.log('checking terminal search bar for the already-known GET /stocks slowness (cross-ref only)...');
let stocksReqTime = null;
page.once('request', (req) => { if (req.url() === 'http://localhost:3000/stocks') stocksReqTime = Date.now(); });
const searchInput = page.locator('.terminal-search-input input[data-test="symbol-picker-input"]');
await searchInput.click();
await searchInput.type('AAPL', { delay: 60 });
const dropdownAppeared = await page.locator('[data-test="symbol-picker-menu"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
out.terminalSearchDropdownAppearedWithin12s = dropdownAppeared;
out.terminalSearchUsesSameStocksEndpoint = stocksReqTime !== null;
await page.keyboard.press('Escape');

// ---- ~15s auto-refresh check (live-price-badge "updated Xs ago" style label) ----
console.log('checking auto-refresh: sampling live-price-badge label over ~18s...');
const badge = page.locator('[data-test="live-price-badge"]').first();
const samples = [];
for (let i = 0; i < 4; i++) {
  samples.push(await badge.innerText().catch(() => null));
  await page.waitForTimeout(5000);
}
out.livePriceBadgeSamplesOver18s = samples;

out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.3-stock-terminal-2.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
