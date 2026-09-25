import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Feature-flag gate, off by default everywhere (constraint: this spike must never be
 * reachable unless someone deliberately turns it on). 404s rather than 403s so the
 * route reads as "doesn't exist" in any environment where MT5_CLOUD_SPIKE_ENABLED isn't
 * explicitly set to 'true' — including production, where it should never be set.
 */
@Injectable()
export class Mt5CloudSpikeEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.MT5_CLOUD_SPIKE_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    return true;
  }
}
