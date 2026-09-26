/**
 * Build-time checks for a production bundle.
 *
 * VITE_* variables are baked into the JavaScript at build time. If VITE_API_URL is forgotten
 * the app used to fall back to http://localhost:3000, so the site built and deployed fine and
 * then every request went to the visitor's own machine. `quasar build` (production) now
 * refuses to produce such a bundle. Imported by quasar.config.ts, so it must stay
 * dependency-free (no Vite/Quasar/app imports).
 */

export interface ProductionEnvReport {
  errors: string[];
  warnings: string[];
}

const isLocalhost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

export function checkProductionEnv(env: Record<string, string | undefined>): ProductionEnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const apiUrl = env.VITE_API_URL?.trim() ?? '';

  if (apiUrl === '') {
    errors.push(
      'VITE_API_URL is not set. A production build without it would call http://localhost:3000. ' +
        'Set it to the public API address, e.g. VITE_API_URL=https://api.example.com',
    );
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(apiUrl);
    } catch {
      errors.push('VITE_API_URL is not a valid URL');
    }

    if (parsed) {
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('VITE_API_URL must start with http:// or https://');
      } else if (isLocalhost(parsed.hostname)) {
        errors.push('VITE_API_URL points at localhost: a production build must use the public API address');
      } else if (parsed.protocol !== 'https:') {
        errors.push('VITE_API_URL must be https:// in production (browsers block mixed content)');
      }
    }
  }

  if (env.VITE_MOCK_MODE?.trim().toLowerCase() === 'true') {
    warnings.push('VITE_MOCK_MODE=true: this build serves fake data by default');
  }
  if (env.VITE_ENABLE_MOCK_MODE?.trim().toLowerCase() === 'true') {
    warnings.push('VITE_ENABLE_MOCK_MODE=true: users can switch this build to fake data');
  }

  return { errors, warnings };
}

/** Throws (failing the build) when the production environment is unusable; prints warnings. */
export function assertProductionBuildEnv(env: Record<string, string | undefined>): void {
  const { errors, warnings } = checkProductionEnv(env);

  for (const warning of warnings) {
    console.warn(`[build] warning: ${warning}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Production build refused (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n` +
        errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
}
