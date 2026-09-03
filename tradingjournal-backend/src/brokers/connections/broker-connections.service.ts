import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType, broker_connections } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveConnectionMode } from '../interfaces/broker-types';
import { BrokerApiKeyService } from './broker-api-key.service';
import { PublicBrokerConnection, toPublicConnection } from './broker-connection.presenter';

export interface CreatedBrokerConnection {
  connection: PublicBrokerConnection;
  /** plaintext key — ส่งคืนครั้งเดียวตอนสร้างเท่านั้น, null สำหรับ broker แบบ pull-based (ไม่มี API key) */
  apiKey: string | null;
}

export interface RotatedBrokerConnection {
  connection: PublicBrokerConnection;
  apiKey: string;
}

/**
 * เจ้าของ entity broker_connections ทั้งหมด — CRUD ฝั่งผู้ใช้ (ผ่าน JWT,
 * BrokerConnectionsController) และ lookup ฝั่ง EA (ผ่าน API key, BrokerApiKeyGuard/
 * MtIngestionService) เรียกเข้ามาที่ service ตัวนี้ทั้งคู่ ไม่ผูกกับ broker ไหนเจาะจง
 * (การ normalize ข้อมูลจริงเป็นหน้าที่ของ adapter แต่ละตัวในเฟสถัดไป)
 */
@Injectable()
export class BrokerConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: BrokerApiKeyService,
  ) {}

  async create(
    userId: number,
    brokerType: BrokerType,
    portfolioId?: number,
  ): Promise<CreatedBrokerConnection> {
    if (portfolioId !== undefined) {
      await this.assertOwnedPortfolio(portfolioId, userId);
      await this.assertNoDuplicateBinding(userId, brokerType, portfolioId);
    }

    const mode = resolveConnectionMode(brokerType);
    const issued = mode === 'PUSH' ? this.apiKeys.generate() : null;

    const row = await this.prisma.broker_connections.create({
      data: {
        user_id: userId,
        portfolio_id: portfolioId ?? null,
        broker_type: brokerType,
        api_key_hash: issued?.hash ?? null,
        status: BrokerConnectionStatus.ACTIVE,
      },
    });

    return {
      connection: toPublicConnection(row),
      apiKey: issued?.rawKey ?? null,
    };
  }

  async list(userId: number): Promise<PublicBrokerConnection[]> {
    const rows = await this.prisma.broker_connections.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return rows.map(toPublicConnection);
  }

  async getOwned(id: number, userId: number): Promise<PublicBrokerConnection> {
    const row = await this.findOwnedOrThrow(id, userId);

    return toPublicConnection(row);
  }

  /** ยกเลิกสิทธิ์ของ key/connection ทันที — ไม่ลบแถว (ต่างจาก softDelete) เก็บประวัติไว้ audit */
  async revoke(id: number, userId: number): Promise<PublicBrokerConnection> {
    await this.findOwnedOrThrow(id, userId);

    const row = await this.prisma.broker_connections.update({
      where: { id },
      data: { status: BrokerConnectionStatus.REVOKED },
    });

    return toPublicConnection(row);
  }

  /**
   * ออก API key ใบใหม่ทับของเดิม — ใช้ตอน key เดิมอาจหลุด หรือ connection ที่เคย revoke
   * ไปแล้วอยากกลับมาใช้ใหม่ การ rotate เป็นการกระทำที่ผู้ใช้ตั้งใจทำเองผ่าน JWT (ต่างจาก
   * heartbeat ที่ถือ key เดิมมาเรียก) จึงอนุญาตให้ปลุกจาก REVOKED กลับมา ACTIVE ได้
   */
  async rotateKey(id: number, userId: number): Promise<RotatedBrokerConnection> {
    const existing = await this.findOwnedOrThrow(id, userId);

    if (existing.api_key_hash === null) {
      throw new ForbiddenException(
        'Connection นี้ไม่ใช่แบบ API key (push-based) — ไม่มี key ให้ rotate',
      );
    }

    const issued = this.apiKeys.generate();

    const row = await this.prisma.broker_connections.update({
      where: { id },
      data: {
        api_key_hash: issued.hash,
        status: BrokerConnectionStatus.ACTIVE,
      },
    });

    return { connection: toPublicConnection(row), apiKey: issued.rawKey };
  }

  /** Soft delete — ตั้ง deleted_at + revoke ควบกันไปเลย กัน key เก่าใช้ auth ได้อีกแม้ query หลุดมาเจอแถว */
  async softDelete(id: number, userId: number): Promise<void> {
    await this.findOwnedOrThrow(id, userId);

    await this.prisma.broker_connections.update({
      where: { id },
      data: { deleted_at: new Date(), status: BrokerConnectionStatus.REVOKED },
    });
  }

  /**
   * เรียกจาก BrokerApiKeyGuard เท่านั้น — หา connection จาก raw key ที่ EA แนบมาใน
   * Authorization header คืนแถวดิบ (มี api_key_hash) เพราะ guard ต้องอ่าน status เอง
   * ก่อนตัดสินใจ ไม่ผ่าน presenter ที่นี่
   */
  async findByRawApiKey(rawKey: string): Promise<broker_connections | null> {
    const hash = this.apiKeys.hash(rawKey);

    return this.prisma.broker_connections.findFirst({
      where: { api_key_hash: hash, deleted_at: null },
    });
  }

  /**
   * เรียกจาก endpoint ที่ EA ยิงเข้ามา (heartbeat ตอนนี้, ingest ในอนาคต) — คาดหวังว่า
   * BrokerApiKeyGuard กรอง REVOKED ออกไปตั้งแต่ก่อนถึง handler แล้ว (defense in depth
   * เผื่อ caller อื่นในอนาคตลืมผ่าน guard) ไม่ทำการ re-check status ที่นี่ซ้ำเพราะ
   * ownership ของกฎ "ห้าม REVOKED กลับมา ACTIVE" อยู่ที่ guard เป็นจุดเดียว
   */
  async recordHeartbeat(connectionId: number): Promise<PublicBrokerConnection> {
    const row = await this.prisma.broker_connections.update({
      where: { id: connectionId },
      data: {
        last_heartbeat_at: new Date(),
        status: BrokerConnectionStatus.ACTIVE,
      },
    });

    return toPublicConnection(row);
  }

  /**
   * เรียกจาก Mt5SyncService หลัง ingest event สำเร็จ (ACCOUNT_SNAPSHOT/POSITIONS_SNAPSHOT/
   * DEALS/RECONCILE) — ต่างจาก recordHeartbeat() ตรงที่อัปเดต last_sync_at ด้วย เพราะการ
   * ingest สำเร็จหนึ่งครั้งพิสูจน์ทั้ง "connection ยังมีชีวิต" (heartbeat) และ "sync ข้อมูล
   * ล่าสุดสำเร็จ" (sync) พร้อมกัน — ไม่แยก call สองรอบให้ซ้ำซ้อน
   */
  async recordSync(connectionId: number): Promise<PublicBrokerConnection> {
    const row = await this.prisma.broker_connections.update({
      where: { id: connectionId },
      data: {
        last_heartbeat_at: new Date(),
        last_sync_at: new Date(),
        status: BrokerConnectionStatus.ACTIVE,
      },
    });

    return toPublicConnection(row);
  }

  /**
   * Phase 3J prep — TOFU (trust on first use) pin of MT5 account identity onto a
   * connection row. Called from Mt5SyncService for every authenticated MT5 ingest
   * event that carries accountLogin/accountServer. A single atomic conditional UPDATE
   * — the WHERE clause itself is the concurrency control, no explicit lock/transaction
   * needed: Postgres serializes concurrent UPDATEs to the same row, and whichever one
   * commits second re-evaluates its WHERE against the now-committed row and correctly
   * finds 0 matches if the first writer already pinned a different identity. Handles
   * all three states in one statement:
   *   - both columns NULL              -> WHERE matches (IS NULL), pins both
   *   - both columns already match     -> WHERE matches (equality), no-op rewrite
   *   - one column set + matches,
   *     the other still NULL           -> WHERE matches, fills only the missing one
   *   - either column set + mismatches -> WHERE fails, 0 rows updated -> caller rejects
   * Never overwrites an already-pinned value with a different one — that path always
   * fails to match the WHERE clause, by construction.
   *
   * Returns true if the row is now consistent with (accountLogin, accountServer) —
   * either freshly pinned, partially filled in, or already matching. Returns false on
   * mismatch (including losing a concurrent first-use race) — caller must reject.
   */
  async pinOrVerifyMt5Identity(
    connectionId: number,
    accountLogin: string,
    accountServer: string,
  ): Promise<boolean> {
    const result = await this.prisma.broker_connections.updateMany({
      where: {
        id: connectionId,
        AND: [
          { OR: [{ external_account_id: null }, { external_account_id: accountLogin }] },
          { OR: [{ broker_server: null }, { broker_server: accountServer }] },
        ],
      },
      data: {
        external_account_id: accountLogin,
        broker_server: accountServer,
      },
    });

    return result.count === 1;
  }

  private async findOwnedOrThrow(id: number, userId: number): Promise<broker_connections> {
    const row = await this.prisma.broker_connections.findFirst({
      where: { id, user_id: userId, deleted_at: null },
    });

    if (!row) {
      throw new NotFoundException('ไม่พบ broker connection');
    }

    return row;
  }

  /**
   * กัน connection ซ้ำซ้อนโดยไม่ตั้งใจ — สอง connection ของ broker เดียวกันผูก portfolio
   * เดียวกัน ไม่มีประโยชน์อะไร (EA เชื่อมได้ทีละ connection อยู่แล้ว) มีแต่จะสับสนว่าอันไหน
   * "ใช้งานจริง" (เจอเคสจริงจาก Phase 3K E2E test — เผลอสร้างซ้ำตอนทดสอบ UI แล้วมี
   * connection นึงไม่มี EA ต่อเลย) ไม่บล็อก REVOKED — connection ที่ revoke ไปแล้วถือว่า
   * "ตาย" แล้วในทางปฏิบัติ ผู้ใช้ควร rotateKey() ปลุกอันเดิม แต่ถ้าเลือกสร้างใหม่แทนก็ไม่ผิด
   * กติกาอะไร ไม่บล็อก connection ที่ยังไม่ผูก portfolio (portfolioId undefined) เพราะยังไม่มี
   * อะไรชนกัน — สร้างได้หลายอันตามใจ ค่อยมาผูกทีหลัง
   */
  private async assertNoDuplicateBinding(
    userId: number,
    brokerType: BrokerType,
    portfolioId: number,
  ): Promise<void> {
    const duplicate = await this.prisma.broker_connections.findFirst({
      where: {
        user_id: userId,
        broker_type: brokerType,
        portfolio_id: portfolioId,
        deleted_at: null,
        status: { not: BrokerConnectionStatus.REVOKED },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `Portfolio นี้มี ${brokerType} connection ที่ใช้งานอยู่แล้ว (id ${duplicate.id}) — revoke หรือลบ connection เดิมก่อนถ้าต้องการสร้างใหม่`,
      );
    }
  }

  private async assertOwnedPortfolio(portfolioId: number, userId: number): Promise<void> {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
      select: { id: true },
    });

    if (!portfolio) {
      throw new NotFoundException('ไม่พบ portfolio');
    }
  }
}
