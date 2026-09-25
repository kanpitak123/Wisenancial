import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export type Mt5DeployTransition = 'deploy' | 'undeploy';

export interface Mt5DeployLogEntry {
  id: string;
  recordId: string;
  userId: number;
  transition: Mt5DeployTransition;
  /** 'connect' | 'manual-refresh' | 'auto-poll' | 'idle-timeout' | 'explicit-disconnect' —
   * kept as a plain string rather than a union so a future caller isn't blocked adding a
   * new reason without touching this file. */
  reason: string;
  metaApiAccountId: string | null;
  at: string;
}

const LOG_PATH = path.join(process.cwd(), 'data', 'mt5-cloud-connector-deploy-log.json');

/**
 * Append-only audit trail of every deploy/undeploy transition the on-demand deploy
 * lifecycle makes (see docs/mt5-investor-password-spike.md, "On-demand deploy
 * lifecycle") — this is how the beta user checks actual MetaApi deploy activity against
 * what the UI (and the idle reaper) did, since MetaApi's own billing is metered on
 * exactly this deployed/undeployed transition. Same gitignored-JSON-file pattern as
 * CredentialStoreService and for the same reason — no new migration on the shared DB
 * for a still-gated beta feature.
 */
@Injectable()
export class DeployLogService {
  private async readAll(): Promise<Mt5DeployLogEntry[]> {
    try {
      const raw = await fs.readFile(LOG_PATH, 'utf8');
      return JSON.parse(raw) as Mt5DeployLogEntry[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeAll(entries: Mt5DeployLogEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.writeFile(LOG_PATH, JSON.stringify(entries, null, 2), 'utf8');
  }

  async record(
    recordId: string,
    userId: number,
    transition: Mt5DeployTransition,
    reason: string,
    metaApiAccountId: string | null,
  ): Promise<void> {
    const entries = await this.readAll();

    entries.push({
      id: randomUUID(),
      recordId,
      userId,
      transition,
      reason,
      metaApiAccountId,
      at: new Date().toISOString(),
    });

    await this.writeAll(entries);
  }

  async listForUser(userId: number): Promise<Mt5DeployLogEntry[]> {
    return (await this.readAll()).filter((entry) => entry.userId === userId);
  }
}
