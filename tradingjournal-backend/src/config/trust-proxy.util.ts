/**
 * Express "trust proxy" setting, from TRUST_PROXY.
 *
 * Behind a load balancer (Render, Fly, ...) the socket peer is the proxy, so without this
 * `req.ip` is the proxy's address for every request and the IP-based rate limits treat all
 * users as one client. With it, Express takes the client address from X-Forwarded-For.
 *
 * Values:
 *   unset       -> 1 in production (one proxy hop), false otherwise (local dev has no proxy)
 *   false / 0   -> off
 *   a number N  -> trust N proxy hops (the number of proxies in front of the app)
 *   true        -> trust every hop; the client can then spoof its IP with its own
 *                  X-Forwarded-For header, so only use it if the app is unreachable
 *                  except through your proxy
 *   anything else -> passed to Express as a subnet list, e.g. "loopback, 10.0.0.0/8"
 */
export type TrustProxySetting = boolean | number | string;

export function resolveTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): TrustProxySetting {
  const raw = env.TRUST_PROXY?.trim();

  if (raw === undefined || raw === '') {
    return env.NODE_ENV === 'production' ? 1 : false;
  }

  const lower = raw.toLowerCase();
  if (lower === 'false') return false;
  if (lower === 'true') return true;

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    return hops === 0 ? false : hops;
  }

  return raw;
}
