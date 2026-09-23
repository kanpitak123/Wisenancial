// 2.3 Stock Record: rapid double-submit-buy check, done AFTER waiting for real portfolio data
// (store.portfolioId) to be ready -- avoids the false failure from the earlier attempt.
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
await page.getByText('Stock Record', { exact: true }).click();
await page.waitForURL('**/StockRecord', { timeout: 10000 });
console.log('waiting for real holdings row (data-ready signal) before opening Buy dialog...');
await page.locator('[data-test^="purchase-"]').first().waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(500);

console.log('About to double-click submit on a real buy (MSFT, 5 shares @ $50) on qa@wisenancial.test to check for duplicate-write.');
await page.locator('[data-test="open-buy"]').click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

const symbolInput = page.locator('input[data-test="symbol-picker-input"]');
await symbolInput.click();
await symbolInput.type('MSFT', { delay: 60 });
await page.keyboard.press('Escape');
await page.locator('input[data-test="buy-price"]').fill('50');
await page.locator('input[data-test="buy-shares"]').fill('5');
await page.waitForTimeout(500);

const buyRequests = [];
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('/stocks/buy')) buyRequests.push(Date.now());
});

const submitBtn = page.locator('[data-test="submit-buy"]');
// fire two clicks back-to-back with no await between the click dispatches themselves
await Promise.all([
  submitBtn.click(),
  submitBtn.click({ force: true }).catch((e) => console.log('second click error (expected if button disabled/dialog closed):', String(e).slice(0, 150))),
]);
await page.waitForTimeout(2500);

const notifTexts = await page.locator('.q-notification').allInnerTexts();
console.log('notifications after double-click:', notifTexts);
console.log('POST /stocks/buy request count observed:', buyRequests.length);

await page.screenshot({ path: 'qa/screenshots/2.3-double-buy.png', fullPage: true });

const result = {
  buyRequestCount: buyRequests.length,
  notifications: notifTexts,
  logs: formatLogs(logs),
};
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.3-double-buy.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
