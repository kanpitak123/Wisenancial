// Shared helpers for the qa/ Playwright driver scripts (plain `playwright` lib, no test runner).
export const BASE = 'http://localhost:9000';
export const API_BASE = 'http://localhost:3000';

// quasar.config.ts sets vueRouterMode: 'hash' — every in-app route must be reached via
// BASE + '/#/<path>', NOT BASE + '/<path>' (that hits the '/' landing-page route instead
// and silently renders the wrong page with 0 matching inputs/selectors).
export function route(path) {
  return `${BASE}/#${path.startsWith('/') ? path : '/' + path}`;
}

export function newLogs() {
  return { console: [], pageerror: [], badResponses: [] };
}

export function attachLogging(page, logs) {
  page.on('console', (msg) => {
    logs.console.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    logs.pageerror.push(String(err && err.stack ? err.stack : err));
  });
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let body = '';
      try {
        body = (await res.text()).slice(0, 3000);
      } catch {
        body = '(could not read body)';
      }
      logs.badResponses.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
        body,
      });
    }
  });
}

export function formatLogs(logs) {
  const lines = [];
  if (logs.pageerror.length) {
    lines.push('pageerror:');
    for (const e of logs.pageerror) lines.push('  - ' + e.replace(/\n/g, '\n    '));
  }
  const warnErr = logs.console.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]'));
  if (warnErr.length) {
    lines.push('console error/warning:');
    for (const e of warnErr) lines.push('  - ' + e);
  }
  if (logs.badResponses.length) {
    lines.push('HTTP >=400:');
    for (const r of logs.badResponses)
      lines.push(`  - ${r.method} ${r.url} -> ${r.status}: ${r.body}`);
  }
  return lines.length ? lines.join('\n') : '(clean: no pageerror, no console error/warning, no 4xx/5xx)';
}

/**
 * Switch the workspace toggle in the header to Forex or Stock, if not already there.
 *
 * IMPORTANT: switching workspace kicks off an async chain (clearWorkspace -> setActiveType ->
 * initializeWorkspace -> portfolioStore.loadPortfolios(type) -> per-portfolio dashboard/etc
 * fetches) that is NOT done just because the click resolved or a fixed short timeout elapsed.
 * Navigating away too early races this chain and silently shows stale/wrong-mode data with NO
 * console error (observed empirically: Portfolio page fell back to raw cash balance instead of
 * the enriched investor dashboard value when navigated to <1s after clicking the switch).
 * Always wait for networkidle (or a specific expected response) after this, not just a timeout.
 */
export async function switchWorkspace(page, label) {
  const btn = page.locator('.workspace-option', { hasText: label });
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  const isActive = await btn.evaluate((el) => el.classList.contains('workspace-option--active'));
  if (!isActive) {
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}
