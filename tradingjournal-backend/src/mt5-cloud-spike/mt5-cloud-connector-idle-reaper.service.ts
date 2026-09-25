import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CloudConnector } from './cloud-connector';
import { CredentialStoreService } from './credential-store.service';
import { getIdleUndeployMs, getMaxSessionMs } from './deploy-idle.constants';

/**
 * Background sweep that enforces the on-demand deploy lifecycle's cost-control half.
 * Part 1's session-scoped RPC connection cache only closes a local socket on idle —
 * this closes the thing MetaApi's hourly "deployed account" billing is actually metered
 * against. Runs every 60s (cheap: for a single beta user this is at most a couple of
 * JSON-file reads), checks every CLOUD record the local store believes is currently
 * deployed, and undeploys any that trip either of two independent thresholds (see
 * deploy-idle.constants.ts):
 *
 *  - idle-timeout: no status/account/positions/deals/sync call for a while. Skipped
 *    (never checked, not just "always false") for a record with no lastActivityAt yet.
 *  - max-session-timeout: deployed longer than the hard cap, *regardless* of activity.
 *    Added after a live-test finding: the dev page polls getStatus() every 60s as a
 *    keep-alive while its tab is open, and that counts as activity — so a tab left open
 *    for hours keeps lastActivityAt fresh forever and idle-timeout alone never fires.
 *
 * See docs/mt5-investor-password-spike.md, "On-demand deploy lifecycle".
 */
@Injectable()
export class Mt5CloudConnectorIdleReaperService {
  private readonly logger = new Logger(Mt5CloudConnectorIdleReaperService.name);

  constructor(
    private readonly store: CredentialStoreService,
    private readonly cloudConnector: CloudConnector,
  ) {}

  @Interval(60_000)
  async sweep(): Promise<void> {
    const idleMs = getIdleUndeployMs();
    const maxSessionMs = getMaxSessionMs();
    const now = Date.now();
    const deployed = await this.store.listDeployed();

    for (const record of deployed) {
      if (record.lastActivityAt) {
        const idleForMs = now - new Date(record.lastActivityAt).getTime();

        if (idleForMs >= idleMs) {
          this.logger.log(
            `Idle-undeploying spike record ${record.id} after ${idleForMs}ms idle (threshold ${idleMs}ms)`,
          );

          await this.cloudConnector.undeploy(record.id, record.userId, 'idle-timeout').catch((error: unknown) => {
            this.logger.warn(
              `Idle-timeout undeploy failed for spike record ${record.id}: ${(error as Error).message}`,
            );
          });
          continue;
        }
      }

      if (!record.deploySessionStartedAt) {
        continue;
      }

      const sessionAgeMs = now - new Date(record.deploySessionStartedAt).getTime();
      if (sessionAgeMs < maxSessionMs) {
        continue;
      }

      this.logger.log(
        `Max-session-undeploying spike record ${record.id} after ${sessionAgeMs}ms deployed ` +
          `(cap ${maxSessionMs}ms) regardless of activity`,
      );

      await this.cloudConnector.undeploy(record.id, record.userId, 'max-session-timeout').catch((error: unknown) => {
        this.logger.warn(
          `Max-session undeploy failed for spike record ${record.id}: ${(error as Error).message}`,
        );
      });
    }
  }
}
