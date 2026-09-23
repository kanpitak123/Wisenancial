// Verifies the on-screen Forex portfolio balance matches the DB current_balance after the two
// trade deletions made during Chunk 3 (trade ids 4 and 10, whose Cash Records were reversed).
// API call already confirmed: default /records/portfolio/15 list excludes the 2 REVERSED
// records (ids 27, 33) and correctly includes their REVERSAL entries (ids 36, 37) instead.
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
await switchWorkspace(page, 'Forex');
await page.waitForTimeout(1000);

fs.mkdirSync('qa/screenshots', { recursive: true });
await page.screenshot({ path: 'qa/screenshots/check2-dashboard-forex-balance.png', fullPage: true });

const bodyText = await page.locator('body').innerText();
const hasExpectedBalance = bodyText.includes('10,582.9') || bodyText.includes('10582.9');

console.log(JSON.stringify({
  hasExpectedBalance,
  logs: formatLogs(logs),
}, null, 2));

await browser.close();
