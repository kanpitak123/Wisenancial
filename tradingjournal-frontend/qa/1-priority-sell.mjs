// PRIORITY test (user's explicit #1 ask): re-verify stock sell via the real Stock Record UI.
// Previous report (2026-09-09) claimed sell always 500s. Leftover DB data from 2026-09-22 hinted
// it might already work. This does ONE partial sell + ONE full sell against the real leftover
// AAPL lots (purchase id 7 = partial, id 8 = full) on qa@wisenancial.test / QA Stock Main.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const results = [];

async function gotoStockRecord(page) {
  await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
  await switchWorkspace(page, 'Stock');
  await page.getByText('Stock Record', { exact: true }).click();
  await page.waitForURL('**/StockRecord', { timeout: 10000 });
  // First visit to a not-yet-compiled route can take 5-20s (Vite dev lazy-compile) — not a bug,
  // see qa-bug-report-2026-09-09.md methodology note. Poll generously instead of a fixed wait.
  await page.locator('[data-test^="purchase-"]').first().waitFor({ state: 'visible', timeout: 25000 });
}

async function doSell({ page, purchaseId, sellShares, label }) {
  const logs = newLogs();
  attachLogging(page, logs);

  const row = page.locator(`[data-test="purchase-${purchaseId}"]`);
  await row.waitFor({ state: 'visible', timeout: 15000 });
  const beforeRemaining = (await row.locator('td').nth(1).innerText()).trim();

  await row.locator(`[data-test="sell-${purchaseId}"]`).click();
  await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

  if (sellShares !== null) {
    // data-test lands on the native <input> itself here (Quasar QInput fallthrough), not a wrapper.
    const sharesInput = page.locator('input[data-test="sell-shares"]');
    await sharesInput.fill(String(sellShares));
  }

  const respPromise = page.waitForResponse(
    (res) => res.url().includes('/stocks/sell') && res.request().method() === 'POST',
    { timeout: 20000 },
  );
  await page.locator('[data-test="submit-sell"]').click();

  let status = null;
  let body = null;
  try {
    const resp = await respPromise;
    status = resp.status();
    try {
      body = await resp.json();
    } catch {
      body = await resp.text();
    }
  } catch (e) {
    status = 'NO_RESPONSE_CAUGHT';
    body = String(e);
  }

  await page.waitForTimeout(1000);
  const dialogStillOpen = await page.locator('.q-dialog').isVisible().catch(() => false);
  const shotPath = `qa/screenshots/sell-${label}-after.png`;
  await page.screenshot({ path: shotPath, fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const rowAfter = page.locator(`[data-test="purchase-${purchaseId}"]`);
  const stillListedAsOpen = await rowAfter.isVisible().catch(() => false);
  const afterRemaining = stillListedAsOpen
    ? (await rowAfter.locator('td').nth(1).innerText()).trim()
    : '(row gone from OPEN holdings list — fully sold)';

  results.push({
    label,
    purchaseId,
    sellShares,
    beforeRemaining,
    status,
    body,
    dialogStillOpen,
    afterRemaining,
    screenshot: shotPath,
    logs: formatLogs(logs),
  });
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();

await gotoStockRecord(page);

// 1) Partial sell: purchase id 7, AAPL, 10 shares OPEN -> sell 3
await doSell({ page, purchaseId: 7, sellShares: 3, label: 'partial' });

// 2) Full sell: purchase id 8, AAPL, 10 shares OPEN -> sell all (leave default = full remaining)
await doSell({ page, purchaseId: 8, sellShares: null, label: 'full' });

await browser.close();

fs.writeFileSync(
  path.join(process.cwd(), 'qa', 'logs', '1-priority-sell.json'),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
