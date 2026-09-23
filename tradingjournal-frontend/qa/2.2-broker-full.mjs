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
await page.locator('[data-test="broker-type-select"]').waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(1500);

console.log('About to create a real MT5 broker connection on qa@wisenancial.test (portfolio left unbound, same as the working flow already tested).');
await page.locator('[data-test="broker-type-select"]').click();
await page.locator('.q-menu .q-item:not(.disabled)').first().click();
await page.waitForTimeout(300);

const createRespPromise = page.waitForResponse(
  (r) => r.request().method() === 'POST' && r.url().includes('/brokers/connections'),
  { timeout: 15000 },
).catch((e) => ({ error: String(e) }));
await page.locator('[data-test="create-connection-btn"]').click();
const createResp = await createRespPromise;
out.createStatus = createResp && !createResp.error ? createResp.status() : createResp?.error;
await page.waitForTimeout(1500);

out.apiKeyBannerVisible = (await page.locator('[data-test="api-key-banner"]').count()) > 0;
out.apiKeyValue = out.apiKeyBannerVisible
  ? (await page.locator('[data-test="api-key-value"]').innerText()).slice(0, 12) + '...(masked)'
  : null;
await page.screenshot({ path: 'qa/screenshots/2.2-broker-apikey-shown.png' });

if (out.apiKeyBannerVisible) {
  await page.locator('[data-test="dismiss-api-key"]').click().catch(() => {});
  await page.waitForTimeout(500);
}
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
out.apiKeyBannerVisibleAfterReload = (await page.locator('[data-test="api-key-banner"]').count()) > 0;

const connRow = page.locator('[data-test^="connection-"]').first();
out.connectionRowVisible = (await connRow.count()) > 0;

if (out.connectionRowVisible) {
  console.log('About to revoke this connection (with dialog confirm).');
  await connRow.locator('[data-test="revoke-btn"]').click();
  await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
  const revokeRespPromise = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/revoke'), { timeout: 10000 }).catch((e) => ({ error: String(e) }));
  await page.locator('.q-dialog button', { hasText: 'OK' }).click();
  const revokeResp = await revokeRespPromise;
  out.revokeStatus = revokeResp && !revokeResp.error ? revokeResp.status() : revokeResp?.error;
  await page.waitForTimeout(1500);
  out.revokeBadgeShown = (await connRow.innerText()).includes('REVOKED') || (await connRow.innerText()).toLowerCase().includes('revoke');

  console.log('About to delete this (revoked) connection (with dialog confirm).');
  await connRow.locator('[data-test="delete-btn"]').click();
  await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
  const deleteRespPromise = page.waitForResponse((r) => r.request().method() === 'DELETE', { timeout: 10000 }).catch((e) => ({ error: String(e) }));
  await page.locator('.q-dialog button', { hasText: 'OK' }).click();
  const deleteResp = await deleteRespPromise;
  out.deleteStatus = deleteResp && !deleteResp.error ? deleteResp.status() : deleteResp?.error;
  await page.waitForTimeout(1500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  out.connectionCountAfterDelete = await page.locator('[data-test^="connection-"]').count();
}

out.logs = formatLogs(logs);
fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.2-broker-full.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
