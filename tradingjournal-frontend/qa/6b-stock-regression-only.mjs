// Quick, standalone re-run of just the Stock /#/stock/AAPL regression checks from
// 6-forex-chart-parity.mjs (kept short so it finishes well inside the access-token
// window, unlike the full script whose 65s forex-realtime wait let the token expire
// before this part ran).
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

function trackChartRequests(page, urlIncludes) {
  const calls = [];
  page.on('response', async (res) => {
    if (res.url().includes(urlIncludes)) {
      const u = new URL(res.url());
      let bars = null;
      try {
        const body = await res.json();
        bars = Array.isArray(body) ? body.map((b) => b.time ?? b.date).filter(Boolean) : null;
      } catch {
        bars = null;
      }
      calls.push({
        status: res.status(),
        before: u.searchParams.get('before'),
        barCount: bars?.length ?? null,
        earliestBar: bars && bars.length ? bars[0] : null,
        latestBar: bars && bars.length ? bars[bars.length - 1] : null,
      });
    }
  });
  return calls;
}

function trackRealtimeRequests(page) {
  const calls = [];
  page.on('response', async (res) => {
    if (res.url().includes('/market/quotes/realtime')) {
      let price = null;
      try {
        const body = await res.json();
        price = Array.isArray(body) && body[0] ? body[0].price : null;
      } catch {
        price = null;
      }
      calls.push({ status: res.status(), price });
    }
  });
  return calls;
}

async function panLeft(page, canvasSelector, times = 8) {
  const canvas = page.locator(canvasSelector).first();
  if ((await canvas.count()) === 0) return false;
  const box = await canvas.boundingBox();
  if (!box) return false;
  const cy = box.y + box.height / 2;
  for (let i = 0; i < times; i++) {
    await page.mouse.move(box.x + box.width * 0.3, cy);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, cy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  return true;
}

async function scrollDriftCheck(page, canvasSelector, screenshotPath) {
  const canvas = page.locator(canvasSelector).first();
  if ((await canvas.count()) === 0) return { attempted: false };
  const box = await canvas.boundingBox();
  if (!box) return { attempted: false };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(80);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(80);
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { attempted: true };
}

try {
  await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
  await switchWorkspace(page, 'Stock');
  await page.waitForTimeout(800);
  await page.goto(route('/stock/AAPL'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const initialCalls = trackChartRequests(page, '/stocks/historical/');
  await page.waitForTimeout(800);
  const initialEarliest = initialCalls.at(-1)?.earliestBar ?? null;

  const olderCalls = trackChartRequests(page, '/stocks/historical/');
  const panned = await panLeft(page, '.price-chart canvas', 8);
  await page.waitForTimeout(1200);
  const olderResponses = olderCalls.filter((c) => c.before);

  const drift = await scrollDriftCheck(
    page,
    '.price-chart canvas',
    'qa/screenshots/6b-stock-AAPL-after-scroll.png',
  );

  const realtimeCalls = trackRealtimeRequests(page);
  await page.waitForTimeout(17_000);

  out.stockRegression = {
    panned,
    initialEarliestBar: initialEarliest,
    olderHistoryRequestsFired: olderResponses.length,
    olderHistoryResponses: olderResponses,
    noDuplicateBarsPastInitialEarliest:
      !initialEarliest ||
      olderResponses.every((r) => !r.latestBar || new Date(r.latestBar) <= new Date(initialEarliest)),
    zoomDriftCheck: drift,
    realtimePollsObservedInSeventeenSeconds: realtimeCalls.length,
    realtimeAllStatus200: realtimeCalls.every((c) => c.status === 200),
    realtimeSample: realtimeCalls.slice(0, 4),
  };

  await page.screenshot({ path: 'qa/screenshots/6b-stock-AAPL-after-pan.png', fullPage: true });
} catch (e) {
  out.scriptError = String(e && e.stack ? e.stack : e);
} finally {
  out.logs = formatLogs(logs);
  fs.mkdirSync(path.join(process.cwd(), 'qa', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'qa', 'logs', '6b-stock-regression-only.json'),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
