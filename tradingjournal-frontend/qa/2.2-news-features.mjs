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
const out = {};

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');
await page.goto(route('/News'), { waitUntil: 'networkidle' });
await page.locator('[data-test="news-page"]').waitFor({ state: 'visible', timeout: 25000 });
// known systemic bug workaround: reload once to actually get the feed to load
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

out.initialCardCount = await page.locator('.news-card, [class*="news-card"]').count();

// ---- search ----
const searchInput = page.locator('.search-input input');
await searchInput.fill('Fed');
await page.waitForTimeout(1200);
out.cardCountAfterSearchFed = await page.locator('.news-card, [class*="news-card"]').count();
await searchInput.fill('');
await page.waitForTimeout(1000);

// ---- importance/sentiment filter pills ----
const pills = await page.locator('.filter-pill').allInnerTexts();
out.filterPillLabels = pills;
if (pills.length > 1) {
  await page.locator('.filter-pill').nth(1).click();
  await page.waitForTimeout(1000);
  out.cardCountAfterPillFilter = await page.locator('.news-card, [class*="news-card"]').count();
  const clearBtn = page.locator('text=Clear, text=ล้างตัวกรอง').first();
  if (await clearBtn.count() > 0) await clearBtn.click();
  await page.waitForTimeout(1000);
}

// ---- pin ----
const pinBtn = page.locator('[data-test="news-pin"]').first();
if (await pinBtn.count() > 0) {
  await pinBtn.click();
  await page.waitForTimeout(1000);
  out.pinClicked = true;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  out.pinnedSectionVisibleAfterReload = (await page.locator('body').innerText()).includes('ปักหมุด') || (await page.locator('body').innerText()).toLowerCase().includes('pinned');
} else {
  out.pinClicked = false;
}

// ---- live badge ----
const bodyText = await page.locator('body').innerText();
out.hasLiveIndicator = bodyText.includes('Live updates') || bodyText.includes('อัปเดตเรียลไทม์');

// ---- trending symbols (most-discussed) ----
out.trendingSymbolsSectionText = (await page.locator('text=Trending symbols, text=หุ้นที่ถูกพูดถึงมากสุด').first().locator('xpath=..').innerText().catch(() => '(section not found)'));

// ---- earnings calendar (known stub per code comment: backend always returns []) ----
out.earningsCalendarText = (await page.locator('text=Earnings calendar, text=ปฏิทินผลประกอบการ').first().locator('xpath=..').innerText().catch(() => '(section not found)'));

out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-news-features.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
