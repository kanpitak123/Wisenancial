// Focused check: does the "ซื้อหุ้น" button correctly stay disabled (with a loading label)
// immediately after a fresh page load on StockRecord, until InvestorPortfolioStore.load()
// actually resolves — this is the exact race from QA sweep 2026-09-23 MEDIUM #4.
//
// wisenancial_active_portfolio_type is in localStorage (persists across a reload, unlike Pinia
// state) so: switch to Stock once via the UI (persists it), navigate to StockRecord, then do a
// hard page.reload() — that forces a fresh Vue app + store init (the real race window) while
// staying on the Investor-only route instead of bouncing back to Dashboard via the route guard.
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
await page.goto(route('/StockRecord'), { waitUntil: 'networkidle' });
await page.locator('[data-test="open-buy"]').first().waitFor({ state: 'visible', timeout: 20000 });

const samples = [];
const reloadPromise = page.reload({ waitUntil: 'domcontentloaded' });
reloadPromise.catch(() => {});

const start = Date.now();
while (Date.now() - start < 10000) {
  const btn = page.locator('[data-test="open-buy"]');
  const count = await btn.count().catch(() => 0);
  if (count > 0) {
    const disabled = await btn.getAttribute('disabled').catch(() => null);
    const label = (await btn.innerText().catch(() => '')).trim();
    samples.push({ t: Date.now() - start, disabled, label });
    if (disabled === null && label.includes('ซื้อหุ้น') && !label.includes('โหลด')) break;
  }
  await page.waitForTimeout(30);
}

await reloadPromise;
fs.mkdirSync('qa/screenshots', { recursive: true });
await page.screenshot({ path: 'qa/screenshots/chunk4-buybutton-debug.png', fullPage: true });

console.log(JSON.stringify({ samples, logs: formatLogs(logs) }, null, 2));
await browser.close();
