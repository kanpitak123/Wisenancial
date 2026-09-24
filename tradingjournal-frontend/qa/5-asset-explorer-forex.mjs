// 5. Asset Explorer in Forex mode: symbol search/select (major pair, cross, gold),
// chart load correctness, rapid symbol switching (stale-data race check), chart
// interval controls, light/dark mode. Report-only — no app fixes from this run.
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

// Track every chart-data request/response independently of attachLogging's >=400 filter,
// so we can correlate "which symbol was requested" vs "which response came back when" —
// needed to detect a stale-data race during rapid symbol switching.
const chartCalls = [];
page.on('request', (r) => {
  if (r.url().includes('/assets/portfolio/') && r.url().includes('/chart')) {
    const u = new URL(r.url());
    chartCalls.push({ type: 'request', symbol: u.searchParams.get('symbol'), interval: u.searchParams.get('interval'), t: Date.now() });
  }
});
page.on('response', async (res) => {
  if (res.url().includes('/assets/portfolio/') && res.url().includes('/chart')) {
    const u = new URL(res.url());
    let len = null;
    try {
      const body = await res.json();
      len = Array.isArray(body) ? body.length : null;
    } catch {
      len = null;
    }
    chartCalls.push({ type: 'response', symbol: u.searchParams.get('symbol'), status: res.status(), points: len, t: Date.now() });
  }
});

async function openSelectAndGetOptions(page) {
  const select = page.locator('.q-select').first();
  await select.click();
  await page.waitForTimeout(400);
  const options = await page.locator('.q-menu .q-item__label').allInnerTexts();
  return { select, options };
}

async function pickSymbol(page, matcher, label) {
  await page.locator('.q-select').first().click();
  await page.waitForTimeout(300);
  const item = page.locator('.q-menu .q-item', { hasText: matcher }).first();
  const count = await item.count();
  if (count === 0) {
    await page.keyboard.press('Escape');
    return { picked: false, label };
  }
  const text = await item.locator('.q-item__label').first().innerText();
  await item.click();
  return { picked: true, label, text };
}

try {

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Forex');
await page.waitForTimeout(1500);

await page.goto(route('/AssetExplorer'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// ---------- 1. Symbol list discovery ----------
const { options } = await openSelectAndGetOptions(page);
out.availableSymbols = options;
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const majorMatch = options.find((o) => /EUR.*USD|USD.*EUR/i.test(o)) || options.find((o) => /USD/i.test(o));
const crossMatch = options.find((o) => !/USD/i.test(o) && !/XAU|GOLD/i.test(o));
const goldMatch = options.find((o) => /XAU|GOLD/i.test(o));

out.chosenSymbols = { majorMatch, crossMatch, goldMatch };

// ---------- 2. Select each symbol, verify data loads ----------
const perSymbol = {};
for (const [key, matcher] of [['major', majorMatch], ['cross', crossMatch], ['gold', goldMatch]]) {
  if (!matcher) {
    perSymbol[key] = { skipped: true, reason: 'no matching symbol found in dropdown' };
    continue;
  }
  const pick = await pickSymbol(page, matcher, key);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const priceText = await page.locator('.asset-info-card .text-h4').first().innerText().catch(() => null);
  const symbolShown = await page.locator('.asset-info-card .text-h5').first().innerText().catch(() => null);
  const spinnerVisible = await page.locator('.chart-wrapper .q-spinner-dots').isVisible().catch(() => false);
  const canvasCount = await page.locator('.chart-wrapper canvas').count();

  perSymbol[key] = {
    pick,
    priceText,
    symbolShown,
    spinnerStillVisibleAfterWait: spinnerVisible,
    chartCanvasCount: canvasCount,
    priceLooksZero: priceText === '$0.00',
  };

  await page.screenshot({ path: `qa/screenshots/5-asset-explorer-${key}-light.png`, fullPage: true });
}
out.perSymbol = perSymbol;

// ---------- 3. Chart interval controls (1D / 1W / 1M) on the last-selected symbol ----------
const intervalResults = {};
for (const iv of ['1W', '1M', '1D']) {
  const btn = page.locator('.chart-controls .q-btn', { hasText: iv }).first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    intervalResults[iv] = {
      canvasCount: await page.locator('.chart-wrapper canvas').count(),
    };
    await page.screenshot({ path: `qa/screenshots/5-asset-explorer-interval-${iv}.png`, fullPage: true });
  } else {
    intervalResults[iv] = { buttonNotFound: true };
  }
}
out.intervalResults = intervalResults;

// ---------- 4. Chart interaction: wheel zoom + drag pan on canvas ----------
const canvas = page.locator('.chart-wrapper canvas').first();
if ((await canvas.count()) > 0) {
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -200); // zoom in
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 200); // zoom out
    await page.waitForTimeout(300);
    await page.mouse.move(cx - 100, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    out.chartInteraction = { attempted: true, canvasFound: true };
    await page.screenshot({ path: 'qa/screenshots/5-asset-explorer-after-interaction.png', fullPage: true });
  } else {
    out.chartInteraction = { attempted: false, reason: 'canvas has no bounding box' };
  }
} else {
  out.chartInteraction = { attempted: false, reason: 'no canvas found' };
}

// ---------- 5. Rapid symbol switching (stale-data race check) ----------
chartCalls.length = 0; // reset, only care about this phase now
const rapidCandidates = [majorMatch, crossMatch, goldMatch].filter(Boolean);
if (rapidCandidates.length >= 2) {
  for (const matcher of rapidCandidates) {
    await page.locator('.q-select').first().click();
    await page.waitForTimeout(80);
    const item = page.locator('.q-menu .q-item', { hasText: matcher }).first();
    if ((await item.count()) > 0) {
      await item.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(120); // deliberately short — faster than the chart fetch round-trip
  }
  // settle
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const finalSymbolShown = await page.locator('.asset-info-card .text-h5').first().innerText().catch(() => null);
  const finalPriceText = await page.locator('.asset-info-card .text-h4').first().innerText().catch(() => null);
  const lastRequested = rapidCandidates[rapidCandidates.length - 1];

  out.rapidSwitch = {
    sequence: rapidCandidates,
    finalSymbolShown,
    finalPriceText,
    expectedLastSymbolContains: lastRequested,
    matchesExpectedLast: finalSymbolShown ? finalSymbolShown.replace(/\s+/g, '').toUpperCase().includes(String(lastRequested).replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3)) : null,
    networkTimeline: chartCalls,
  };
  await page.screenshot({ path: 'qa/screenshots/5-asset-explorer-after-rapid-switch.png', fullPage: true });
} else {
  out.rapidSwitch = { skipped: true, reason: 'fewer than 2 distinct symbols available to test with' };
}

// ---------- 6. Dark mode ----------
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'qa/screenshots/5-asset-explorer-dark.png', fullPage: true });
out.darkModeBodyClass = await page.evaluate(() => document.body.className);
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(400);

} catch (e) {
  out.scriptError = String(e && e.stack ? e.stack : e);
} finally {
  out.logs = formatLogs(logs);
  fs.mkdirSync(path.join(process.cwd(), 'qa', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '5-asset-explorer-forex.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
