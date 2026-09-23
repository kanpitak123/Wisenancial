// 2.5 Re-verify the Stock-round HIGH bug: Watchlist/Community/News show stale/empty data
// after a workspace switch until a hard reload. Test BOTH directions + rapid repeated switching.
// Given this round found several endpoints take 5-10s to respond in the real browser, each check
// takes a SHORT snapshot (race window, matches original repro) then a LONG-WAIT snapshot (to tell
// "genuinely stuck/stale forever" apart from "just slow"), before finally hard-reloading.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const out = {};

async function snapshotPage(page, label) {
  const radarSectionCount = await page.locator('[data-test^="radar-section-"]').count().catch(() => -1);
  const manualVisible = await page.locator('[data-test="manual-section"]').isVisible().catch(() => false);
  const postCount = await page.locator('.post-card').count().catch(() => -1);
  const spinnerVisible = await page.locator('.q-spinner, [class*="spinner"]').isVisible().catch(() => false);
  return { label, radarSectionCount, manualVisible, postCount, spinnerVisible };
}

async function checkPage(page, out, key, path_) {
  await page.goto(route(path_), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  out[`${key}_short`] = await snapshotPage(page, `${key}-short(1.5s)`);
  await page.waitForTimeout(8500); // total ~10s - long enough per this round's observed endpoint latency
  out[`${key}_long`] = await snapshotPage(page, `${key}-long(10s)`);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

try {

// ========== Direction 1: Stock -> Forex ==========
await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await checkPage(page, out, 'stockBaseline_watchlist', '/Watchlist');

await switchWorkspace(page, 'Forex');
await checkPage(page, out, 'stockToForex_watchlist', '/Watchlist');
await page.screenshot({ path: 'qa/screenshots/2.5-crossmode-s2f-watchlist-short.png', fullPage: true });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
out.stockToForex_watchlist_afterReload = await snapshotPage(page, 'stock-to-forex-watchlist-after-reload');

await switchWorkspace(page, 'Stock');
await checkPage(page, out, 'stockBaseline_community', '/Community');
await switchWorkspace(page, 'Forex');
await checkPage(page, out, 'stockToForex_community', '/Community');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
out.stockToForex_community_afterReload = await snapshotPage(page, 'stock-to-forex-community-after-reload');

await switchWorkspace(page, 'Stock');
await checkPage(page, out, 'stockBaseline_news', '/News');
await switchWorkspace(page, 'Forex');
await checkPage(page, out, 'stockToForex_news', '/News');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
out.stockToForex_news_afterReload = await snapshotPage(page, 'stock-to-forex-news-after-reload');

// ========== Direction 2: Forex -> Stock ==========
await switchWorkspace(page, 'Forex');
await checkPage(page, out, 'forexBaseline_watchlist', '/Watchlist');
await switchWorkspace(page, 'Stock');
await checkPage(page, out, 'forexToStock_watchlist', '/Watchlist');
await page.screenshot({ path: 'qa/screenshots/2.5-crossmode-f2s-watchlist-short.png', fullPage: true });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
out.forexToStock_watchlist_afterReload = await snapshotPage(page, 'forex-to-stock-watchlist-after-reload');

await switchWorkspace(page, 'Forex');
await checkPage(page, out, 'forexBaseline_community', '/Community');
await switchWorkspace(page, 'Stock');
await checkPage(page, out, 'forexToStock_community', '/Community');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
out.forexToStock_community_afterReload = await snapshotPage(page, 'forex-to-stock-community-after-reload');

// ========== Rapid repeated switching ==========
for (let i = 0; i < 4; i++) {
  await switchWorkspace(page, i % 2 === 0 ? 'Stock' : 'Forex');
  await page.waitForTimeout(150); // rapid, no settling time
}
await page.waitForTimeout(300);
const finalActiveLabel = await page.locator('.workspace-option--active').innerText().catch(() => '?');
out.rapidSwitch_finalActiveMode = finalActiveLabel;
await checkPage(page, out, 'rapidSwitch_watchlist', '/Watchlist');
await page.screenshot({ path: 'qa/screenshots/2.5-crossmode-rapid-watchlist.png', fullPage: true });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
out.rapidSwitch_watchlist_afterReload = await snapshotPage(page, 'rapid-switch-watchlist-after-reload');

} catch (e) {
  out.scriptError = String(e);
} finally {
  out.logs = formatLogs(logs);
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.5-crossmode-reverify.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
