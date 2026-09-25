import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/types/auth-user.type';

/**
 * Gates the real, user-facing MT5 cloud-connector beta (BrokerConnectionsPage.vue's
 * "เชื่อมต่อด้วยรหัสผ่านนักลงทุน" option) — see docs/mt5-investor-password-spike.md,
 * "Beta graduation work". Two conditions, both required:
 *
 *  1. `MT5_CLOUD_SPIKE_ENABLED=true` — the same flag the dev spike page already uses.
 *     Kept as one flag rather than introducing a second, per the graduation brief.
 *  2. The caller's user id is in `MT5_CLOUD_CONNECTOR_BETA_USER_IDS` (comma-separated
 *     integers, e.g. `5` or `5,12`). **Empty/unset means nobody** — this is
 *     deliberately not defaulted to any specific account here; set it to your own user
 *     id to actually see the beta UI.
 *
 * 404s (not 403) either way, matching the dev spike's "doesn't exist" behavior for
 * anyone not explicitly let in — this stays undiscoverable by design.
 */
export function parseBetaUserIds(): Set<number> {
  const raw = process.env.MT5_CLOUD_CONNECTOR_BETA_USER_IDS ?? '';

  return new Set(
    raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

export function isBetaUser(userId: number): boolean {
  return process.env.MT5_CLOUD_SPIKE_ENABLED === 'true' && parseBetaUserIds().has(userId);
}

@Injectable()
export class Mt5CloudConnectorBetaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (!request.user || !isBetaUser(request.user.userId)) {
      throw new NotFoundException();
    }

    return true;
  }
}
