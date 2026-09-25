import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import MetaApi from 'metaapi.cloud-sdk';
import type MetatraderAccount from 'metaapi.cloud-sdk/dist/metaApi/metatraderAccount';
import type RpcMetaApiConnectionInstance from 'metaapi.cloud-sdk/dist/metaApi/rpcMetaApiConnectionInstance';
import { CredentialStoreService, Mt5CloudSpikeRecord } from './credential-store.service';
import { CredentialVaultService } from './credential-vault.service';
import { DeployLogService } from './mt5-cloud-connector-deploy-log.service';
import {
  Mt5AccountSnapshot,
  Mt5ConnectionState,
  Mt5ConnectionStatus,
  Mt5Connector,
  Mt5ConnectorError,
  Mt5ConnectorHandle,
  Mt5ConnectRequest,
  Mt5DealSnapshot,
  Mt5PositionSnapshot,
} from './mt5-connector.interface';

type CachedRpcConnection = {
  connection: RpcMetaApiConnectionInstance;
  lastUsedAt: number;
};

/**
 * Wraps MetaApi.cloud (https://metaapi.cloud) — the managed/investor-password connector
 * evaluated in docs/mt5-investor-password-spike.md. Field/method names here were
 * verified against the installed metaapi.cloud-sdk@29.3.3 .d.ts files (not just doc
 * excerpts, which paraphrase and can be stale) — see that spike doc for the research
 * trail and what's still unverified against a *live* account.
 *
 * Design choices worth flagging for anyone extending this:
 *  - Uses `type: 'cloud-g2'` and omits provisioningProfileId/keywords entirely.
 *    Older MetaApi docs describe a `cloud-g1` flow requiring a provisioning profile with
 *    an uploaded servers.dat file per broker — g2 does not require this (see spike doc).
 *  - Always passes `reliability: 'regular'` on createAccount() — the SDK defaults to
 *    'high', which requires a topped-up MetaApi.cloud account and costs ~3x. Found live:
 *    an untopped-up account got "please top up your account" from MetaApi's provisioning
 *    API until this was set explicitly (see docs/mt5-investor-password-spike.md).
 *  - **RPC connections are cached per session (per credential-store record id), not
 *    reopened per call.** An earlier version opened a fresh RPC connection for every
 *    getAccountSnapshot/getPositions/getDealHistory call; a live test (see spike doc,
 *    "Live test #2") found that the second call in the same session could time out
 *    after ~107s AND leave the MetaApi-side account UNDEPLOYED with no explicit undeploy
 *    ever issued by this app — real evidence that repeatedly opening/closing RPC
 *    sockets against the same account in quick succession is not just slow but actively
 *    destabilizing. `getOrCreateConnection()` now opens one connection the first time a
 *    session needs it and reuses it for every subsequent read, closing it only on
 *    `disconnect()`, an idle timeout (`IDLE_CONNECTION_TTL_MS`), or module shutdown
 *    (`onModuleDestroy`). A read failure still drops the cached connection (see
 *    `withRpcConnection`'s catch) so the *next* call re-establishes cleanly instead of
 *    retrying against a socket MetaApi may have already torn down.
 */
@Injectable()
export class CloudConnector implements Mt5Connector, OnModuleDestroy {
  readonly kind = 'CLOUD' as const;

  private readonly logger = new Logger(CloudConnector.name);
  private client: MetaApi | null = null;

  /** One cached RPC connection per active session (keyed by credential-store record
   * id), reused across getAccountSnapshot/getPositions/getDealHistory. See class doc
   * comment above for why this replaced the earlier open-per-call design. */
  private readonly connections = new Map<string, CachedRpcConnection>();
  private readonly IDLE_CONNECTION_TTL_MS = 15 * 60 * 1000;
  private readonly reapInterval: NodeJS.Timeout;

  constructor(
    private readonly store: CredentialStoreService,
    private readonly vault: CredentialVaultService,
    private readonly deployLog: DeployLogService,
  ) {
    // Sessions that never call disconnect() (browser tab closed, page abandoned) would
    // otherwise leak an open MetaApi socket forever — reap anything idle past the TTL.
    this.reapInterval = setInterval(() => this.reapIdleConnections(), 60_000);
    this.reapInterval.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.reapInterval);
    const refs = [...this.connections.keys()];
    await Promise.all(refs.map((ref) => this.dropConnection(ref)));
  }

  private reapIdleConnections(): void {
    const now = Date.now();

    for (const [ref, cached] of this.connections) {
      if (now - cached.lastUsedAt > this.IDLE_CONNECTION_TTL_MS) {
        this.logger.log(
          `Reaping idle RPC connection for spike record ${ref} after ${this.IDLE_CONNECTION_TTL_MS}ms idle`,
        );
        void this.dropConnection(ref);
      }
    }
  }

  private getClient(): MetaApi {
    if (this.client) {
      return this.client;
    }

    const token = process.env.MT5_CLOUD_SPIKE_METAAPI_TOKEN;

    if (!token) {
      throw new Mt5ConnectorError(
        'MT5_CLOUD_SPIKE_METAAPI_TOKEN ยังไม่ถูกตั้งค่า — ต้องสมัคร MetaApi.cloud เองแล้วใส่ API token ' +
          '(ดู docs/mt5-investor-password-spike.md)',
        'NOT_CONFIGURED',
      );
    }

    this.client = new MetaApi(token);
    return this.client;
  }

  async connect(request: Mt5ConnectRequest, userId: number): Promise<Mt5ConnectorHandle> {
    if (request.kind !== 'CLOUD') {
      throw new Mt5ConnectorError('CloudConnector ได้รับ request ที่ไม่ใช่ kind CLOUD', 'WRONG_CONNECTOR');
    }

    const record = await this.store.create({
      userId,
      login: request.login,
      server: request.server,
      encryptedInvestorPassword: this.vault.encrypt(request.investorPassword),
      metaApiAccountId: null,
    });

    try {
      const api = this.getClient();
      const account = await this.wrapSdkCall(() =>
        api.metatraderAccountApi.createAccount({
          name: `wisenancial-spike-${record.id}`,
          type: 'cloud-g2',
          login: request.login,
          password: request.investorPassword,
          server: request.server,
          platform: 'mt5',
          magic: 0,
          // Explicit, not left to the SDK default ('high'): 'high' reliability requires a
          // MetaApi.cloud account that's been topped up (billed ~3x 'regular') and fails
          // with "please top up your account" otherwise (see mapSdkError's BILLING_REQUIRED
          // case below, and docs/mt5-investor-password-spike.md's live-test note). This app
          // has no product reason to pay for 'high' — pick the cheaper tier on purpose.
          reliability: 'regular',
        }),
      );

      await this.store.update(record.id, {
        metaApiAccountId: account.id,
        deployState: 'DEPLOYED',
        deploySessionStartedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
      await this.deployLog.record(record.id, userId, 'deploy', 'connect', account.id).catch(() => undefined);

      // Fire-and-forget: deployment can take real wall-clock time (see spike doc's
      // measured provisioning latency) — the HTTP request must not block on it.
      // getStatus() polling is how the dev page observes DEPLOYING -> CONNECTED.
      account.deploy().catch((error: unknown) => {
        this.logger.warn(`deploy() failed for spike record ${record.id}: ${(error as Error).message}`);
      });

      return { kind: 'CLOUD', ref: record.id };
    } catch (error) {
      // Don't leave an encrypted credential with no way to ever succeed sitting around —
      // best-effort cleanup, swallow secondary failure so the original error still surfaces.
      await this.store.remove(record.id).catch(() => undefined);
      throw error;
    }
  }

  async disconnect(ref: string, userId: number): Promise<void> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    // Close the cached session connection first — leaving it open after the MetaApi
    // account itself is removed below would just error on next use, but closing it
    // explicitly (rather than letting the idle reaper find it later) is the deterministic
    // behavior a disconnect button should have.
    await this.dropConnection(record.id);

    if (record.metaApiAccountId) {
      try {
        const api = this.getClient();
        const account = await api.metatraderAccountApi.getAccount(record.metaApiAccountId);
        await account.remove();
        await this.deployLog
          .record(record.id, userId, 'undeploy', 'explicit-disconnect', record.metaApiAccountId)
          .catch(() => undefined);
      } catch (error) {
        // Account may already be gone (undeployed/removed out of band) — revocation of
        // our own stored secret below is the part that actually matters for constraint
        // #3 (nothing plaintext left at rest), so this is logged, not rethrown.
        this.logger.warn(`MetaApi account removal failed for spike record ${ref}: ${(error as Error).message}`);
      }
    }

    await this.store.remove(record.id);
  }

  /**
   * On-demand redeploy — used when a session comes back after the idle reaper (or
   * MetaApi itself) undeployed it. Fire-and-forget like connect()'s initial deploy()
   * call, for the same reason: deployment can take real wall-clock time and the HTTP
   * request must not block on it. Callers poll getStatus() the same way they do after
   * connect(). See docs/mt5-investor-password-spike.md, "On-demand deploy lifecycle".
   */
  async redeploy(ref: string, userId: number, reason: string): Promise<void> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    if (!record.metaApiAccountId) {
      throw new Mt5ConnectorError('บัญชียังไม่มี MetaApi account id — ยัง provision ไม่เสร็จ', 'NOT_READY');
    }

    const api = this.getClient();
    const account = await this.wrapSdkCall(() => api.metatraderAccountApi.getAccount(record.metaApiAccountId!));

    await this.store.update(record.id, {
      deployState: 'DEPLOYED',
      deploySessionStartedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    await this.deployLog.record(record.id, userId, 'deploy', reason, record.metaApiAccountId).catch(() => undefined);

    account.deploy().catch((error: unknown) => {
      this.logger.warn(`redeploy() failed for spike record ${record.id}: ${(error as Error).message}`);
    });
  }

  /**
   * Undeploys (but does NOT remove/revoke) the MetaApi account — stops the hourly
   * "deployed account" billing while keeping the credential and account registration
   * intact for a future on-demand redeploy(). Used only by the idle reaper
   * (mt5-cloud-connector-idle-reaper.service.ts); disconnect() above uses account.remove()
   * instead, which is a permanent revoke, not a pause. Returns false (rather than
   * throwing) on MetaApi failure so the reaper can retry on its next sweep instead of
   * marking local state UNDEPLOYED for an account that may still be running (and
   * billing) on MetaApi's side.
   */
  async undeploy(ref: string, userId: number, reason: string): Promise<boolean> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    await this.dropConnection(record.id);

    if (!record.metaApiAccountId) {
      await this.store
        .update(record.id, { deployState: 'UNDEPLOYED', deploySessionStartedAt: null })
        .catch(() => undefined);
      return true;
    }

    try {
      const api = this.getClient();
      const account = await api.metatraderAccountApi.getAccount(record.metaApiAccountId);
      await account.undeploy();
    } catch (error) {
      this.logger.warn(`undeploy() failed for spike record ${ref} (reason: ${reason}): ${(error as Error).message}`);
      return false;
    }

    await this.store
      .update(record.id, { deployState: 'UNDEPLOYED', deploySessionStartedAt: null })
      .catch(() => undefined);
    await this.deployLog.record(record.id, userId, 'undeploy', reason, record.metaApiAccountId).catch(() => undefined);
    return true;
  }

  async getAccountSnapshot(ref: string, userId: number): Promise<Mt5AccountSnapshot> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    return this.withRpcConnection(record, async (connection) => {
      const info = await connection.getAccountInformation();

      return {
        broker: info.broker,
        currency: info.currency,
        balance: info.balance,
        equity: info.equity,
        margin: info.margin,
        freeMargin: info.freeMargin,
        marginLevel: info.marginLevel,
        leverage: info.leverage,
        credit: info.credit,
      };
    });
  }

  async getPositions(ref: string, userId: number): Promise<Mt5PositionSnapshot[]> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    return this.withRpcConnection(record, async (connection) => {
      const positions = await connection.getPositions();

      return positions.map((position) => ({
        ticket: String(position.id),
        symbol: position.symbol,
        direction: position.type === 'POSITION_TYPE_SELL' ? ('SELL' as const) : ('BUY' as const),
        volume: position.volume,
        openPrice: position.openPrice,
        currentPrice: position.currentPrice,
        profit: position.profit,
        openedAt: position.time,
      }));
    });
  }

  async getDealHistory(ref: string, userId: number, sinceDays = 30): Promise<Mt5DealSnapshot[]> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    return this.withRpcConnection(record, async (connection) => {
      // Raw deal stream — includes balance/credit ops alongside actual trade deals,
      // not filtered to DEAL_ENTRY_OUT only. Fine for a spike page; a production reader
      // would filter by entryType/type before treating rows as "closed trades".
      const { deals } = await connection.getDealsByTimeRange(since, new Date());

      return deals.map((deal) => ({
        ticket: String(deal.id),
        symbol: deal.symbol ?? null,
        volume: deal.volume ?? null,
        price: deal.price ?? null,
        profit: deal.profit,
        commission: deal.commission ?? null,
        swap: deal.swap ?? null,
        executedAt: deal.time,
      }));
    });
  }

  async getStatus(ref: string, userId: number): Promise<Mt5ConnectionStatus> {
    const record = await this.findOwnedRecordOrThrow(ref, userId);

    if (!record.metaApiAccountId) {
      return { state: 'ERROR', message: 'ยังไม่ได้รับ MetaApi account id (createAccount ล้มเหลว)', checkedAt: new Date() };
    }

    try {
      const api = this.getClient();
      const account = await this.wrapSdkCall(() => api.metatraderAccountApi.getAccount(record.metaApiAccountId!));

      const state = this.mapAccountState(account);

      if (state === 'CONNECTED' && !record.connectedAt) {
        await this.store.update(record.id, { connectedAt: new Date().toISOString() });
      }

      // Status polling is real engagement (the caller is actively waiting for/watching
      // this connection) — counts toward the idle-undeploy clock same as a data read.
      await this.touchLastActivity(record.id);

      return {
        state,
        message: `state=${account.state} connectionStatus=${account.connectionStatus}`,
        checkedAt: new Date(),
      };
    } catch (error) {
      return { state: 'ERROR', message: (error as Error).message, checkedAt: new Date() };
    }
  }

  private mapAccountState(account: MetatraderAccount): Mt5ConnectionState {
    if (account.state === 'DEPLOY_FAILED' || account.state === 'UNDEPLOY_FAILED' || account.state === 'DELETE_FAILED') {
      return 'ERROR';
    }

    if (account.state === 'DEPLOYED' && account.connectionStatus === 'CONNECTED') {
      return 'CONNECTED';
    }

    if (account.state === 'DEPLOYED') {
      // deployed but terminal not yet talking to the broker (DISCONNECTED /
      // DISCONNECTED_FROM_BROKER) — still mid-provisioning from the user's perspective
      return 'CONNECTING';
    }

    if (account.state === 'CREATED' || account.state === 'DEPLOYING') {
      return 'CONNECTING';
    }

    return 'DISCONNECTED';
  }

  private async withRpcConnection<T>(
    record: Mt5CloudSpikeRecord,
    read: (connection: RpcMetaApiConnectionInstance) => Promise<T>,
  ): Promise<T> {
    if (!record.metaApiAccountId) {
      throw new Mt5ConnectorError('บัญชียังไม่มี MetaApi account id — ยัง provision ไม่เสร็จ', 'NOT_READY');
    }

    const connection = await this.getOrCreateConnection(record);

    try {
      const result = await read(connection);
      this.touchConnection(record.id);
      await this.touchLastActivity(record.id);
      return result;
    } catch (error) {
      // Drop the cached connection on any read failure rather than keep it around —
      // this is exactly the scenario the spike found live: a connection that just timed
      // out may correspond to an account MetaApi has already undeployed out of band, so
      // the *next* call must re-establish from scratch, not retry against a socket that
      // looks open locally but is no longer trustworthy.
      await this.dropConnection(record.id);
      throw this.mapSdkError(error);
    }
  }

  /** Returns the session's cached RPC connection, creating and caching one on first use.
   * Reused across getAccountSnapshot/getPositions/getDealHistory for the same ref until
   * disconnect(), the idle reaper, or module shutdown closes it — see class doc comment
   * for why this replaced the previous open-a-connection-per-call design. */
  private async getOrCreateConnection(record: Mt5CloudSpikeRecord): Promise<RpcMetaApiConnectionInstance> {
    const cached = this.connections.get(record.id);

    if (cached) {
      cached.lastUsedAt = Date.now();
      return cached.connection;
    }

    const api = this.getClient();
    const account = await this.wrapSdkCall(() => api.metatraderAccountApi.getAccount(record.metaApiAccountId!));
    const connection = account.getRPCConnection();

    const startedAt = Date.now();

    try {
      await connection.connect();
      await connection.waitSynchronized(60);
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw this.mapSdkError(error);
    }

    this.logger.log(
      `RPC connection established for spike record ${record.id} after ${Date.now() - startedAt}ms — ` +
        `cached and will be reused for subsequent calls (see class doc comment)`,
    );

    this.connections.set(record.id, { connection, lastUsedAt: Date.now() });
    return connection;
  }

  private async touchLastActivity(ref: string): Promise<void> {
    await this.store.update(ref, { lastActivityAt: new Date().toISOString() }).catch(() => undefined);
  }

  private touchConnection(ref: string): void {
    const cached = this.connections.get(ref);
    if (cached) {
      cached.lastUsedAt = Date.now();
    }
  }

  private async dropConnection(ref: string): Promise<void> {
    const cached = this.connections.get(ref);
    if (!cached) {
      return;
    }

    this.connections.delete(ref);
    await cached.connection.close().catch(() => undefined);
  }

  private async wrapSdkCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.mapSdkError(error);
    }
  }

  private mapSdkError(error: unknown): Mt5ConnectorError {
    const name = (error as { name?: string })?.name ?? '';
    const message = (error as Error)?.message ?? 'unknown MetaApi error';

    if (name === 'UnauthorizedError') {
      return new Mt5ConnectorError(`Investor password/login/server ไม่ถูกต้อง: ${message}`, 'INVALID_CREDENTIALS');
    }

    if (name === 'NotFoundError') {
      return new Mt5ConnectorError(`ไม่พบบัญชีบน MetaApi: ${message}`, 'NOT_FOUND');
    }

    if (name === 'TimeoutError' || name === 'NotSynchronizedError') {
      return new Mt5ConnectorError(`บัญชียังไม่ online ทัน timeout (อาจกำลัง provisioning): ${message}`, 'TIMEOUT');
    }

    if (name === 'TooManyRequestsError') {
      return new Mt5ConnectorError(`โดน MetaApi rate limit: ${message}`, 'RATE_LIMITED');
    }

    // Message-based, not name-based: MetaApi returns this as a validation-style error on
    // createAccount(), not a distinct named error class. Catches it explicitly so the
    // dev/beta UI shows a readable reason instead of MetaApi's raw English text — should
    // no longer be reachable in practice now that connect() always passes
    // `reliability: 'regular'` explicitly, but kept as a safety net (e.g. if MetaApi adds
    // other billing-gated fields later, or plan restrictions change).
    if (message.toLowerCase().includes('top up')) {
      return new Mt5ConnectorError(
        `บัญชี MetaApi ยังไม่ได้ top up หรือ plan ไม่รองรับ reliability ระดับนี้: ${message}`,
        'BILLING_REQUIRED',
      );
    }

    return new Mt5ConnectorError(`MetaApi error: ${message}`, 'UNKNOWN');
  }

  private async findOwnedRecordOrThrow(ref: string, userId: number): Promise<Mt5CloudSpikeRecord> {
    const record = await this.store.get(ref);

    if (!record || record.userId !== userId) {
      throw new Mt5ConnectorError('ไม่พบ cloud connector record ที่ระบุ (หรือไม่ใช่ของผู้ใช้นี้)', 'NOT_FOUND');
    }

    return record;
  }
}
