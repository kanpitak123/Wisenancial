// 2.5 qafree@ setup: create 1 Forex portfolio via real UI, verify quota-full disable behavior,
// then verify free-tier lock-hints on Analytics (behavioral tab) and Coach Room.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-free.json');
const out = {};

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);

try {

await page.goto(route('/Portfolio'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.quotaLabelBefore = await page.locator('[data-test="quota-label"]').innerText().catch(() => '?');
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-portfolio-before.png', fullPage: true });

// creating via UI: quota-controlled — click create-portfolio-card (only if not full already)
const createCardVisible = await page.locator('[data-test="create-portfolio-card"]').isVisible().catch(() => false);
out.createCardVisibleBefore = createCardVisible;

if (createCardVisible) {
  await page.locator('[data-test="create-portfolio-card"]').click();
  await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-test="create-portfolio-name-input"]').fill('QA Free Forex');
  await page.locator('[data-test="create-portfolio-balance-input"]').fill('1000');
  const respPromise = page.waitForResponse((r) => r.url().includes('/portfolios') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  await page.locator('[data-test="submit-create-portfolio-btn"]').click();
  const resp = await respPromise;
  out.createPortfolioStatus = resp ? resp.status() : 'NO_RESPONSE_CAUGHT';
  try { out.createPortfolioBody = resp ? await resp.json() : null; } catch { out.createPortfolioBody = null; }
  await page.waitForTimeout(1500);
}

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
out.quotaLabelAfter = await page.locator('[data-test="quota-label"]').innerText().catch(() => '?');
out.quotaBreakdownAfter = await page.locator('[data-test="quota-breakdown"]').innerText().catch(() => '?');
out.createCardVisibleAfter = await page.locator('[data-test="create-portfolio-card"]').isVisible().catch(() => false);
out.quotaFullNoteVisible = await page.locator('[data-test="quota-full-note"]').isVisible().catch(() => false);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-portfolio-after-light.png', fullPage: true });

// dark mode
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-portfolio-after-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ================= Analytics behavioral lock-hint (free) =================
await switchWorkspace(page, 'Forex');
await page.goto(route('/Analytics'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
// click "Monthly Growth"/"Performance" tab (behavioral) - use text-based tab click
const perfTab = page.locator('.q-tab, [role="tab"]', { hasText: 'Performance' }).first();
if (await perfTab.count() > 0) {
  await perfTab.click();
  await page.waitForTimeout(2500);
}
out.analyticsBehavioralUpgradeVisible = await page.locator('[data-test="analytics-behavioral-upgrade"]').isVisible().catch(() => false);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-analytics-performance-light.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-analytics-performance-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ================= Coach Room lock-hint (free) =================
await page.goto(route('/Coach'), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
out.coachUpgradeVisible = await page.locator('[data-test="coach-upgrade"]').isVisible().catch(() => false);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-coach-light.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.5-qafree-coach-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

} catch (e) {
  out.scriptError = String(e);
} finally {
  out.logs = formatLogs(logs);
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.5-qafree-setup-locks.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
