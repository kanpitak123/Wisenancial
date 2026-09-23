// 2.3 Stock Record: buy amount->shares auto-calc correctness, rapid double-submit check.
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
await page.locator('[data-test^="purchase-"], [data-test="open-buy"]').first().waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1000);

console.log('Opening Buy dialog to test amount->shares calc for a new NVDA lot on qa@wisenancial.test.');
await page.locator('[data-test="open-buy"]').click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

// type a symbol directly (bypass the search dropdown -- typing + blur is a valid real user path too)
const symbolInput = page.locator('input[data-test="symbol-picker-input"]');
await symbolInput.fill('NVDA');
await page.waitForTimeout(600);
const option = page.locator('[data-test="symbol-picker-option"]', { hasText: 'NVDA' }).first();
if (await option.isVisible().catch(() => false)) {
  await option.click();
} else {
  await page.keyboard.press('Escape');
}

const priceInput = page.locator('input[data-test="buy-price"]');
await priceInput.fill('100');
const totalInput = page.locator('input[data-test="buy-total"]');
await totalInput.fill('1000');
await page.waitForTimeout(500); // let the watcher auto-fill shares_count

const sharesValue = await page.locator('input[data-test="buy-shares"]').inputValue();
const summaryText = await page.locator('[data-test="buy-summary"]').innerText();
console.log('price=100, total_amount=1000, fee%=0 -> expected shares=10, got:', sharesValue);
console.log('buy-summary text:', summaryText);

// now test fee% affecting the calc
const feeInput = page.locator('input[data-test="buy-fee-percent"]');
await feeInput.fill('1');
await page.waitForTimeout(500);
const sharesValueWithFee = await page.locator('input[data-test="buy-shares"]').inputValue();
console.log('same inputs + fee%=1 -> expected shares=9.9010, got:', sharesValueWithFee);

await page.screenshot({ path: 'qa/screenshots/2.3-buy-calc.png', fullPage: true });

// reset fee back to 0 for a clean, predictable purchase before testing double-submit
await feeInput.fill('0');
await page.waitForTimeout(300);

console.log('About to test rapid double-click on submit-buy (checking for duplicate-write bug).');
const postRequests = [];
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('/stocks/buy')) postRequests.push(Date.now());
});
const submitBtn = page.locator('[data-test="submit-buy"]');
await Promise.all([submitBtn.click(), submitBtn.click({ force: true }).catch(() => {})]);
await page.waitForTimeout(2500);

const dialogStillOpen = await page.locator('.q-dialog').isVisible().catch(() => false);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const nvdaRowCount = await page.locator('[data-test^="purchase-"]', { hasText: 'NVDA' }).count();

const result = {
  sharesValueNoFee: sharesValue,
  sharesValueWithFee1Percent: sharesValueWithFee,
  buySummaryText: summaryText,
  postBuyRequestCount: postRequests.length,
  dialogStillOpenAfterDoubleClick: dialogStillOpen,
  nvdaLotRowsAfterReload: nvdaRowCount,
  logs: formatLogs(logs),
};
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.3-stockrecord-buy.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
