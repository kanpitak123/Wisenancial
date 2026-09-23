// 2.4 Active Positions (open/close full flow), Goals, Lot Calculator (hand-verified formulas).
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const out = {};

async function selectQOption(page, labelText, optionText) {
  const label = page.locator('.text-caption', { hasText: labelText }).first();
  const field = label.locator('xpath=following-sibling::*[1]');
  await field.click();
  await page.waitForTimeout(200);
  const opt = page.locator('.q-menu .q-item', { hasText: optionText }).first();
  await opt.waitFor({ state: 'visible', timeout: 5000 });
  await opt.click();
  return field;
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

try {

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Forex');

// ================= Active Positions =================
await page.goto(route('/ActivePositions'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.getByRole('button', { name: 'Open New Trade' }).click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
await selectQOption(page, 'Asset / Pair', 'XAU/USD (Gold)');
await selectQOption(page, 'Side', 'BUY');
await page.locator('.text-caption', { hasText: 'Lot Size (Volume)' }).first().locator('xpath=following-sibling::*[1]//input').fill('0.25');
await page.locator('.text-caption', { hasText: 'Entry Price' }).first().locator('xpath=following-sibling::*[1]//input').fill('3300');

const respOpen = page.waitForResponse((r) => r.url().includes('/trades') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: 'Execute Trade' }).click();
const respO = await respOpen;
out.openPositionStatus = respO ? respO.status() : 'NO_RESPONSE_CAUGHT';
try { out.openPositionBody = respO ? await respO.json() : null; } catch { out.openPositionBody = null; }
await page.waitForTimeout(1500);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.locator('[data-test], td', { hasText: 'XAU/USD' }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
out.xauRowVisibleAfterReload = (await page.locator('td', { hasText: 'XAU/USD' }).count()) > 0;
await page.screenshot({ path: 'qa/screenshots/2.4-active-positions-open-light.png', fullPage: true });

// dark mode
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.4-active-positions-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// close the position
const closeBtn = page.locator('tr', { hasText: 'XAU/USD' }).first().locator('button').last();
await closeBtn.click();
await page.locator('.q-dialog', { hasText: 'Close:' }).waitFor({ state: 'visible', timeout: 5000 });
const closePriceInput = page.locator('.text-caption', { hasText: 'Actual Exit Price' }).first().locator('xpath=following-sibling::*[1]//input');
await closePriceInput.fill('3320');
const respClose = page.waitForResponse((r) => /\/trades\/\d+\/close/.test(r.url()) && r.request().method() === 'PATCH' || (/\/trades\/\d+/.test(r.url()) && r.request().method() === 'PUT'), { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: 'Close & Move to Journal' }).click();
const respC = await respClose;
out.closePositionStatus = respC ? respC.status() : 'NO_RESPONSE_CAUGHT';
try { out.closePositionBody = respC ? await respC.json() : null; } catch { out.closePositionBody = null; }
await page.waitForTimeout(1500);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
out.xauStillInActivePositionsAfterClose = (await page.locator('td', { hasText: 'XAU/USD' }).count()) > 0;

// verify it moved to Journal
await page.goto(route('/Journal'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
out.xauVisibleInJournalAfterClose = (await page.locator('[data-test^="trade-row-"]', { hasText: 'XAU/USD' }).count()) > 0;

// ================= Goals =================
await page.goto(route('/Goals'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'qa/screenshots/2.4-goals-light.png', fullPage: true });

const targetInput = page.locator('input[type="number"]').first();
await targetInput.fill('1000');
const respGoal = page.waitForResponse((r) => r.url().includes('/goals') && ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: 'Save' }).click();
const respG = await respGoal;
out.saveGoalStatus = respG ? respG.status() : 'NO_RESPONSE_CAUGHT';
await page.waitForTimeout(1000);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
out.goalTargetPersistedAfterReload = await targetInput.inputValue();
out.goalProgressBarVisible = (await page.locator('.q-linear-progress').count()) > 0;

// prev/next month nav
const prevBtn = page.locator('[icon="chevron_left"], .q-icon[name="chevron_left"]').first();
await prevBtn.click().catch(() => {});
await page.waitForTimeout(1000);
out.prevMonthLabel = await page.locator('.text-subtitle1').first().innerText().catch(() => '?');
await page.screenshot({ path: 'qa/screenshots/2.4-goals-prevmonth.png', fullPage: true });

// dark mode
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.4-goals-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ================= Lot Calculator =================
await page.goto(route('/LotCalculator'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'qa/screenshots/2.4-lotcalc-default-light.png', fullPage: true });

// read default values as rendered
const summaryVals = await page.locator('.summary-val').allInnerTexts();
const tierLots = await page.locator('.tier-lot').allInnerTexts();
const recommendedLotText = await page.locator('.text-caption.text-muted:has-text("based on your parameters")').innerText().catch(() => '');
out.lotCalcDefault = { summaryVals, tierLots, recommendedLotText };

// hand-verify: defaults are XAU/USD, balance 1000, risk 1%, RR 2, price 3300, TP 3320, SL 3290
// riskAmount = 1000*1/100 = 10; slDistance=|3300-3290|=10; tpDistance=|3320-3300|=20; actualRR=20/10=2.00
// pipVal(XAU/USD)=100; recommendedLot = 10/(10*100) = 0.01
// tier1=0.01*0.5=0.005->round to 0.01 (Math.round floor), tier2=0.0075->0.01, tier3=0.01, tier4=0.015->0.02
out.handCalculatedExpected = {
  riskAmount: 10,
  rewardAmount: 20,
  slDistance: 10,
  tpDistance: 20,
  actualRR: '1:2.00',
  recommendedLot: '0.01',
  tiers: [0.01, 0.01, 0.01, 0.02],
};

// change risk% to 2 and re-verify math updates
const riskInput = page.locator('.risk-input input');
await riskInput.fill('2');
await page.waitForTimeout(500);
out.afterRiskChangeTo2 = {
  summaryVals: await page.locator('.summary-val').allInnerTexts(),
  tierLots: await page.locator('.tier-lot').allInnerTexts(),
};
// expected: riskAmount=1000*2/100=20; recommendedLot=20/(10*100)=0.02; tiers: 0.01,0.015->0.02,0.02,0.03
out.handCalculatedExpectedAfterRiskChange = {
  riskAmount: 20,
  recommendedLot: '0.02',
  tiers: [0.01, 0.02, 0.02, 0.03],
};

await page.screenshot({ path: 'qa/screenshots/2.4-lotcalc-risk2pct-light.png', fullPage: true });

// dark mode
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.4-lotcalc-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

} catch (e) {
  out.scriptError = String(e);
} finally {
  out.logs = formatLogs(logs);
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.4-positions-goals-lot.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
