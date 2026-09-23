// Verifies the QA-sweep Chunk 1 latency fixes on the real running app (qa@wisenancial.test):
// - Community feed still renders real posts, no console/network errors (posts.service.ts refactor)
// - Analytics tabs (Forex mode, since the trader-analytics cache is Trader-only) still show real
//   data across all tabs, and the onMounted/watch double-fetch is gone (counts requests)
// - Watchlist no longer fires /watchlist/portfolio/:id 3x on one page load
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

const requestLog = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('/posts') || url.includes('/analytics/') || url.includes('/watchlist')) {
    requestLog.push({ t: Date.now(), url: url.replace(/^https?:\/\/[^/]+/, '') });
  }
});

const result = {};

// ---- Community ----
await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
requestLog.length = 0;
await page.goto(route('/Community'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const communityBody = await page.locator('.q-page').innerText().catch(() => '');
result.community = {
  bodyLen: communityBody.length,
  hasPostContent: communityBody.length > 100,
  requestsFired: requestLog.map((r) => r.url),
  postsRequestCount: requestLog.filter((r) => r.url.includes('/posts')).length,
};
await page.screenshot({ path: 'qa/screenshots/chunk1-verify-community.png' });

// ---- Analytics (Forex/Trader mode — the cache fix targets TraderAnalyticsService) ----
await switchWorkspace(page, 'Forex');
requestLog.length = 0;
await page.goto(route('/Analytics'), { waitUntil: 'networkidle' });
await page.locator('.q-tab').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3000);
const analyticsBody = await page.locator('.q-page').innerText().catch(() => '');
const analyticsReqs = requestLog.filter((r) => r.url.includes('/analytics/'));
const byEndpoint = {};
for (const r of analyticsReqs) {
  const m = r.url.match(/\/analytics\/portfolio\/\d+\/([a-z-]+)/);
  const key = m ? m[1] : r.url;
  byEndpoint[key] = (byEndpoint[key] ?? 0) + 1;
}
result.analytics = {
  bodyLen: analyticsBody.length,
  hasContent: analyticsBody.length > 200,
  requestCountsByEndpoint: byEndpoint,
  totalAnalyticsRequests: analyticsReqs.length,
};
await page.screenshot({ path: 'qa/screenshots/chunk1-verify-analytics-overview.png' });

// click through remaining tabs to confirm real data + no errors
const tabLabels = await page.locator('.q-tab').allInnerTexts().catch(() => []);
result.analyticsTabs = tabLabels;
for (const label of tabLabels) {
  const tab = page.locator('.q-tab', { hasText: label.trim() }).first();
  if ((await tab.count()) === 0) continue;
  await tab.click().catch(() => {});
  await page.waitForTimeout(1500);
}

// ---- Watchlist ----
requestLog.length = 0;
await page.goto(route('/Watchlist'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const watchlistReqs = requestLog.filter((r) => r.url.includes('/watchlist/portfolio'));
result.watchlist = {
  watchlistPortfolioRequestCount: watchlistReqs.length,
  urls: watchlistReqs.map((r) => r.url),
};
await page.screenshot({ path: 'qa/screenshots/chunk1-verify-watchlist.png' });

result.logs = formatLogs(logs);

await browser.close();

fs.writeFileSync(
  path.join(process.cwd(), 'qa', 'logs', 'chunk1-verify.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
