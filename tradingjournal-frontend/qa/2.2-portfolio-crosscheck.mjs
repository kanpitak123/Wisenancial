import { chromium } from 'playwright';
import path from 'node:path';
import { route, switchWorkspace } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e));

await page.goto(route('/Dashboard'), { waitUntil: 'networkidle' });
await switchWorkspace(page, 'Stock');

// wait for the Dashboard itself to fully settle in Stock mode before moving on
const dashResp = await page.waitForResponse((r) => r.url().includes('/investor/portfolios/') && r.url().includes('/dashboard'), { timeout: 15000 });
console.log('Dashboard confirmed Stock-mode settled:', dashResp.status(), dashResp.url());
await page.waitForTimeout(1000);

// now navigate to Portfolio and specifically watch for the per-portfolio investor dashboard call
const portfolioRespPromise = page.waitForResponse(
  (r) => r.url().includes('/investor/portfolios/17/dashboard'),
  { timeout: 10000 },
).then((r) => ({ ok: true, status: r.status() })).catch((e) => ({ ok: false, error: String(e) }));

await page.goto(route('/Portfolio'), { waitUntil: 'networkidle' });
await page.locator('.port-card').first().waitFor({ state: 'visible', timeout: 25000 });

const investorDashCallOnPortfolioPage = await portfolioRespPromise;
console.log('investor/portfolios/17/dashboard call seen while on /Portfolio:', JSON.stringify(investorDashCallOnPortfolioPage));

await page.waitForTimeout(1500);
const current = (await page.locator('.balance-item--end .balance-value').first().innerText()).trim();
const netPnlAmount = (await page.locator('.growth-label').locator('xpath=following-sibling::div//span').first().innerText()).trim();
const portName = (await page.locator('.port-card').first().locator('.text-subtitle1').first().innerText()).trim();

console.log('Portfolio card shown:', portName);
console.log('Portfolio page — Current:', current);
console.log('Portfolio page — Net PnL amount span:', netPnlAmount);
await page.screenshot({ path: 'qa/screenshots/2.2-portfolio-crosscheck.png', fullPage: true });
await browser.close();
