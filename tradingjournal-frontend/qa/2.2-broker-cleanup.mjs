import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs } from './helpers.mjs';

const authFile = path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const logs = newLogs();
attachLogging(page, logs);
const out = {};

await page.goto(route('/BrokerConnections'), { waitUntil: 'networkidle' });
await page.locator('[data-test^="connection-"]').first().waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1000);

const connRow = page.locator('[data-test^="connection-"]').first();

console.log('About to revoke the leftover connection from the crashed test, with proper dialog confirm this time.');
await connRow.locator('[data-test="revoke-btn"]').click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
const revokeRespPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/revoke'),
  { timeout: 10000 },
).catch((e) => ({ error: String(e) }));
await page.locator('.q-dialog button', { hasText: 'OK' }).click();
const revokeResp = await revokeRespPromise;
out.revokeStatus = revokeResp && !revokeResp.error ? revokeResp.status() : revokeResp?.error;
await page.waitForTimeout(1500);

console.log('About to delete the now-revoked connection, with proper dialog confirm.');
await connRow.locator('[data-test="delete-btn"]').click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
const deleteRespPromise = page.waitForResponse(
  (r) => r.request().method() === 'DELETE',
  { timeout: 10000 },
).catch((e) => ({ error: String(e) }));
await page.locator('.q-dialog button', { hasText: 'OK' }).click();
const deleteResp = await deleteRespPromise;
out.deleteStatus = deleteResp && !deleteResp.error ? deleteResp.status() : deleteResp?.error;
await page.waitForTimeout(1500);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
out.connectionCountAfterDelete = await page.locator('[data-test^="connection-"]').count();

out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-broker-cleanup.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
