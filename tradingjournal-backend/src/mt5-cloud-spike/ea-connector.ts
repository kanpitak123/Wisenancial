import { Injectable } from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Mt5AccountSnapshot,
  Mt5ConnectionStatus,
  Mt5Connector,
  Mt5ConnectorError,
  Mt5ConnectorHandle,
  Mt5ConnectRequest,
  Mt5DealSnapshot,
  Mt5PositionSnapshot,
} from './mt5-connector.interface';

/**
 * Wraps the EA/push connector that's already shipped (Phase 3) behind the spike's
 * MT5Connector shape — purely a read adapter over data that ConnectMt5Wizard.vue's flow
 * already produces. Never creates, modifies, or revokes a broker_connections row: this
 * file has no write path into that table at all, by design (constraint #4 — don't touch
 * the existing EA wizard/connection lifecycle).
 *
 * "connect()" here means "look up an existing ACTIVE MT5 connection the user already set
 * up through the real wizard" — there is no credential to submit, because the EA flow's
 * credential is the per-connection API key issued at creation time, not something this
 * spike page collects.
 *
 * Every read re-checks `user_id` against the caller (see Mt5Connector's doc comment) —
 * `ref` here is just broker_connections.id as a string, a small guessable integer, so
 * ownership can't only be checked once at connect() time.
 */
@Injectable()
export class EaConnector implements Mt5Connector {
  readonly kind = 'EA' as const;

  constructor(private readonly prisma: PrismaService) {}

  async connect(request: Mt5ConnectRequest, userId: number): Promise<Mt5ConnectorHandle> {
    if (request.kind !== 'EA') {
      throw new Mt5ConnectorError('EaConnector ได้รับ request ที่ไม่ใช่ kind EA', 'WRONG_CONNECTOR');
    }

    const connection = await this.findOwnedConnectionOrThrow(request.brokerConnectionId, userId);

    return { kind: 'EA', ref: String(connection.id) };
  }

  /** No-op by design — see file header. Revoking a real EA connection is the wizard's
   * job (BrokerConnectionsService.revoke/softDelete), never this spike's. */
  async disconnect(): Promise<void> {
    return;
  }

  async getAccountSnapshot(ref: string, userId: number): Promise<Mt5AccountSnapshot> {
    const connection = await this.findOwnedConnectionOrThrow(Number(ref), userId);

    if (!connection.portfolio_id) {
      throw new Mt5ConnectorError('Connection นี้ยังไม่ผูก portfolio — ไม่มี balance ให้อ่าน', 'NO_PORTFOLIO');
    }

    const portfolio = await this.prisma.portfolios.findUnique({
      where: { id: connection.portfolio_id },
      select: { current_balance: true, currency: true },
    });

    if (!portfolio) {
      throw new Mt5ConnectorError('ไม่พบ portfolio ที่ผูกกับ connection นี้', 'NOT_FOUND');
    }

    // Open-position profit approximates unrealized P/L — portfolios.current_balance is
    // the closed-trade balance the rest of the app already trusts (see
    // trades.service.ts), it does not itself carry a live equity figure. This spike does
    // not attempt to reconstruct margin/leverage — the EA ingestion pipeline
    // (mt5-sync.service.ts) does not persist those fields onto any table this connector
    // can read today (see BrokerAccountSnapshot.margin/marginLevel in broker-types.ts,
    // which is written but has no adapter consumer yet).
    const openPositions = await this.prisma.trades.aggregate({
      where: { broker_connection_id: connection.id, result_status: 'OPEN' },
      _sum: { pnl: true },
    });

    const balance = Number(portfolio.current_balance);
    const unrealized = Number(openPositions._sum.pnl ?? 0);

    return {
      broker: null,
      currency: portfolio.currency ?? 'USD',
      balance,
      equity: balance + unrealized,
      margin: null,
      freeMargin: null,
      marginLevel: null,
      leverage: null,
      credit: null,
    };
  }

  async getPositions(ref: string, userId: number): Promise<Mt5PositionSnapshot[]> {
    const connection = await this.findOwnedConnectionOrThrow(Number(ref), userId);

    const rows = await this.prisma.trades.findMany({
      where: { broker_connection_id: connection.id, result_status: 'OPEN' },
      orderBy: { opened_at: 'desc' },
    });

    return rows.map((row) => ({
      ticket: row.ticket_id ?? String(row.id),
      symbol: row.pair,
      direction: row.trade_type === 'SELL' ? 'SELL' : 'BUY',
      volume: row.volume ? Number(row.volume) : 0,
      openPrice: row.open_price ? Number(row.open_price) : 0,
      currentPrice: row.close_price ? Number(row.close_price) : null,
      profit: row.pnl ? Number(row.pnl) : null,
      openedAt: row.opened_at,
    }));
  }

  async getDealHistory(ref: string, userId: number, sinceDays = 30): Promise<Mt5DealSnapshot[]> {
    const connection = await this.findOwnedConnectionOrThrow(Number(ref), userId);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.trades.findMany({
      where: {
        broker_connection_id: connection.id,
        result_status: 'CLOSED',
        closed_at: { gte: since },
      },
      orderBy: { closed_at: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      ticket: row.ticket_id ?? String(row.id),
      symbol: row.pair,
      volume: row.volume ? Number(row.volume) : null,
      price: row.close_price ? Number(row.close_price) : null,
      profit: row.pnl ? Number(row.pnl) : 0,
      commission: row.commission ? Number(row.commission) : null,
      swap: row.swap ? Number(row.swap) : null,
      executedAt: row.closed_at ?? row.opened_at ?? new Date(),
    }));
  }

  async getStatus(ref: string, userId: number): Promise<Mt5ConnectionStatus> {
    const connection = await this.findOwnedConnectionOrThrow(Number(ref), userId);

    const state =
      connection.status === BrokerConnectionStatus.ACTIVE
        ? connection.last_heartbeat_at
          ? 'CONNECTED'
          : 'CONNECTING'
        : connection.status === BrokerConnectionStatus.REVOKED
          ? 'DISCONNECTED'
          : 'ERROR';

    return {
      state,
      message: connection.last_error_message ?? undefined,
      checkedAt: new Date(),
    };
  }

  private async findOwnedConnectionOrThrow(id: number, userId: number) {
    const connection = await this.prisma.broker_connections.findFirst({
      where: { id, user_id: userId, broker_type: BrokerType.MT5, deleted_at: null },
    });

    if (!connection) {
      throw new Mt5ConnectorError(
        'ไม่พบ MT5 broker connection ที่ระบุ (หรือไม่ใช่ของผู้ใช้นี้ หรือถูกลบไปแล้ว)',
        'NOT_FOUND',
      );
    }

    return connection;
  }
}
