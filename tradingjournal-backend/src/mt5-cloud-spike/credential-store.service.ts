import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Deliberately NOT a Prisma model / DB table. This spike must stay additive and fully
 * isolated (constraint #4 in the spike brief) — a new migration would sit in the same
 * shared Supabase instance the rest of the app depends on, for a table that may be
 * thrown away entirely depending on what the spike concludes. A gitignored JSON file is
 * the lowest-risk place to prove "encrypt at rest" without touching shared schema.
 *
 * Not safe for concurrent writers (read-modify-write over the whole file) — fine for a
 * single developer poking a dev-only page, not something to carry into production.
 */
export interface Mt5CloudSpikeRecord {
  id: string;
  userId: number;
  login: string;
  server: string;
  /** output of CredentialVaultService.encrypt() — never plaintext, never logged */
  encryptedInvestorPassword: string;
  /** MetaApi account id, once creation succeeds. Null while a create call is in flight
   * or failed before MetaApi returned one. */
  metaApiAccountId: string | null;
  createdAt: string;
  /** filled in once getStatus() first observes CONNECTED — this is the number the spike
   * write-up reports for "time to come online" */
  connectedAt: string | null;
  /** Updated on every status/account/positions/deals/sync call — what the idle reaper
   * (see mt5-cloud-connector-idle-reaper.service.ts) compares against the idle-undeploy
   * threshold. Null until the first such call. */
  lastActivityAt: string | null;
  /** Best-effort local mirror of whether this record's MetaApi account is currently
   * deployed — source of truth is always MetaApi itself (this only exists so the idle
   * reaper doesn't have to call MetaApi for every record on every sweep). Null before
   * the first connect/redeploy. */
  deployState: 'DEPLOYED' | 'UNDEPLOYED' | null;
  /** Set when the current continuous deploy session began (connect() or redeploy()),
   * cleared back to null on undeploy(). Unlike lastActivityAt, this is never refreshed by
   * activity — it's what the idle reaper's hard session-length cap compares against, so a
   * tab left open polling status every 60s (which keeps lastActivityAt fresh forever)
   * can't keep a session deployed indefinitely. See deploy-idle.constants.ts. */
  deploySessionStartedAt: string | null;
  /** ISO timestamp of when the user checked the (currently DRAFT, pending legal
   * sign-off) PDPA consent checkbox for this connection — see
   * docs/mt5-investor-password-spike.md, "Beta graduation work". Null for records
   * created through the dev-only spike page, which has no consent UI. */
  consentAcceptedAt: string | null;
}

const STORE_PATH = path.join(process.cwd(), 'data', 'mt5-cloud-spike-store.json');

@Injectable()
export class CredentialStoreService {
  private async readAll(): Promise<Mt5CloudSpikeRecord[]> {
    try {
      const raw = await fs.readFile(STORE_PATH, 'utf8');
      return JSON.parse(raw) as Mt5CloudSpikeRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeAll(records: Mt5CloudSpikeRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(records, null, 2), 'utf8');
  }

  async listForUser(userId: number): Promise<Mt5CloudSpikeRecord[]> {
    return (await this.readAll()).filter((record) => record.userId === userId);
  }

  async get(id: string): Promise<Mt5CloudSpikeRecord | null> {
    return (await this.readAll()).find((record) => record.id === id) ?? null;
  }

  async create(
    data: Omit<
      Mt5CloudSpikeRecord,
      | 'id'
      | 'createdAt'
      | 'connectedAt'
      | 'lastActivityAt'
      | 'deployState'
      | 'deploySessionStartedAt'
      | 'consentAcceptedAt'
    >,
  ): Promise<Mt5CloudSpikeRecord> {
    const records = await this.readAll();
    const record: Mt5CloudSpikeRecord = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      connectedAt: null,
      lastActivityAt: null,
      deployState: null,
      deploySessionStartedAt: null,
      consentAcceptedAt: null,
    };

    records.push(record);
    await this.writeAll(records);

    return record;
  }

  /** All CLOUD records currently believed to be deployed, across every user — feeds the
   * idle reaper's sweep. Intentionally not scoped to one user; this is an internal
   * background job, not a user-facing read. */
  async listDeployed(): Promise<Mt5CloudSpikeRecord[]> {
    return (await this.readAll()).filter((record) => record.deployState === 'DEPLOYED');
  }

  async update(id: string, patch: Partial<Mt5CloudSpikeRecord>): Promise<Mt5CloudSpikeRecord> {
    const records = await this.readAll();
    const index = records.findIndex((record) => record.id === id);

    if (index === -1) {
      throw new Error(`mt5 cloud spike record ${id} not found`);
    }

    records[index] = { ...records[index], ...patch };
    await this.writeAll(records);

    return records[index];
  }

  async remove(id: string): Promise<void> {
    const records = await this.readAll();
    await this.writeAll(records.filter((record) => record.id !== id));
  }
}
