// 2.5 Shared pages in Forex mode: Dashboard, Portfolio, Analytics (forex tabs), Watchlist
// (manual-only, no /stocks/radar call), News, Community (mode-filtered feed).
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const out = {};

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

const radarCalls = [];
page.on('request', (r) => { if (r.url().includes('/stocks/radar')) radarCalls.push(r.url()); });

try {

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Forex');
await page.waitForTimeout(2000);

// ---------- Dashboard ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.dashboardHasForexBadge = (await page.locator('text=FOREX').count()) > 0;
await page.screenshot({ path: 'qa/screenshots/2.5-forex-dashboard-light.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.5-forex-dashboard-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ---------- Portfolio ----------
await page.goto(route('/Portfolio'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.portfolioShowsForexMain = (await page.locator('text=QA Forex Main').count()) > 0;
await page.screenshot({ path: 'qa/screenshots/2.5-forex-portfolio-light.png', fullPage: true });

// ---------- Analytics (forex tabs) ----------
await page.goto(route('/Analytics'), { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
for (const tabName of ['Monthly Growth', 'Performance', 'Win Rate', 'PnL Charts']) {
  const tab = page.locator('.q-tab, [role="tab"]', { hasText: tabName }).first();
  if (await tab.count() > 0) {
    await tab.click();
    await page.waitForTimeout(3000);
    const slug = tabName.replace(/\s+/g, '').toLowerCase();
    await page.screenshot({ path: `qa/screenshots/2.5-forex-analytics-${slug}.png`, fullPage: true });
  }
}

// ---------- Watchlist ----------
await page.goto(route('/Watchlist'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.watchlistManualSectionVisible = await page.locator('[data-test="manual-section"]').isVisible().catch(() => false);
out.watchlistRadarSectionCount = await page.locator('[data-test^="radar-section-"]').count();
await page.screenshot({ path: 'qa/screenshots/2.5-forex-watchlist-light.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.5-forex-watchlist-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ---------- News ----------
await page.goto(route('/News'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'qa/screenshots/2.5-forex-news-light.png', fullPage: true });

// ---------- Community ----------
await page.goto(route('/Community'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.communityPostCount = await page.locator('.post-card').count();
const communityText = await page.locator('.post-card').allInnerTexts();
out.communityHasStockSymbols = communityText.some((t) => /\b(AAPL|MSFT|NVDA)\b/.test(t));
await page.screenshot({ path: 'qa/screenshots/2.5-forex-community-light.png', fullPage: true });

out.radarCallsWhileInForexMode = radarCalls;

} catch (e) {
  out.scriptError = String(e);
} finally {
  out.logs = formatLogs(logs);
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.5-forex-shared-pages.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
