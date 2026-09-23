// 2.2 News: systemic empty-on-first-load check, console/HTTP errors, AI summary raw-prompt leak
// re-check (previously reported: economic-calendar items showed the raw AI prompt as summary).
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
await page.goto(route('/News'), { waitUntil: 'networkidle' });
await page.locator('[data-test="news-page"]').waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(3000); // account for the systemic late-load pattern seen elsewhere

const newsCardCount = await page.locator('.news-card, [class*="news-card"]').count();
const bodyText = await page.locator('[data-test="news-page"]').innerText();
const rawPromptLeak = /Analyze likely impact|Do not provide investment instructions|Economic event:/i.test(bodyText);

console.log('news items rendered on first load (no manual reload):', newsCardCount);
console.log('raw AI prompt text visible anywhere on page:', rawPromptLeak);

// now the systemic-pattern check: reload and see if count changes
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const newsCardCountAfterReload = await page.locator('.news-card, [class*="news-card"]').count();
console.log('news items after hard reload:', newsCardCountAfterReload);

await page.screenshot({ path: 'qa/screenshots/2.2-news.png', fullPage: true });

const result = {
  newsCardCount,
  newsCardCountAfterReload,
  rawPromptLeak,
  logs: formatLogs(logs),
};
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-news.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
