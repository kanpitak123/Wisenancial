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
// KNOWN BUG (documented in report): feed doesn't load on first SPA nav, only on hard reload.
// Reload here so this check can proceed past that separate, already-reported issue.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const card = page.locator('.post-card', { hasText: 'QSelect-then-type test post' }).first();
await card.waitFor({ state: 'visible', timeout: 10000 });

const likeCountBefore = (await card.locator('.q-mr-lg').first().innerText()).trim();
console.log('About to like the test post.');
const likeRespPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/like'),
  { timeout: 10000 },
).catch((e) => ({ error: String(e) }));
await card.locator('button').first().click(); // like button is first button in the action row
const likeResp = await likeRespPromise;
await page.waitForTimeout(800);
const likeCountAfterClick = (await card.locator('.q-mr-lg').first().innerText()).trim();

// reload to check persistence (not just optimistic UI)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const cardAfterReload = page.locator('.post-card', { hasText: 'QSelect-then-type test post' }).first();
const likeCountAfterReload = (await cardAfterReload.locator('.q-mr-lg').first().innerText()).trim();

console.log('About to add a comment to the test post.');
await cardAfterReload.locator('button').nth(1).click(); // comment toggle button
await page.waitForTimeout(500);
const commentInput = cardAfterReload.locator('input[placeholder="Write a comment..."]');
await commentInput.waitFor({ state: 'visible', timeout: 5000 });
await commentInput.fill('QA test comment');
const commentRespPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/comments'),
  { timeout: 10000 },
).catch((e) => ({ error: String(e) }));
await commentInput.press('Enter');
const commentResp = await commentRespPromise;
await page.waitForTimeout(1000);
const commentAppearsWithoutReload = (await cardAfterReload.innerText()).includes('QA test comment');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const cardFinal = page.locator('.post-card', { hasText: 'QSelect-then-type test post' }).first();
const commentPersistsAfterReload = (await cardFinal.innerText()).includes('QA test comment');

const result = {
  likeCountBefore,
  likeRespStatus: likeResp && !likeResp.error ? likeResp.status() : likeResp?.error,
  likeCountAfterClick,
  likeCountAfterReload,
  commentRespStatus: commentResp && !commentResp.error ? commentResp.status() : commentResp?.error,
  commentAppearsWithoutReload,
  commentPersistsAfterReload,
  logs: formatLogs(logs),
};
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-community-like-comment.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: 'qa/screenshots/2.2-community-like-comment.png', fullPage: true });

await browser.close();
