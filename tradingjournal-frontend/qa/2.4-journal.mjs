// 2.4 Journal: add trade (QSelect race check), double-submit, edit, delete, CSV import (good+bad).
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
await page.goto(route('/Journal'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// ---------- Add trade + QSelect race check ----------
await page.getByRole('button', { name: 'New Trade' }).click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });

// Pair select (no use-input -> click to open, click option)
await selectQOption(page, 'Pair', 'EUR/USD');

// Race check: select Strategy, then WITHOUT Escape immediately click+type into PnL input
await selectQOption(page, 'Strategy', 'breakout');
// no waitForTimeout, no Escape - go straight to typing in a nearby field
const pnlInput = page.locator('.text-caption', { hasText: 'Amount / PnL' }).first().locator('xpath=following-sibling::*[1] //input');
await pnlInput.click();
await pnlInput.fill('123.45');
const pnlValueAfter = await pnlInput.inputValue();
out.qselectRaceCheck = {
  pnlInputValue: pnlValueAfter,
  landedCorrectly: pnlValueAfter === '123.45',
};

// finish filling remaining selects
await selectQOption(page, 'Trend', 'uptrend');
await selectQOption(page, 'Emotion', 'confident');
await selectQOption(page, 'Entry Reason', 'Support');

await page.locator('.text-caption', { hasText: 'Lot Size' }).first().locator('xpath=following-sibling::*[1]//input').fill('0.5');
await page.locator('.text-caption', { hasText: 'Open Price' }).first().locator('xpath=following-sibling::*[1]//input').fill('1.0850');
await page.locator('.text-caption', { hasText: 'Close Price' }).first().locator('xpath=following-sibling::*[1]//input').fill('1.0900');

const respPromise1 = page.waitForResponse((r) => r.url().includes('/trades') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
const saveBtn = page.getByRole('button', { name: 'Save Trade' });
await saveBtn.click();
const resp1 = await respPromise1;
out.addTradeStatus = resp1 ? resp1.status() : 'NO_RESPONSE_CAUGHT';
try { out.addTradeBody = resp1 ? await resp1.json() : null; } catch { out.addTradeBody = resp1 ? await resp1.text() : null; }
await page.waitForTimeout(1000);

// ---------- Double-submit check ----------
await page.getByRole('button', { name: 'New Trade' }).click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
await selectQOption(page, 'Pair', 'GBP/USD');
await page.locator('.text-caption', { hasText: 'Amount / PnL' }).first().locator('xpath=following-sibling::*[1]//input').fill('77');

const doubleSubmitResponses = [];
page.on('response', (r) => {
  if (r.url().includes('/trades') && r.request().method() === 'POST') doubleSubmitResponses.push(r.status());
});
const saveBtn2 = page.getByRole('button', { name: 'Save Trade' });
// dispatchEvent bypasses Playwright's actionability/stability wait, so two rapid clicks can
// actually land before the dialog closes/detaches - a real click() retries and hangs instead.
await Promise.all([
  saveBtn2.dispatchEvent('click').catch((e) => out.doubleSubmitClick1Error = String(e)),
  saveBtn2.dispatchEvent('click').catch((e) => out.doubleSubmitClick2Error = String(e)),
]);
await page.waitForTimeout(2000);
out.doubleSubmitResponses = doubleSubmitResponses;

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// count GBP/USD trades created (double-submit artifact check)
const gbpRows = await page.locator('[data-test^="trade-row-"]', { hasText: 'GBP/USD' }).count();
out.gbpUsdRowCountAfterDoubleSubmit = gbpRows;

await page.screenshot({ path: 'qa/screenshots/2.4-journal-list-light.png', fullPage: true });

// ---------- Edit trade ----------
const firstRow = page.locator('[data-test^="trade-row-"]').first();
const firstRowTestId = await firstRow.getAttribute('data-test');
out.editTargetRow = firstRowTestId;
await firstRow.click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
const editNoteInput = page.locator('[data-test="edit-note-input"]');
await editNoteInput.fill('QA edit note ' + Date.now());
const respPromise2 = page.waitForResponse((r) => /\/trades\/\d+/.test(r.url()) && ['PUT', 'PATCH'].includes(r.request().method()), { timeout: 15000 }).catch(() => null);
await page.locator('[data-test="save-edit-btn"]').click();
const resp2 = await respPromise2;
out.editTradeStatus = resp2 ? resp2.status() : 'NO_RESPONSE_CAUGHT';
await page.waitForTimeout(1000);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await firstRow.click();
await page.locator('.q-dialog').waitFor({ state: 'visible', timeout: 5000 });
out.editNotePersistedAfterReload = await page.locator('[data-test="edit-note-input"]').inputValue();
await page.locator('button:has-text("Cancel")').first().click();
await page.waitForTimeout(500);

// ---------- Delete trade ----------
const lastRow = page.locator('[data-test^="trade-row-"]').last();
const lastRowTestId = await lastRow.getAttribute('data-test');
out.deleteTargetRow = lastRowTestId;
const rowCountBeforeDelete = await page.locator('[data-test^="trade-row-"]').count();
await lastRow.locator('.q-icon[name="delete_outline"]').click().catch(async () => {
  await lastRow.locator('button', { has: page.locator('.q-icon') }).last().click();
});
await page.locator('.q-dialog', { hasText: 'Delete Trade' }).waitFor({ state: 'visible', timeout: 5000 });
const respPromise3 = page.waitForResponse((r) => /\/trades\/\d+/.test(r.url()) && r.request().method() === 'DELETE', { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: 'Delete' }).click();
const resp3 = await respPromise3;
out.deleteTradeStatus = resp3 ? resp3.status() : 'NO_RESPONSE_CAUGHT';
await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const rowCountAfterDelete = await page.locator('[data-test^="trade-row-"]').count();
out.rowCountBeforeDelete = rowCountBeforeDelete;
out.rowCountAfterDelete = rowCountAfterDelete;

// ---------- Dark mode screenshot ----------
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/screenshots/2.4-journal-list-dark.png', fullPage: true });
await page.locator('.theme-toggle-btn').click();
await page.waitForTimeout(500);

// ---------- CSV import: good file ----------
await page.getByRole('button', { name: 'Import from CSV' }).click();
await page.locator('.q-dialog', { hasText: 'Import from CSV' }).waitFor({ state: 'visible', timeout: 5000 });
await page.locator('input[placeholder="Enter account number"]').fill('QA-IMPORT-001');
await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), 'qa', 'fixtures', 'good-trades.csv'));
await page.waitForTimeout(500);
const respPromise4 = page.waitForResponse((r) => r.url().includes('/trades/import') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
await page.locator('.q-dialog', { hasText: 'Import from CSV' }).getByRole('button', { name: 'Import', exact: true }).click();
const resp4 = await respPromise4;
out.csvGoodImportStatus = resp4 ? resp4.status() : 'NO_RESPONSE_CAUGHT';
try { out.csvGoodImportBody = resp4 ? await resp4.json() : null; } catch { out.csvGoodImportBody = resp4 ? await resp4.text() : null; }
await page.waitForTimeout(1500);
await page.screenshot({ path: 'qa/screenshots/2.4-journal-csv-good.png', fullPage: true });

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
out.eurUsdRowCountAfterGoodImport = await page.locator('[data-test^="trade-row-"]', { hasText: 'EURUSD' }).count();
out.gbpUsdRowCountAfterGoodImport = await page.locator('[data-test^="trade-row-"]', { hasText: 'GBPUSD' }).count();

// ---------- CSV import: bad file ----------
await page.getByRole('button', { name: 'Import from CSV' }).click();
await page.locator('.q-dialog', { hasText: 'Import from CSV' }).waitFor({ state: 'visible', timeout: 5000 });
await page.locator('input[placeholder="Enter account number"]').fill('QA-IMPORT-002');
await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), 'qa', 'fixtures', 'bad-trades.csv'));
await page.waitForTimeout(500);
const respPromise5 = page.waitForResponse((r) => r.url().includes('/trades/import') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
await page.locator('.q-dialog', { hasText: 'Import from CSV' }).getByRole('button', { name: 'Import', exact: true }).click();
const resp5 = await respPromise5;
out.csvBadImportStatus = resp5 ? resp5.status() : 'NO_RESPONSE_CAUGHT';
try { out.csvBadImportBody = resp5 ? await resp5.json() : null; } catch { out.csvBadImportBody = resp5 ? await resp5.text() : null; }
await page.waitForTimeout(1500);
out.csvBadDialogStillOpen = await page.locator('.q-dialog', { hasText: 'Import from CSV' }).isVisible().catch(() => false);
await page.screenshot({ path: 'qa/screenshots/2.4-journal-csv-bad.png', fullPage: true });

} catch (e) {
  out.scriptError = String(e);
} finally {
  out.logs = formatLogs(logs);
  fs.writeFileSync(path.join(process.cwd(), 'qa', 'logs', '2.4-journal.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
