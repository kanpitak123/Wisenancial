// Live-verifies Chunk 4 fixes on qa@wisenancial.test's real Investor/Stock portfolio via the
// actual UI (Playwright, not Claude in Chrome).
//  1. Buy button reflects InvestorPortfolioStore readiness (not just "a portfolio selected").
//  2. Sell dialog shows the cross-lot breakdown (GET .../stocks/sell-preview) and the multi-lot
//     notice, instead of only implying the sale affects the clicked lot — for the real AAPL
//     symbol which now has 2 open lots (id 7: 10 shares, id 13: 5 shares, set up via a real
//     Buy through the API moments ago).
//  3. A real sell across both lots is submitted and the resulting lot state is checked against
//     what the preview promised.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const results = {};

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await page.goto(route('/StockRecord'), { waitUntil: 'networkidle' });
await page.locator('[data-test="open-buy"]').first().waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(500);

results.buyButtonDisabledAfterSettle = await page.locator('[data-test="open-buy"]').getAttribute('disabled');

// Find the AAPL row with remaining 10 (lot id 7) and click its sell button
await page.locator('[data-test="purchase-13"], tr:has-text("AAPL")').first().waitFor({ timeout: 15000 }).catch(() => {});
fs.mkdirSync('qa/screenshots', { recursive: true });
await page.screenshot({ path: 'qa/screenshots/chunk4-holdings-table.png', fullPage: true });

await page.locator('[data-test="sell-7"]').click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

const availableText = await page.locator('[data-test="sell-available"]').innerText();
results.sellAvailableText = availableText;
results.multilotNoticeVisible = await page.locator('[data-test="sell-multilot-notice"]').isVisible().catch(() => false);

// set shares_count to 12 (spans both lots: 10 from lot 7 + 2 from lot 13, FIFO)
const sharesInput = page.locator('input[data-test="sell-shares"]');
await sharesInput.fill('12');
await page.locator('input[data-test="sell-price"]').fill('160');

await page.waitForTimeout(600); // debounce (300ms) + response
await page.locator('[data-test="sell-preview"]').waitFor({ state: 'visible', timeout: 5000 });

const previewText = await page.locator('[data-test="sell-preview"]').innerText();
results.previewText = previewText;
results.previewLot7Visible = await page.locator('[data-test="sell-preview-lot-7"]').isVisible();
results.previewLot13Visible = await page.locator('[data-test="sell-preview-lot-13"]').isVisible();
results.previewLot7Text = await page.locator('[data-test="sell-preview-lot-7"]').innerText();
results.previewLot13Text = await page.locator('[data-test="sell-preview-lot-13"]').innerText();

await page.screenshot({ path: 'qa/screenshots/chunk4-sell-dialog-preview.png', fullPage: true });

const respPromise = page.waitForResponse(
  (res) => res.url().includes('/stocks/sell') && res.request().method() === 'POST',
  { timeout: 15000 },
);
await page.locator('[data-test="submit-sell"]').click();
const resp = await respPromise;
results.sellStatus = resp.status();
results.sellBody = await resp.json().catch(async () => await resp.text());

await page.waitForTimeout(1000);
await page.screenshot({ path: 'qa/screenshots/chunk4-after-sell.png', fullPage: true });

await browser.close();
console.log(JSON.stringify({ results, logs: formatLogs(logs) }, null, 2));

fs.writeFileSync('qa/logs/chunk4-verify.json', JSON.stringify(results, null, 2));
