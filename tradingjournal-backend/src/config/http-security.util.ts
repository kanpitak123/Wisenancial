import type { HelmetOptions } from 'helmet';

/**
 * Swagger UI (/api) is on in development and off in production unless SWAGGER_ENABLED=true.
 * SWAGGER_ENABLED=false turns it off in development too.
 *
 * It is unauthenticated and lists every route and DTO, so it is not something to leave
 * open on a public API by accident.
 */
export function isSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.SWAGGER_ENABLED?.trim().toLowerCase();

  if (flag === 'true') return true;
  if (flag === 'false') return false;

  return env.NODE_ENV !== 'production';
}

/**
 * helmet options for this API.
 *
 * - crossOriginResourcePolicy "cross-origin": /uploads images are loaded by the web app from
 *   another origin; helmet's default ("same-origin") would make the browser block them.
 * - Content-Security-Policy is off only while Swagger UI is on (its page needs inline
 *   scripts). A JSON API has no page to protect, so the default CSP costs nothing in
 *   production, where Swagger is off.
 */
export function buildHelmetOptions(swaggerEnabled: boolean): HelmetOptions {
  return {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: swaggerEnabled ? false : undefined,
  };
}
