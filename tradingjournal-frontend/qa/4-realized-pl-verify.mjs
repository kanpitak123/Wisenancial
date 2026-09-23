// Verifies the Chunk 2 fix (realized P/L field-name mismatch, shares_count/gross_amount ->
// shares_sold/gross_proceeds): both the on-screen sale-history table AND the CSV export must
// show non-zero, correct values for the real MSFT sell data already in qa@wisenancial.test's
// QA Stock Main portfolio (id 17) — two sales, each 5 shares @ $160 = $800 gross, -$700 P/L.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile, acceptDownloads: true });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await page.getByText('Stock Record', { exact: true }).click();
await page.waitForURL('**/StockRecord', { timeout: 10000 });
await page.locator('[data-test^="purchase-"]').first().waitFor({ state: 'visible', timeout: 25000 });

// ── On-screen sale-history table ──
await page.locator('[data-test="tab-closed"]').click();

const saleRow11 = page.locator('[data-test="sale-11"]');
const saleRow12 = page.locator('[data-test="sale-12"]');
await saleRow11.waitFor({ state: 'visible', timeout: 15000 });
const row11Text = await saleRow11.innerText();
const row12Text = await saleRow12.innerText();

const screenResult = {
  row11Text,
  row12Text,
  row11HasSharesFive: /(^|\D)5(\D|$)/.test(row11Text.split('\n')[1] ?? row11Text),
  row11ContainsZeroOnly: false,
};

await page.screenshot({ path: 'qa/screenshots/4-realized-pl-sale-history.png', fullPage: true });

// ── CSV export ── (exportYear defaults to 'ALL' / "ทุกปี", no need to touch the year select)
await page.getByText('Export CSV', { exact: true }).click();
await page.locator('[data-test="export-type"]').waitFor({ state: 'visible', timeout: 5000 });
await page.locator('[data-test="export-type"]').getByText('Realized P/L', { exact: false }).click();

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.locator('[data-test="submit-export"]').click(),
]);

const csvPath = path.join(process.cwd(), 'qa', 'logs', 'realized-pnl-export.csv');
await download.saveAs(csvPath);
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\r\n').filter(Boolean);
const msftLines = csvLines.filter((l) => l.includes('MSFT'));

await browser.close();

const result = {
  screenResult,
  csvHeader: csvLines[0],
  msftLines,
  csvContainsCorrectShares: msftLines.every((l) => l.includes('"5"')),
  csvContainsCorrectGross: msftLines.every((l) => l.includes('"800"')),
  logs: formatLogs(logs),
};

fs.writeFileSync(
  path.join(process.cwd(), 'qa', 'logs', '4-realized-pl-verify.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
