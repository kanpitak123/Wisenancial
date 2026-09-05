import { BadRequestException, Injectable } from '@nestjs/common';
import { BrokerType, Prisma, broker_connections } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { TradesService } from '../../trades/trades.service';
import { BrokerSyncGateway } from '../broker-sync.gateway';
import {
  Mt5AccountSnapshotWire,
  Mt5DealWire,
  Mt5NormalizationError,
  Mt5PositionWire,
  normalizeAccountSnapshot,
  normalizeDeal,
  normalizePosition,
} from '../adapters/mt5/mt5-normalizer';
import { BrokerConnectionsService } from '../connections/broker-connections.service';
import {
  Mt5AccountMismatchException,
  Mt5IngestErrorCode,
  Mt5PortfolioNotBoundException,
} from './mt5-ingest-error-codes';
import {
  Mt5AccountSnapshotPayloadDto,
  Mt5DealDto,
  Mt5DealsPayloadDto,
  Mt5EventType,
  Mt5IngestEnvelopeDto,
  Mt5PositionDto,
  Mt5PositionsSnapshotPayloadDto,
  Mt5ReconcilePayloadDto,
} from './dto/mt5-ingest.dto';

export interface Mt5IngestResult {
  eventType: Mt5EventType;
  [key: string]: unknown;
}

/**
 * Orchestration layer — รับ envelope ที่ผ่าน BrokerApiKeyGuard + Mt5IngestEnvelopeDto มา
 * แล้ว: (1) validate payload ย่อยตาม eventType (2) normalize ผ่าน mt5-normalizer.ts (pure)
 * (3) เขียนลง trades/records ผ่าน TradesService ที่มีอยู่แล้ว — ไม่มี Prisma write ตรงนี้เอง
 * นอกจาก $transaction wrapper ตัวเดียวต่อ event และ recordSync()/recordHeartbeat()
 *
 * portfolio_id/user_id มาจาก request.brokerConnection (ยืนยันตัวตนแล้วผ่าน
 * BrokerApiKeyGuard) เท่านั้น — ไม่เคยอ่านจาก envelope/payload ที่ EA ส่งมาเลย (ดู Phase 3
 * design review §9 "Security")
 */
@Injectable()
export class Mt5SyncService {
  private static readonly SUPPORTED_PROTOCOL_VERSIONS = [1];
  // generous clock-skew sanity check เท่านั้น ไม่ใช่ replay-protection window จริงจัง — ดู
  // Phase 3 design review §9 "ไม่ overengineer replay protection" (natural idempotency ของ
  // upsert-by-business-key ใน TradesService จัดการ replay ให้แล้วอยู่แล้ว)
  private static readonly CLOCK_SKEW_WINDOW_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trades: TradesService,
    private readonly connections: BrokerConnectionsService,
    private readonly syncGateway: BrokerSyncGateway,
  ) {}

  async ingest(connection: broker_connections, envelope: Mt5IngestEnvelopeDto): Promise<Mt5IngestResult> {
    try {
      return await this.ingestOrThrow(connection, envelope);
    } catch (error) {
      // Best-effort — a failure to *record* the error must never replace or mask the
      // original rejection the EA/frontend actually needs to see (hence swallow, not
      // rethrow, here). See BrokerConnectionsService.recordError() and
      // Mt5IngestErrorCode's doc comment for which rejections this covers/excludes.
      await this.recordIngestError(connection.id, error).catch(() => undefined);
      throw error;
    }
  }

  private async ingestOrThrow(
    connection: broker_connections,
    envelope: Mt5IngestEnvelopeDto,
  ): Promise<Mt5IngestResult> {
    this.assertPlatformMatches(connection, envelope);
    this.assertSupportedProtocolVersion(envelope);
    this.assertReasonableTimestamp(envelope);
    // Phase 3J prep §2/§3 — TOFU account identity check runs before ANY event-specific
    // logic (including the HEARTBEAT early-return below, and before the snapshotSequence
    // stale-check inside applyPositionsSnapshot) so a mismatched account can never reach
    // — and therefore never be silently absorbed as a harmless stale-duplicate no-op by
    // — the sequence gate, and never mutate trades/records or advance last_snapshot_sequence.
    await this.assertAccountIdentity(connection, envelope);

    if (envelope.eventType === Mt5EventType.HEARTBEAT) {
      // Portfolio ไม่จำเป็นสำหรับ heartbeat (คงพฤติกรรมเดิมจาก Phase 2's
      // POST /brokers/mt/heartbeat) — ต้องเบา/เร็วตามที่โจทย์ระบุ จึงไม่ validate/normalize
      // payload เพิ่มเติมที่นี่ (ไม่มีอะไรถูก persist จาก payload ของ heartbeat อยู่แล้ว)
      //
      // Phase 3J prep §1 — คืน connection state กลับไปด้วย (ไม่ใช่แค่ {applied:true} แบบ
      // เดิม) เพื่อให้ EA bootstrap อ่าน last_snapshot_sequence ผ่าน endpoint เดียว
      // (/brokers/mt/ingest) ได้เลย ไม่ต้องรู้จัก legacy /brokers/mt/heartbeat แยกต่างหาก
      // — reuse PublicBrokerConnection presenter ตัวเดิมที่ BrokerConnectionsController
      // ใช้อยู่แล้ว แทนที่จะประดิษฐ์ shapeใหม่ขึ้นมาอีกอัน (มี id/status/portfolio_id/
      // last_snapshot_sequence/last_sync_at ครบตามที่ต้องการ บวก field อื่นที่ไม่ใช่ secret)
      const updated = await this.connections.recordHeartbeat(connection.id);
      return { eventType: envelope.eventType, applied: true, connection: updated };
    }

    this.assertPortfolioBound(connection);
    const portfolioId = connection.portfolio_id as number;

    switch (envelope.eventType) {
      case Mt5EventType.ACCOUNT_SNAPSHOT: {
        const payload = await this.validatePayload(Mt5AccountSnapshotPayloadDto, envelope.payload);
        normalizeAccountSnapshotOrThrow(payload);
        await this.connections.recordSync(connection.id);
        return { eventType: envelope.eventType, applied: true };
      }

      case Mt5EventType.POSITIONS_SNAPSHOT: {
        const payload = await this.validatePayload(Mt5PositionsSnapshotPayloadDto, envelope.payload);
        const result = await this.applyPositionsSnapshot(connection, portfolioId, payload);
        await this.connections.recordSync(connection.id);
        // Phase 3L — only notify when the snapshot actually applied (accepted:true).
        // A stale/duplicate snapshot (accepted:false) changed nothing, so there is
        // nothing for the frontend to refetch.
        if (result.accepted) {
          this.syncGateway.broadcastMt5SyncUpdate(connection.user_id, {
            connectionId: connection.id,
            eventType: envelope.eventType,
            portfolioId,
            upsertedCount: result.upsertedCount,
            closedByAbsenceCount: result.closedByAbsenceCount,
          });
        }
        return { eventType: envelope.eventType, ...result };
      }

      case Mt5EventType.DEALS: {
        const payload = await this.validatePayload(Mt5DealsPayloadDto, envelope.payload);
        const result = await this.applyDeals(connection, portfolioId, payload.deals);
        await this.connections.recordSync(connection.id);
        // Phase 3L — only notify when at least one deal was newly applied; a
        // duplicate-only batch (appliedCount:0) didn't change anything.
        if (result.appliedCount > 0) {
          this.syncGateway.broadcastMt5SyncUpdate(connection.user_id, {
            connectionId: connection.id,
            eventType: envelope.eventType,
            portfolioId,
            appliedDealsCount: result.appliedCount,
          });
        }
        return { eventType: envelope.eventType, ...result };
      }

      case Mt5EventType.RECONCILE: {
        const payload = await this.validatePayload(Mt5ReconcilePayloadDto, envelope.payload);
        normalizeAccountSnapshotOrThrow(payload.accountSnapshot);
        // ลำดับตั้งใจ: apply deals ก่อน แล้วค่อยทำ positions snapshot (closing-by-absence)
        // ทีหลัง — เพื่อให้แถวที่ถูกปิดด้วย closing-by-absence สะท้อน realized pnl ล่าสุด
        // จาก deal history ที่เพิ่งได้รับในรอบเดียวกันนี้แล้ว (ดู Phase 3 design review §16)
        const dealsResult = await this.applyDeals(connection, portfolioId, payload.deals);
        const positionsResult = await this.applyPositionsSnapshot(
          connection,
          portfolioId,
          payload.positionsSnapshot,
        );
        await this.connections.recordSync(connection.id);
        // Phase 3L — either half of a RECONCILE can be the one that actually
        // changed something; notify once if either did.
        if (dealsResult.appliedCount > 0 || positionsResult.accepted) {
          this.syncGateway.broadcastMt5SyncUpdate(connection.user_id, {
            connectionId: connection.id,
            eventType: envelope.eventType,
            portfolioId,
            upsertedCount: positionsResult.upsertedCount,
            closedByAbsenceCount: positionsResult.closedByAbsenceCount,
            appliedDealsCount: dealsResult.appliedCount,
          });
        }
        return { eventType: envelope.eventType, deals: dealsResult, positions: positionsResult };
      }
    }
  }

  /**
   * Phase 3 pre-EA hardening review §2/§3 — a FULL snapshot only ever applies
   * (upsert + closing-by-absence + advancing last_snapshot_sequence) when
   * payload.snapshotSequence is strictly greater than the connection's currently
   * accepted sequence. A sequence <= what's stored is treated as stale-or-duplicate and
   * skipped as a harmless no-op (not an error — replays and out-of-order delivery are
   * expected network conditions, same posture as applyMt5Deal's dealTicket dedupe) —
   * this is what makes closing-by-absence safe: an old snapshot can never regress state
   * a newer one already applied, and resending the same snapshot twice never
   * double-applies it. The read + gate + writes all happen inside one Serializable
   * transaction so a concurrent duplicate delivery can't race past the check.
   */
  private async applyPositionsSnapshot(
    connection: broker_connections,
    portfolioId: number,
    payload: Mt5PositionsSnapshotPayloadDto,
  ) {
    if (payload.positionCount !== payload.positions.length) {
      throw new BadRequestException(
        `positionCount (${payload.positionCount}) does not match positions.length (${payload.positions.length}) — snapshot ไม่สอดคล้องกันเอง ปฏิเสธทั้ง payload แทนที่จะเดา`,
      );
    }

    const normalizedPositions = payload.positions.map((p) => normalizePositionOrThrow(p));
    const openTickets = new Set(normalizedPositions.map((p) => p.externalPositionId));

    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.broker_connections.findUnique({
          where: { id: connection.id },
          select: { last_snapshot_sequence: true },
        });

        if (current?.last_snapshot_sequence != null && payload.snapshotSequence <= current.last_snapshot_sequence) {
          return {
            snapshotId: payload.snapshotId,
            snapshotSequence: payload.snapshotSequence,
            accepted: false,
            upsertedCount: 0,
            closedByAbsenceCount: 0,
          };
        }

        for (const position of normalizedPositions) {
          await this.trades.upsertMt5Position(tx, {
            connectionId: connection.id,
            portfolioId,
            userId: connection.user_id,
            position,
          });
        }

        const closedTradeIds = await this.trades.closeMt5PositionsByAbsence(tx, connection.id, openTickets);

        await tx.broker_connections.update({
          where: { id: connection.id },
          data: { last_snapshot_sequence: payload.snapshotSequence },
        });

        return {
          snapshotId: payload.snapshotId,
          snapshotSequence: payload.snapshotSequence,
          accepted: true,
          upsertedCount: normalizedPositions.length,
          closedByAbsenceCount: closedTradeIds.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyDeals(connection: broker_connections, portfolioId: number, dealDtos: Mt5DealDto[]) {
    const normalizedDeals = dealDtos.map((d) => normalizeDealOrThrow(d));

    return this.prisma.$transaction(
      async (tx) => {
        let appliedCount = 0;
        let duplicateCount = 0;

        for (const deal of normalizedDeals) {
          const { applied } = await this.trades.applyMt5Deal(tx, {
            connectionId: connection.id,
            portfolioId,
            userId: connection.user_id,
            deal,
          });
          if (applied) appliedCount++;
          else duplicateCount++;
        }

        return { totalCount: normalizedDeals.length, appliedCount, duplicateCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async validatePayload<T extends object>(
    cls: new () => T,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const instance = plainToInstance(cls, payload ?? {});
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

    if (errors.length > 0) {
      throw new BadRequestException(this.flattenValidationErrors(errors));
    }

    return instance;
  }

  private flattenValidationErrors(errors: ValidationError[], prefix = ''): string[] {
    const messages: string[] = [];
    for (const error of errors) {
      const path = prefix ? `${prefix}.${error.property}` : error.property;
      if (error.constraints) {
        messages.push(...Object.values(error.constraints).map((m) => `${path}: ${m}`));
      }
      if (error.children && error.children.length > 0) {
        messages.push(...this.flattenValidationErrors(error.children, path));
      }
    }
    return messages;
  }

  private assertPlatformMatches(connection: broker_connections, envelope: Mt5IngestEnvelopeDto): void {
    if (connection.broker_type !== BrokerType.MT5) {
      throw new BadRequestException(
        'Connection นี้ไม่ใช่ MT5 — POST /brokers/mt/ingest รองรับเฉพาะ broker_type = MT5 ใน Phase 3',
      );
    }
    if (envelope.platform !== 'MT5') {
      throw new BadRequestException(
        `envelope.platform (${envelope.platform}) ไม่ตรงกับ broker_connection ที่ authenticate มา`,
      );
    }
  }

  private assertSupportedProtocolVersion(envelope: Mt5IngestEnvelopeDto): void {
    if (!Mt5SyncService.SUPPORTED_PROTOCOL_VERSIONS.includes(envelope.protocolVersion)) {
      throw new BadRequestException(
        `protocolVersion ${envelope.protocolVersion} ไม่รองรับ (รองรับ: ${Mt5SyncService.SUPPORTED_PROTOCOL_VERSIONS.join(', ')})`,
      );
    }
  }

  private assertReasonableTimestamp(envelope: Mt5IngestEnvelopeDto): void {
    const sentAt = new Date(envelope.sentAt).getTime();
    if (Math.abs(Date.now() - sentAt) > Mt5SyncService.CLOCK_SKEW_WINDOW_MS) {
      throw new BadRequestException(
        'envelope.sentAt อยู่นอกช่วงเวลาที่ยอมรับได้ — ตรวจสอบนาฬิกาของเครื่องที่รัน EA',
      );
    }
  }

  private assertPortfolioBound(connection: broker_connections): void {
    if (connection.portfolio_id === null) {
      throw new Mt5PortfolioNotBoundException(
        'Connection นี้ยังไม่ผูก portfolio — bind portfolio ก่อนถึงจะ sync ข้อมูลเทรดจริงได้ (ดู POST /brokers/connections)',
      );
    }
  }

  /**
   * Maps a rejected ingest() call onto broker_connections.last_error_code/message so the
   * frontend setup wizard has something concrete to show instead of an indefinite
   * spinner. Only records for the specific, known-meaningful codes below — an
   * unrecognized exception (a genuine 500, or anything not explicitly mapped) is left
   * unrecorded rather than guessed at, since a wrong/misleading last_error would be worse
   * than none at all.
   */
  private async recordIngestError(connectionId: number, error: unknown): Promise<void> {
    const code = this.classifyIngestError(error);
    if (code === null) return;

    const message = error instanceof Error ? error.message : 'Unknown error';
    await this.connections.recordError(connectionId, code, message);
  }

  private classifyIngestError(error: unknown): Mt5IngestErrorCode | null {
    if (error instanceof Mt5AccountMismatchException) return Mt5IngestErrorCode.ACCOUNT_MISMATCH;
    if (error instanceof Mt5PortfolioNotBoundException) return Mt5IngestErrorCode.PORTFOLIO_NOT_BOUND;
    // Generic bucket for every other rejected-but-expected request (bad payload,
    // unsupported protocol version, clock skew, platform mismatch) — all thrown as a
    // plain BadRequestException elsewhere in this file. Checked last, and only matches
    // BadRequestException itself/subclasses that AREN'T already one of the specific
    // cases above (both specific exceptions extend BadRequestException too, but the
    // instanceof checks above already returned for those).
    if (error instanceof BadRequestException) return Mt5IngestErrorCode.CONFIG_ERROR;
    return null;
  }

  /**
   * Phase 3J prep §2 — TOFU (trust on first use) pin of MT5 account identity. Applies
   * uniformly to every event type reachable through this unified endpoint (HEARTBEAT
   * included, per §2D) — the legacy POST /brokers/mt/heartbeat endpoint never carries
   * accountLogin/accountServer in its request at all, so it structurally cannot
   * participate and is intentionally left untouched.
   *
   * Fast path: if the connection row already has both fields pinned (immutable once
   * set — nothing in this codebase ever unpins/overwrites them, see
   * pinOrVerifyMt5Identity's doc comment), a plain in-memory comparison against the
   * already-loaded `connection` is enough — no DB round trip on every single
   * heartbeat/event once a connection is established. Only the first-use/partial-state
   * case needs the atomic conditional UPDATE.
   */
  private async assertAccountIdentity(
    connection: broker_connections,
    envelope: Mt5IngestEnvelopeDto,
  ): Promise<void> {
    const accountLogin = String(envelope.accountLogin).trim();
    const accountServer = envelope.accountServer;
    // ?? normalize เผื่อ undefined (ไม่ควรเกิดกับแถวจริงจาก Prisma ซึ่ง nullable column จะ
    // เป็น null เสมอไม่ใช่ undefined — แต่กันไว้เผื่อ caller/mock ไหนไม่ครบ field)
    const pinnedAccountLogin = connection.external_account_id ?? null;
    const pinnedAccountServer = connection.broker_server ?? null;

    const loginMismatch = pinnedAccountLogin !== null && pinnedAccountLogin !== accountLogin;
    const serverMismatch = pinnedAccountServer !== null && pinnedAccountServer !== accountServer;

    if (loginMismatch || serverMismatch) {
      throw new Mt5AccountMismatchException(this.accountIdentityMismatchMessage());
    }

    const alreadyFullyPinned = pinnedAccountLogin !== null && pinnedAccountServer !== null;
    if (alreadyFullyPinned) {
      return;
    }

    const consistent = await this.connections.pinOrVerifyMt5Identity(connection.id, accountLogin, accountServer);
    if (!consistent) {
      // เกิดจากแพ้ race ของ concurrent first-use (อีก request คู่แข่งชนะไปแล้วด้วยค่าที่ต่างกัน)
      // หรือ state เปลี่ยนไปแล้วระหว่าง read กับ write — ทั้งสองกรณีปฏิเสธเหมือนกัน ไม่เดา
      throw new Mt5AccountMismatchException(this.accountIdentityMismatchMessage());
    }
  }

  /** ไม่ echo ค่าที่ pin ไว้จริงหรือค่าที่ส่งมากลับไปในข้อความ error — กัน API key ที่หลุด/โดนขโมยใช้ probe หาบัญชีจริงได้ */
  private accountIdentityMismatchMessage(): string {
    return 'accountLogin/accountServer ไม่ตรงกับบัญชีที่เคย pin ไว้กับ broker connection นี้ (TOFU) — สร้าง broker connection ใหม่ถ้าต้องการเปลี่ยนบัญชี MT5';
  }
}

function normalizeAccountSnapshotOrThrow(payload: Mt5AccountSnapshotPayloadDto) {
  const wire: Mt5AccountSnapshotWire = {
    accountLogin: payload.accountLogin,
    balance: payload.balance,
    equity: payload.equity,
    margin: payload.margin,
    marginFree: payload.marginFree,
    marginLevel: payload.marginLevel,
    credit: payload.credit,
    currency: payload.currency,
    leverage: payload.leverage,
  };
  try {
    return normalizeAccountSnapshot(wire);
  } catch (error) {
    throw toBadRequest(error);
  }
}

function normalizePositionOrThrow(payload: Mt5PositionDto) {
  const wire: Mt5PositionWire = {
    positionTicket: payload.positionTicket,
    symbol: payload.symbol,
    direction: payload.direction,
    volume: payload.volume,
    openPrice: payload.openPrice,
    currentPrice: payload.currentPrice,
    sl: payload.sl,
    tp: payload.tp,
    swap: payload.swap,
    profit: payload.profit,
    openedAt: payload.openedAt,
  };
  try {
    return normalizePosition(wire);
  } catch (error) {
    throw toBadRequest(error);
  }
}

function normalizeDealOrThrow(payload: Mt5DealDto) {
  const wire: Mt5DealWire = {
    dealTicket: payload.dealTicket,
    orderTicket: payload.orderTicket ?? null,
    positionTicket: payload.positionTicket,
    symbol: payload.symbol,
    entryType: payload.entryType,
    volume: payload.volume,
    price: payload.price,
    commission: payload.commission,
    swap: payload.swap,
    profit: payload.profit,
    executedAt: payload.executedAt,
  };
  try {
    return normalizeDeal(wire);
  } catch (error) {
    throw toBadRequest(error);
  }
}

function toBadRequest(error: unknown): BadRequestException {
  if (error instanceof Mt5NormalizationError) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException('Unexpected normalization error');
}
