// Live verification: Journal trade delete for manual/CSV-imported closed trades (Chunk 3 fix).
// Deletes real trade id 4 (MANUAL, closed) and id 10 (IMPORT, closed) on qa@wisenancial.test's
// QA Forex Main portfolio via the real UI, confirming both succeed and the list updates without reload.
import { chromium } from 'playwright';
import path from 'node:path';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const results = [];

async function deleteTrade(page, tradeId, label) {
  const logs = newLogs();
  attachLogging(page, logs);

  const row = page.locator(`[data-test="trade-row-${tradeId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25000 });
  const pairText = (await row.locator('.text-weight-bolder').first().innerText().catch(() => '')).trim();

  const deleteBtn = row.locator('button', { has: page.locator('.q-icon[class*="delete_outline"], [class*="delete_outline"]') }).first();
  // Fallback: click icon by name attribute directly if the button wrapper selector above doesn't match Quasar's DOM.
  const iconBtn = row.locator('i.q-icon:text-is("delete_outline")');
  if (await iconBtn.count()) {
    await iconBtn.first().click();
  } else {
    await deleteBtn.click();
  }

  await page.locator('.q-dialog', { hasText: 'Delete Trade' }).waitFor({ state: 'visible', timeout: 5000 });

  const respPromise = page.waitForResponse(
    (res) => res.url().includes(`/trades/${tradeId}`) && res.request().method() === 'DELETE',
    { timeout: 15000 },
  ).catch((e) => ({ status: () => 'NO_RESPONSE', err: String(e) }));

  await page.locator('.q-dialog', { hasText: 'Delete Trade' }).getByRole('button', { name: 'Delete' }).click();

  const resp = await respPromise;
  const status = typeof resp.status === 'function' ? resp.status() : 'NO_RESPONSE';

  await page.waitForTimeout(800);
  const toast = await page.locator('.q-notification').first().innerText().catch(() => '(no toast)');
  const rowGoneWithoutReload = !(await row.isVisible().catch(() => false));

  results.push({ label, tradeId, pairText, status, toast, rowGoneWithoutReload, logs: formatLogs(logs) });
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Forex');
await page.getByText('Journal', { exact: true }).click();
await page.waitForURL('**/Journal', { timeout: 10000 });
await page.locator('[data-test^="trade-row-"]').first().waitFor({ state: 'visible', timeout: 25000 });

await deleteTrade(page, 4, 'manual-trade-EURUSD-id4');
await deleteTrade(page, 10, 'csv-import-trade-EURUSD-id10');

await browser.close();

console.log(JSON.stringify(results, null, 2));
