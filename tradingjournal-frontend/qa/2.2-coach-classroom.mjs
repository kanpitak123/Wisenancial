import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { route, newLogs, attachLogging, formatLogs } from './helpers.mjs';

async function checkCoach(accountLabel, authFile) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();
  const logs = newLogs();
  attachLogging(page, logs);
  await page.goto(route('/Coach'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const upgradeVisible = (await page.locator('[data-test="coach-upgrade"]').count()) > 0;
  const gridVisible = (await page.locator('.coach-grid').count()) > 0;
  const bodyLen = (await page.locator('body').innerText()).length;
  await page.screenshot({ path: `qa/screenshots/2.2-coach-${accountLabel}.png`, fullPage: true });
  const result = { accountLabel, upgradeVisible, gridVisible, bodyLen, logs: formatLogs(logs) };
  await browser.close();
  return result;
}

async function checkClassroom(authFile) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();
  await page.goto(route('/Classroom'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const bodyText = await page.locator('body').innerText();
  const stubCount = (bodyText.match(/coming soon/gi) || []).length;
  await page.screenshot({ path: 'qa/screenshots/2.2-classroom.png', fullPage: true });
  await browser.close();
  return { stubCount, sample: bodyText.slice(0, 400) };
}

const paidCoach = await checkCoach('paid', path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json'));
console.log('paid coach:', JSON.stringify(paidCoach, null, 2));
const freeCoach = await checkCoach('free', path.join(process.cwd(), 'qa', '.auth', 'qa-free.json'));
console.log('free coach:', JSON.stringify(freeCoach, null, 2));
const classroom = await checkClassroom(path.join(process.cwd(), 'qa', '.auth', 'qa-paid.json'));
console.log('classroom:', JSON.stringify(classroom, null, 2));

fs.writeFileSync(
  path.join(process.cwd(), 'qa', 'logs', '2.2-coach-classroom.json'),
  JSON.stringify({ paidCoach, freeCoach, classroom }, null, 2),
);
