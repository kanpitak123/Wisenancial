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
await page.goto(route('/Analytics'), { waitUntil: 'networkidle' });
await page.locator('.q-tab').first().waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1500);
await page.locator('.q-tab', { hasText: 'AI Insights' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Loading analysis data'), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

const advisorCard = page.locator('[data-test="ai-portfolio-advisor"]');
out.advisorCardVisible = (await advisorCard.count()) > 0;
const generateBtn = page.locator('[data-test="ai-advisor-generate"]');
out.generateBtnDisabled = await generateBtn.getAttribute('disable').then(() => generateBtn.isDisabled()).catch(async () => generateBtn.isDisabled());
out.disabledReasonVisible = (await page.locator('[data-test="ai-advisor-disabled-reason"]').count()) > 0;
out.disabledReasonText = out.disabledReasonVisible
  ? await page.locator('[data-test="ai-advisor-disabled-reason"]').innerText()
  : null;

console.log('About to click Generate AI Analysis for real on qa@wisenancial.test.');
if (!(await generateBtn.isDisabled())) {
  const genRespPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && (r.url().includes('/ai/') || r.url().includes('advisor') || r.url().includes('review')),
    { timeout: 30000 },
  ).catch((e) => ({ error: String(e) }));
  await generateBtn.click();
  const genResp = await genRespPromise;
  out.generateStatus = genResp && !genResp.error ? genResp.status() : genResp?.error;
  if (genResp && !genResp.error) {
    try { out.generateBodyPreview = JSON.stringify(await genResp.json()).slice(0, 500); } catch {}
  }
  await page.waitForTimeout(3000);
  out.summaryVisibleAfterGenerate = (await page.locator('[data-test="ai-advisor-summary"]').count()) > 0;
  out.errorVisibleAfterGenerate = (await page.locator('[data-test="ai-advisor-error"]').count()) > 0;
  out.errorText = out.errorVisibleAfterGenerate ? await page.locator('[data-test="ai-advisor-error"]').innerText() : null;
} else {
  out.generateSkipped = 'button was disabled, see disabledReasonText above';
}

await page.screenshot({ path: 'qa/screenshots/2.2-ai-generate.png', fullPage: true });
out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-ai-generate.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
