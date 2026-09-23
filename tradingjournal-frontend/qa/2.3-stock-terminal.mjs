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
await page.locator('text=Stock Terminal').first().click();
await page.waitForURL('**/stock/**', { timeout: 15000 }).catch(() => {});
console.log('waiting for default symbol resolution + chart to be ready...');
await page.waitForSelector('.q-tab', { timeout: 25000 });
await page.waitForTimeout(3000);
out.defaultUrl = page.url();
out.tabs = await page.locator('.q-tab').allInnerTexts();

// ---- candle/line toggle ----
const lineBtnCandidates = page.locator('button:has-text("Line"), [icon="show_chart"], .timeframe-group button').filter({ hasText: '' });
// Use icon-based buttons near timeframe-group instead (candlestick icon confirmed in source at chartDisplayType)
const candleIconBtn = page.locator('button:has([class*="candlestick_chart"]), .timeframe-group [icon="candlestick_chart"]');
console.log('checking candle/line toggle buttons near timeframe group...');
const toggleBtns = await page.locator('.timeframe-group .q-btn, .timeframe-selector .q-btn').count();
out.timeframeGroupButtonCount = toggleBtns;

// ---- pan/zoom on chart canvas ----
const chartCanvas = page.locator('.price-chart canvas, [class*="chart"] canvas').first();
const canvasVisible = await chartCanvas.isVisible().catch(() => false);
out.chartCanvasVisible = canvasVisible;
if (canvasVisible) {
  const box = await chartCanvas.boundingBox();
  if (box) {
    console.log('attempting pan drag on chart canvas...');
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    console.log('attempting wheel zoom on chart canvas...');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);
    out.panZoomAttempted = true;
  }
}
await page.screenshot({ path: 'qa/screenshots/2.3-terminal-panzoom.png' });

// ---- rapid timeframe switching ----
const tfLabels = ['1D', '1W', '1M', '3M', '1Y'];
console.log('rapidly switching timeframes...');
for (const label of tfLabels) {
  const btn = page.locator('.timeframe-group .q-btn, .timeframe-btn', { hasText: label }).first();
  if (await btn.count() > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
await page.waitForTimeout(1500);
out.rapidTimeframeSwitchLogsClean = logs.pageerror.length === 0 && logs.badResponses.length === 0;
await page.screenshot({ path: 'qa/screenshots/2.3-terminal-after-rapid-tf.png' });

// ---- symbol switching via popular stocks card, check for stale-data bleed ----
console.log('switching symbol via popular stocks card...');
const priceBeforeSwitch = await page.locator('[data-test="live-price-badge"]').first().innerText().catch(() => '(not found)');
const popularRow = page.locator('[data-test="popular-row-th"], [data-test^="popular-row"]').first();
let switchedSymbol = null;
if (await popularRow.count() > 0) {
  switchedSymbol = (await popularRow.innerText()).split('\n')[0];
  await popularRow.click();
  await page.waitForTimeout(2000);
}
out.symbolBeforeSwitch = out.defaultUrl;
out.symbolAfterSwitchUrl = page.url();
out.priceBeforeSwitch = priceBeforeSwitch;
const priceAfterSwitch = await page.locator('[data-test="live-price-badge"]').first().innerText().catch(() => '(not found)');
out.priceAfterSwitch = priceAfterSwitch;
out.priceChangedAfterSwitch = priceBeforeSwitch !== priceAfterSwitch;

// ---- sub-tabs render distinct content ----
console.log('checking each sub-tab renders distinct, non-empty content...');
out.subTabContent = {};
for (const tabLabel of ['สรุปบริษัท', 'ข้อมูลการเงิน', 'สถิติย้อนหลัง', 'ภาพรวมตลาด']) {
  const tab = page.locator('.q-tab', { hasText: tabLabel });
  if (await tab.count() > 0) {
    await tab.click();
    await page.waitForTimeout(2000);
    const text = await page.locator('.q-tab-panel, .q-page').first().innerText().catch(() => '');
    out.subTabContent[tabLabel] = text.length;
  }
}

out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.3-stock-terminal.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
