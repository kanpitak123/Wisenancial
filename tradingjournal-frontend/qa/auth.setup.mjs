// Logs in both QA accounts once via the real UI and saves storageState so the other
// qa/*.mjs scripts can reuse the session instead of logging in every time.
// See qa/README.md — requires QA_PASSWORD env var, never hardcode it here.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route } from './helpers.mjs';

const authDir = path.join(process.cwd(), 'qa', '.auth');
fs.mkdirSync(authDir, { recursive: true });

const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) {
  throw new Error('Set QA_PASSWORD env var before running (e.g. QA_PASSWORD=... node qa/auth.setup.mjs)');
}

async function loginAndSave(email, password, outFile) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(route('/Login'));
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/Dashboard', { timeout: 15000 });
  await context.storageState({ path: outFile });
  await browser.close();
  console.log('saved storage state for', email, '->', outFile);
}

await loginAndSave('qa@wisenancial.test', QA_PASSWORD, path.join(authDir, 'qa-paid.json'));
await loginAndSave('qafree@wisenancial.test', QA_PASSWORD, path.join(authDir, 'qa-free.json'));
