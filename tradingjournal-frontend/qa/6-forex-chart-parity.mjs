// Phase B verification (forex-chart-parity-investigation.md): Forex Asset Explorer
// chart parity with Stock — lazy-load-on-pan (EURUSD, XAUUSD), no duplicate bars,
// no zoom drift, and realtime last-candle updates while the forex market is open.
// Report-only — no app fixes from this run.
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
  page.on('request', (r) => {
    if (r.url().includes(urlIncludes)) {
      const u = new URL(r.url());
      calls.push({
        type: 'request',
        before: u.searchParams.get('before'),
        symbol: u.searchParams.get('symbol'),
        t: Date.now(),
      });
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes(urlIncludes)) {
      const u = new URL(res.url());
      let bars = null;
      try {
        const body = await res.json();
        bars = Array.isArray(body)
          ? body.map((b) => b.time ?? b.date).filter(Boolean)
          : null;
      } catch {
        bars = null;
      }
      calls.push({
        type: 'response',
        status: res.status(),
        before: u.searchParams.get('before'),
        barCount: bars?.length ?? null,
        earliestBar: bars && bars.length ? bars[0] : null,
        latestBar: bars && bars.length ? bars[bars.length - 1] : null,
        t: Date.now(),
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
      calls.push({ status: res.status(), price, t: Date.now() });
    }
  });
  return calls;
}

async function selectSymbol(page, matcher) {
  await page.locator('.q-select').first().click();
  await page.waitForTimeout(300);
  const item = page.locator('.q-menu .q-item', { hasText: matcher }).first();
  const count = await item.count();
  if (count === 0) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  return true;
}

/** ลากกราฟไปทางซ้าย (ดูประวัติย้อนหลัง) หลายรอบ เพื่อชนขอบซ้ายที่โหลดไว้แรก */
async function panLeft(page, canvasSelector, times = 6) {
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

/** ทดสอบซูม-เลื่อนซ้อนกันหลายรอบ (เหมือนวิธียืนยันของ commit a0e8cb6) — no-JS-error + screenshot */
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
  // ============================================================
  // 1. Forex — EURUSD and XAUUSD: lazy-load on pan
  // ============================================================
  await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
  await switchWorkspace(page, 'Forex');
  await page.waitForTimeout(1000);
  await page.goto(route('/AssetExplorer'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const forexResults = {};

  for (const [key, matcher] of [
    ['EURUSD', /EUR.*USD/i],
    ['XAUUSD', /XAU|GOLD/i],
  ]) {
    const chartCalls = trackChartRequests(page, '/assets/portfolio/');
    const picked = await selectSymbol(page, matcher);

    if (!picked) {
      forexResults[key] = { skipped: true, reason: 'symbol not found in dropdown' };
      continue;
    }

    await page.waitForTimeout(1000);
    const initialResponses = chartCalls.filter((c) => c.type === 'response' && !c.before);
    const initialEarliest = initialResponses.at(-1)?.earliestBar ?? null;

    chartCalls.length = 0; // only care about pan-triggered calls from here
    const panned = await panLeft(page, '.price-chart canvas', 8);
    await page.waitForTimeout(1500);

    const olderResponses = chartCalls.filter((c) => c.type === 'response' && c.before);
    const olderBarsFlat = olderResponses.flatMap((r) =>
      r.earliestBar && r.latestBar ? [r.earliestBar, r.latestBar] : [],
    );

    const noDuplicates =
      !initialEarliest ||
      olderResponses.every(
        (r) => !r.latestBar || new Date(r.latestBar) <= new Date(initialEarliest),
      );

    const drift = await scrollDriftCheck(
      page,
      '.price-chart canvas',
      `qa/screenshots/6-forex-${key}-after-scroll.png`,
    );

    forexResults[key] = {
      panned,
      initialEarliestBar: initialEarliest,
      olderHistoryRequestsFired: olderResponses.length,
      olderHistoryResponses: olderResponses,
      noDuplicateBarsPastInitialEarliest: noDuplicates,
      zoomDriftCheck: drift,
    };

    await page.screenshot({ path: `qa/screenshots/6-forex-${key}-after-pan.png`, fullPage: true });
  }
  out.forex = forexResults;

  // ============================================================
  // 2. Forex realtime — last candle updates within ~1 minute (market-hours gated)
  // ============================================================
  await selectSymbol(page, /EUR.*USD/i);
  await page.waitForTimeout(500);
  const realtimeCalls = trackRealtimeRequests(page);
  await page.waitForTimeout(65_000);

  out.forexRealtime = {
    pollsObservedInSixtyFiveSeconds: realtimeCalls.length,
    allStatus200: realtimeCalls.every((c) => c.status === 200),
    distinctPricesObserved: [...new Set(realtimeCalls.map((c) => c.price))],
    sample: realtimeCalls.slice(0, 6),
  };

  // ============================================================
  // 3. Regression — /#/stock/AAPL pan/zoom/lazy-load/realtime unchanged
  // ============================================================
  await switchWorkspace(page, 'Stock');
  await page.waitForTimeout(1000);
  await page.goto(route('/stock/AAPL'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const stockChartCalls = trackChartRequests(page, '/stocks/historical/');
  await page.waitForTimeout(1000);
  const stockInitial = stockChartCalls.filter((c) => c.type === 'response' && !c.before);
  const stockInitialEarliest = stockInitial.at(-1)?.earliestBar ?? null;

  stockChartCalls.length = 0;
  const stockPanned = await panLeft(page, '.price-chart canvas', 8);
  await page.waitForTimeout(1500);
  const stockOlder = stockChartCalls.filter((c) => c.type === 'response' && c.before);

  const stockDrift = await scrollDriftCheck(
    page,
    '.price-chart canvas',
    'qa/screenshots/6-stock-AAPL-after-scroll.png',
  );

  const stockRealtimeCalls = trackRealtimeRequests(page);
  await page.waitForTimeout(20_000);

  out.stockRegression = {
    panned: stockPanned,
    initialEarliestBar: stockInitialEarliest,
    olderHistoryRequestsFired: stockOlder.length,
    olderHistoryResponses: stockOlder,
    noDuplicateBarsPastInitialEarliest:
      !stockInitialEarliest ||
      stockOlder.every(
        (r) => !r.latestBar || new Date(r.latestBar) <= new Date(stockInitialEarliest),
      ),
    zoomDriftCheck: stockDrift,
    realtimePollsObservedInTwentySeconds: stockRealtimeCalls.length,
    realtimeAllStatus200: stockRealtimeCalls.every((c) => c.status === 200),
  };

  await page.screenshot({ path: 'qa/screenshots/6-stock-AAPL-after-pan.png', fullPage: true });
} catch (e) {
  out.scriptError = String(e && e.stack ? e.stack : e);
} finally {
  out.logs = formatLogs(logs);
  fs.mkdirSync(path.join(process.cwd(), 'qa', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'qa', 'logs', '6-forex-chart-parity.json'),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
