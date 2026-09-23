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
await page.waitForTimeout(500);

async function testExport(typeValue, label) {
  await page.locator('[data-test="open-export"]').click();
  await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
  const radio = page.locator(`[data-test="export-type"] .q-radio`, { hasText: typeValue === 'holdings' ? 'Holdings' : 'Realized' });
  if (await radio.count() > 0) await radio.click();
  await page.waitForTimeout(300);
  const countText = await page.locator('[data-test="export-count"]').innerText();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch((e) => ({ error: String(e) })),
    page.locator('[data-test="submit-export"]').click(),
  ]);

  let result = { label, countText };
  if (download && !download.error) {
    const filePath = path.join(process.cwd(), 'qa', 'logs', `export-${label}.csv`);
    await download.saveAs(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    result.downloadedFilename = download.suggestedFilename();
    result.contentPreview = content.split('\n').slice(0, 4).join('\n');
    result.rowCount = content.trim().split('\n').length;
  } else {
    result.downloadError = download?.error ?? 'no download event';
  }
  await page.waitForTimeout(500);
  return result;
}

console.log('Testing CSV export: Holdings.');
const holdingsResult = await testExport('holdings', 'holdings');
console.log(JSON.stringify(holdingsResult, null, 2));

console.log('Testing CSV export: Realized P/L.');
const realizedResult = await testExport('realized', 'realized');
console.log(JSON.stringify(realizedResult, null, 2));

const out = { holdingsResult, realizedResult, logs: formatLogs(logs) };
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.3-csv-export.json'), JSON.stringify(out, null, 2));

await browser.close();
