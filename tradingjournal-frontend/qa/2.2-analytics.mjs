// 2.2 Analytics (Stock mode): click through all 5 tabs, capture console/pageerror/HTTP>=400 per
// tab. Also checks the systemic "empty on first nav after switch" pattern found on Watchlist/Community.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const TABS = ['Dashboard', 'Allocation', 'Timeline', 'AI Insights', 'Planning & Tools'];

async function runFor(accountLabel, authFile) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();
  const logs = newLogs();
  attachLogging(page, logs);

  await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
  let switchError = null;
  try {
    await switchWorkspace(page, 'Stock');
  } catch (e) {
    switchError = String(e);
  }
  await page.goto(route('/Analytics'), { waitUntil: 'networkidle' });
  await page.locator('.q-tab').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (switchError) {
    console.log(`[${accountLabel}] workspace switch to Stock threw:`, switchError);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log(`[${accountLabel}] page body after failed switch attempt:`, bodyText.slice(0, 600));
  }

  const results = {};
  for (const tabLabel of TABS) {
    const tab = page.locator('.q-tab', { hasText: tabLabel });
    if ((await tab.count()) === 0) {
      results[tabLabel] = { visible: false };
      continue;
    }
    const preErrCount = logs.badResponses.length;
    await tab.click();
    // leftover Forex-mode requests from the initial Dashboard mount can still be resolving and
    // interleave with this tab's own fetch + first-visit Vite compile of its chart component —
    // observed up to ~15s before real data appears. Poll instead of a short fixed wait.
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading analysis data'),
      { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(1000);
    const newErrors = logs.badResponses.slice(preErrCount);
    const bodyText = await page.locator('.q-page').innerText().catch(() => '');
    results[tabLabel] = {
      visible: true,
      httpErrors: newErrors,
      hasLockHint: /upgrade|unlock|Upgrade to|PACK_|premium/i.test(bodyText),
      snippetLen: bodyText.length,
    };
    await page.screenshot({ path: `qa/screenshots/2.2-analytics-${accountLabel}-${tabLabel.replace(/[^a-z0-9]/gi, '')}.png` });
  }

  await browser.close();
  return { results, logs: formatLogs(logs) };
}

const paidResult = await runFor('paid', path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json'));
console.log('=== PAID ACCOUNT ===');
console.log(JSON.stringify(paidResult, null, 2));

const freeResult = await runFor('free', path.join(process.cwd(), 'qa', '.auth', 'qa-free.json'));
console.log('=== FREE ACCOUNT ===');
console.log(JSON.stringify(freeResult, null, 2));

fs.writeFileSync(
  path.join(process.cwd(), 'qa', 'logs', '2.2-analytics.json'),
  JSON.stringify({ paid: paidResult, free: freeResult }, null, 2),
);
