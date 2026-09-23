// 2.2 Dashboard (Stock mode): Portfolio Growth chart has real data, numbers match Portfolio
// list / Analytics, no Forex-mode cards bleed through.
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
await page.reload({ waitUntil: 'networkidle' });
// first-visit-after-reload settle: poll for hero card instead of fixed wait
await page.locator('[data-test="hero-card"]').waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1500); // let chart XHR + apexcharts render finish

const heroValue = await page.locator('.hero-value').innerText();
const kpiVals = await page.locator('.stat-val').allInnerTexts();
const kpiLabels = await page.locator('.stat-label').allInnerTexts();

const chartSvgCount = await page.locator('.chart-container .apexcharts-canvas').count();
const chartHasSeriesPath = await page.locator('.chart-container path.apexcharts-area').count();

// Forex-only bleed check: pair/strategy/emotion insights row is v-if="isTrader"
const forexInsightsVisible = await page.locator('text=Insights').count();
const goalCardVisible = await page.locator('text=Goal').count();

const bodyText = await page.locator('body').innerText();
const hasForexWord = /Forex/i.test(bodyText) && !bodyText.includes('สลับไปโหมด Forex') && !bodyText.includes('อยู่ในโหมด');

await page.screenshot({ path: 'qa/screenshots/2.2-dashboard-stock.png', fullPage: true });

const result = {
  heroValue,
  kpiLabels,
  kpiVals,
  chartSvgCount,
  chartHasSeriesPath,
  forexInsightsVisible,
  goalCardVisible,
  hasForexWordInBody: hasForexWord,
  logs: formatLogs(logs),
};

fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-dashboard.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
