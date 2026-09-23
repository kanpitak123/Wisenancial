// 2.2 Watchlist: "ติดตามเอง" (manual watchlist) add-stock — previously reported 404, and a
// console TypeError null.trim() to check for.
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

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await page.goto(route('/Watchlist'), { waitUntil: 'networkidle' });
await page.locator('[data-test="manual-section"]').waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1000);

// open the manual section if collapsed (only relevant for Stock/investor mode per source)
const manageBtn = page.locator('[data-test="manual-toggle"]');
if (await manageBtn.isVisible().catch(() => false)) {
  const isOpen = (await manageBtn.innerText()).includes('ย่อ') || (await manageBtn.innerText()).includes('Hide');
  if (!isOpen) await manageBtn.click();
  await page.waitForTimeout(500);
}

const symbolInput = page.locator('[data-test="manual-section"] input[data-test="symbol-picker-input"]');
await symbolInput.waitFor({ state: 'visible', timeout: 10000 });
await symbolInput.fill('MSFT');
await page.waitForTimeout(800); // let the symbol-picker dropdown suggestion list populate

// try to pick the dropdown suggestion if present, else just rely on the typed value
const option = page.locator('[data-test="symbol-picker-option"]', { hasText: 'MSFT' }).first();
if (await option.isVisible().catch(() => false)) {
  await option.click();
}

console.log('About to click watchlist-add-btn to add MSFT to qa@wisenancial.test manual watchlist.');
const respPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('watchlist'),
  { timeout: 15000 },
).catch((e) => ({ error: String(e) }));

await page.locator('[data-test="manual-section"] [data-test="watchlist-add-btn"]').first().click();
const resp = await respPromise;

let status = null, body = null;
if (resp && !resp.error) {
  status = resp.status();
  try { body = await resp.json(); } catch { try { body = await resp.text(); } catch {} }
} else {
  status = 'NO_RESPONSE_CAUGHT';
  body = resp?.error;
}

await page.waitForTimeout(1000);
await page.screenshot({ path: 'qa/screenshots/2.2-watchlist-add.png', fullPage: true });

const result = { status, body, logs: formatLogs(logs) };
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-watchlist-add.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
