// 2.2 Community: create-post dialog QSelect-into-textarea typing bug check, then verify the
// post actually persists (like/comment counts are a separate follow-up, not done here).
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
await page.goto(route('/Community'), { waitUntil: 'networkidle' });
await page.getByText('Add Post', { exact: true }).waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1000);

await page.getByText('Add Post', { exact: true }).click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

// Open the "Select Asset" QSelect, pick the first option, then IMMEDIATELY type into the
// textarea without pressing Escape first -- this is the specific repro the user asked for.
const select = page.locator('.q-dialog .q-select');
await select.click();
const selectableOption = page.locator('.q-menu .q-item:not(.disabled)').first();
await selectableOption.waitFor({ state: 'visible', timeout: 5000 });
const pickedLabel = (await selectableOption.innerText()).trim();
await selectableOption.click();

const testText = 'QSelect-then-type test post';
const textarea = page.locator('.q-dialog textarea');
await textarea.click();
await textarea.type(testText, { delay: 30 });

const actualValue = await textarea.inputValue();
const textLandedCorrectly = actualValue === testText;

await page.screenshot({ path: 'qa/screenshots/2.2-community-qselect.png', fullPage: true });

console.log('About to submit a real post to qa@wisenancial.test Community feed.');
const respPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/posts'),
  { timeout: 15000 },
).catch((e) => ({ error: String(e) }));

await page.locator('.q-dialog').getByText('Post', { exact: true }).click();
const resp = await respPromise;
let status = null, body = null;
if (resp && !resp.error) {
  status = resp.status();
  try { body = await resp.json(); } catch { try { body = await resp.text(); } catch {} }
} else {
  status = 'NO_RESPONSE_CAUGHT';
  body = resp?.error;
}

await page.waitForTimeout(1000);
await page.screenshot({ path: 'qa/screenshots/2.2-community-after-post.png', fullPage: true });

const result = {
  pickedAssetLabel: pickedLabel,
  typedText: testText,
  textareaActualValue: actualValue,
  textLandedCorrectly,
  createPostStatus: status,
  createPostBody: body,
  logs: formatLogs(logs),
};
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-community.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
