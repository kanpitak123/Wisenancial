/**
 * How long a CLOUD session can go without activity (a status/account/positions/deals/
 * sync call) before the idle reaper (mt5-cloud-connector-idle-reaper.service.ts)
 * undeploys it on MetaApi to stop hourly billing. This is a first guess, not a measured
 * number — see docs/mt5-investor-password-spike.md, "On-demand deploy lifecycle".
 *
 * TUNE ME: override with MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS (milliseconds) if 5
 * minutes turns out too short (redeploying too often, eating the ~6s+ redeploy latency
 * repeatedly) or too long (paying for deployed-but-idle time unnecessarily).
 */
export const DEFAULT_IDLE_UNDEPLOY_MS = 5 * 60 * 1000;

export function getIdleUndeployMs(): number {
  const raw = process.env.MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS;
  const parsed = raw ? Number(raw) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_UNDEPLOY_MS;
}

/**
 * Hard cap on how long a single deploy session may stay deployed, independent of
 * activity — enforced by the idle reaper alongside (not instead of) the idle-timeout
 * check above. Found necessary from a live-test bug report: the dev page polls
 * getStatus() every 60s as a keep-alive while a tab is open, and that poll counts as
 * activity (see cloud-connector.ts's touchLastActivity in getStatus()) — so
 * lastActivityAt never goes stale for a tab left open, and idle-timeout alone can never
 * fire no matter how many hours pass.
 *
 * Defaults to 6 hours specifically because that's MetaApi's documented minimum billing
 * increment per deploy (per MetaApi's FAQ) — deploying is billed in whole 6-hour blocks,
 * not per-minute. A cap at exactly that minimum means an unattended session gets
 * undeployed before it can roll into a second billed block, so this can't silently double
 * the cost of a forgotten tab. (The idle-timeout check above still matters for the common
 * case — most sessions should stop billing well before 6 hours — this cap only bounds the
 * worst case where idle-timeout never triggers.)
 *
 * TUNE ME: override with MT5_CLOUD_CONNECTOR_MAX_SESSION_MS (milliseconds) if 6 hours
 * turns out wrong for how this is actually used.
 */
export const DEFAULT_MAX_SESSION_MS = 6 * 60 * 60 * 1000;

export function getMaxSessionMs(): number {
  const raw = process.env.MT5_CLOUD_CONNECTOR_MAX_SESSION_MS;
  const parsed = raw ? Number(raw) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SESSION_MS;
}
