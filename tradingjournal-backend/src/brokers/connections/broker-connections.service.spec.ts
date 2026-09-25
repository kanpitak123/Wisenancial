import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { BrokerApiKeyService } from './broker-api-key.service';
import { BrokerConnectionsService } from './broker-connections.service';

const prismaMock = {
  broker_connections: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  portfolios: {
    findFirst: jest.fn(),
  },
};

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 42,
    portfolio_id: null,
    broker_type: BrokerType.MT5,
    external_account_id: null,
    broker_server: null,
    api_key_hash: 'a'.repeat(64),
    oauth_access_token_encrypted: null,
    oauth_refresh_token_encrypted: null,
    oauth_token_expires_at: null,
    status: BrokerConnectionStatus.ACTIVE,
    last_heartbeat_at: null,
    last_sync_at: null,
    created_at: new Date('2026-09-02T00:00:00Z'),
    updated_at: new Date('2026-09-02T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

describe('BrokerConnectionsService', () => {
  let service: BrokerConnectionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BrokerConnectionsService(
      prismaMock as any,
      new BrokerApiKeyService(),
    );
  });

  describe('create', () => {
    it('MT5 (push-based) ออก API key ให้จริง', async () => {
      prismaMock.broker_connections.create.mockImplementation(({ data }: any) =>
        connectionRow({ ...data, id: 1 }),
      );

      const result = await service.create(42, BrokerType.MT5, undefined);

      expect(result.apiKey).not.toBeNull();
      expect(result.apiKey).toMatch(/^wsb_[0-9a-f]{64}$/);
      expect(prismaMock.broker_connections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 42,
            broker_type: BrokerType.MT5,
            api_key_hash: expect.any(String),
          }),
        }),
      );
    });

    it('WEBULL (pull-based) ไม่ออก API key (รอ OAuth flow ใน Phase 7)', async () => {
      prismaMock.broker_connections.create.mockImplementation(({ data }: any) =>
        connectionRow({ ...data, id: 2, broker_type: BrokerType.WEBULL }),
      );

      const result = await service.create(42, BrokerType.WEBULL, undefined);

      expect(result.apiKey).toBeNull();
      expect(prismaMock.broker_connections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ api_key_hash: null }),
        }),
      );
    });

    it('ปฏิเสธถ้า portfolio_id ที่ระบุไม่ใช่ของ user คนนี้ (กัน bind ข้ามบัญชี)', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue(null);

      await expect(service.create(42, BrokerType.MT5, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.broker_connections.create).not.toHaveBeenCalled();
    });

    it('ปฏิเสธถ้า portfolio นี้มี connection ประเภทเดียวกันที่ยังไม่ REVOKED ผูกอยู่แล้ว (กันสร้างซ้ำโดยไม่ตั้งใจ)', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 5 });
      prismaMock.broker_connections.findFirst.mockResolvedValue(
        connectionRow({ id: 3, portfolio_id: 5 }),
      );

      await expect(service.create(42, BrokerType.MT5, 5)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.broker_connections.create).not.toHaveBeenCalled();
      expect(prismaMock.broker_connections.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: 42,
            broker_type: BrokerType.MT5,
            portfolio_id: 5,
            deleted_at: null,
            status: { not: BrokerConnectionStatus.REVOKED },
          }),
        }),
      );
    });

    it('อนุญาตสร้างใหม่ถ้า connection เดิมของ portfolio นี้ถูก REVOKED ไปแล้ว', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 5 });
      prismaMock.broker_connections.findFirst.mockResolvedValue(null); // query กรอง status != REVOKED ออกไปแล้ว ไม่เจอแถว
      prismaMock.broker_connections.create.mockImplementation(({ data }: any) =>
        connectionRow({ ...data, id: 4 }),
      );

      const result = await service.create(42, BrokerType.MT5, 5);

      expect(result.apiKey).not.toBeNull();
      expect(prismaMock.broker_connections.create).toHaveBeenCalled();
    });

    it('ไม่เช็คซ้ำเลยถ้าไม่ได้ระบุ portfolio_id (ยังไม่มีอะไรชนกัน)', async () => {
      prismaMock.broker_connections.create.mockImplementation(({ data }: any) =>
        connectionRow({ ...data, id: 1 }),
      );

      await service.create(42, BrokerType.MT5, undefined);

      expect(prismaMock.portfolios.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.broker_connections.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('ownership isolation (IDOR)', () => {
    it('list() กรองด้วย user_id เสมอ ไม่คืน connection ของ user อื่น', async () => {
      prismaMock.broker_connections.findMany.mockResolvedValue([]);

      await service.list(42);

      expect(prismaMock.broker_connections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: 42, deleted_at: null }),
        }),
      );
    });

    it('getOwned() คืน 404 (ไม่ใช่ 403) เมื่อ connection เป็นของ user คนอื่น — ไม่รั่วว่า id นี้มีอยู่จริง', async () => {
      // findFirst กรองด้วย id + user_id พร้อมกัน — ถ้า user อื่นเป็นเจ้าของ query จะไม่เจอแถวเลย
      prismaMock.broker_connections.findFirst.mockResolvedValue(null);

      await expect(service.getOwned(1, 999)).rejects.toThrow(NotFoundException);
      expect(prismaMock.broker_connections.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            user_id: 999,
            deleted_at: null,
          }),
        }),
      );
    });

    it('revoke()/rotateKey()/softDelete() ทั้งหมดเช็ค ownership ก่อนแก้ไขเสมอ', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(null);

      await expect(service.revoke(1, 999)).rejects.toThrow(NotFoundException);
      await expect(service.rotateKey(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.softDelete(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.broker_connections.update).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('ตั้ง status เป็น REVOKED', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(
        connectionRow(),
      );
      prismaMock.broker_connections.update.mockResolvedValue(
        connectionRow({ status: BrokerConnectionStatus.REVOKED }),
      );

      const result = await service.revoke(1, 42);

      expect(result.status).toBe(BrokerConnectionStatus.REVOKED);
      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { status: BrokerConnectionStatus.REVOKED },
        }),
      );
    });
  });

  describe('rotateKey', () => {
    it('ออก key ใหม่ (hash เปลี่ยน) และคืน plaintext key ใหม่ครั้งเดียว', async () => {
      const existing = connectionRow();
      prismaMock.broker_connections.findFirst.mockResolvedValue(existing);
      prismaMock.broker_connections.update.mockImplementation(({ data }: any) =>
        connectionRow({ ...data }),
      );

      const result = await service.rotateKey(1, 42);

      expect(result.apiKey).toMatch(/^wsb_[0-9a-f]{64}$/);
      const updateCall = prismaMock.broker_connections.update.mock.calls[0][0];
      expect(updateCall.data.api_key_hash).not.toBe(existing.api_key_hash);
    });

    it('rotate ปลุก connection ที่เคย REVOKED กลับมา ACTIVE ได้ (เป็นการกระทำที่ผู้ใช้ตั้งใจทำเองผ่าน JWT)', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(
        connectionRow({ status: BrokerConnectionStatus.REVOKED }),
      );
      prismaMock.broker_connections.update.mockImplementation(({ data }: any) =>
        connectionRow({ ...data }),
      );

      const result = await service.rotateKey(1, 42);

      expect(result.connection.status).toBe(BrokerConnectionStatus.ACTIVE);
    });

    it('ปฏิเสธ rotate ถ้า connection ไม่มี API key ตั้งแต่แรก (pull-based เช่น Webull)', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(
        connectionRow({ broker_type: BrokerType.WEBULL, api_key_hash: null }),
      );

      await expect(service.rotateKey(1, 42)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.broker_connections.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('ตั้งทั้ง deleted_at และ status = REVOKED พร้อมกัน กัน key เก่าใช้งานได้อีก', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(
        connectionRow(),
      );
      prismaMock.broker_connections.update.mockResolvedValue(connectionRow());

      await service.softDelete(1, 42);

      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            deleted_at: expect.any(Date),
            status: BrokerConnectionStatus.REVOKED,
          }),
        }),
      );
    });
  });

  describe('recordHeartbeat', () => {
    it('อัปเดต last_heartbeat_at และตั้ง status = ACTIVE', async () => {
      prismaMock.broker_connections.update.mockResolvedValue(
        connectionRow({
          last_heartbeat_at: new Date(),
          status: BrokerConnectionStatus.ACTIVE,
        }),
      );

      const result = await service.recordHeartbeat(1);

      expect(result.status).toBe(BrokerConnectionStatus.ACTIVE);
      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            last_heartbeat_at: expect.any(Date),
            status: BrokerConnectionStatus.ACTIVE,
          }),
        }),
      );
    });

    it('ล้าง last_error_code/message/at ทิ้งเสมอ — heartbeat ที่ผ่านมาถึงนี่ได้พิสูจน์ว่า connection ใช้งานได้แล้ว', async () => {
      prismaMock.broker_connections.update.mockResolvedValue(connectionRow());

      await service.recordHeartbeat(1);

      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            last_error_code: null,
            last_error_message: null,
            last_error_at: null,
          }),
        }),
      );
    });
  });

  describe('recordSync', () => {
    it('ล้าง last_error_code/message/at ทิ้งเช่นเดียวกับ recordHeartbeat', async () => {
      prismaMock.broker_connections.update.mockResolvedValue(connectionRow());

      await service.recordSync(1);

      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            last_error_code: null,
            last_error_message: null,
            last_error_at: null,
          }),
        }),
      );
    });
  });

  describe('recordError', () => {
    it('เขียน last_error_code/message/at ลงแถวที่ระบุ', async () => {
      prismaMock.broker_connections.update.mockResolvedValue(connectionRow());

      await service.recordError(
        1,
        'ACCOUNT_MISMATCH',
        'accountLogin ไม่ตรงกับที่ pin ไว้',
      );

      expect(prismaMock.broker_connections.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          last_error_code: 'ACCOUNT_MISMATCH',
          last_error_message: 'accountLogin ไม่ตรงกับที่ pin ไว้',
          last_error_at: expect.any(Date),
        },
      });
    });
  });

  describe('sensitive-field redaction', () => {
    it('list()/getOwned()/revoke()/create().connection ไม่มี api_key_hash หรือ oauth token โผล่ออกมาเลย', async () => {
      const row = connectionRow({
        api_key_hash: 'secret-hash',
        oauth_access_token_encrypted: 'secret-access',
        oauth_refresh_token_encrypted: 'secret-refresh',
      });

      prismaMock.broker_connections.findMany.mockResolvedValue([row]);
      prismaMock.broker_connections.findFirst.mockResolvedValue(row);
      prismaMock.broker_connections.update.mockResolvedValue(row);
      prismaMock.broker_connections.create.mockResolvedValue(row);

      const [listed] = await service.list(42);
      const gotten = await service.getOwned(1, 42);
      const revoked = await service.revoke(1, 42);
      const created = await service.create(42, BrokerType.MT5, undefined);

      for (const output of [listed, gotten, revoked, created.connection]) {
        expect(output).not.toHaveProperty('api_key_hash');
        expect(output).not.toHaveProperty('oauth_access_token_encrypted');
        expect(output).not.toHaveProperty('oauth_refresh_token_encrypted');
      }
    });
  });

  describe('pinOrVerifyMt5Identity (TOFU — Phase 3J prep)', () => {
    it('issues a single conditional UPDATE guarded by an OR(null, matches-incoming) clause on both columns', async () => {
      prismaMock.broker_connections.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.pinOrVerifyMt5Identity(
        7,
        '12345678',
        'Broker-Live-01',
      );

      expect(result).toBe(true);
      expect(prismaMock.broker_connections.updateMany).toHaveBeenCalledWith({
        where: {
          id: 7,
          AND: [
            {
              OR: [
                { external_account_id: null },
                { external_account_id: '12345678' },
              ],
            },
            {
              OR: [
                { broker_server: null },
                { broker_server: 'Broker-Live-01' },
              ],
            },
          ],
        },
        data: {
          external_account_id: '12345678',
          broker_server: 'Broker-Live-01',
        },
      });
    });

    it('returns false when the conditional UPDATE matches zero rows (mismatch or lost a concurrent race)', async () => {
      prismaMock.broker_connections.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.pinOrVerifyMt5Identity(
        7,
        '99999999',
        'Broker-Live-01',
      );

      expect(result).toBe(false);
    });
  });

  describe('findByRawApiKey (ใช้โดย BrokerApiKeyGuard เท่านั้น)', () => {
    it('hash raw key แล้วค้นด้วย hash ไม่ใช่วน verify ทีละแถว', async () => {
      prismaMock.broker_connections.findFirst.mockResolvedValue(null);

      await service.findByRawApiKey('wsb_somekey');

      expect(prismaMock.broker_connections.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            api_key_hash: expect.any(String),
            deleted_at: null,
          }),
        }),
      );
    });
  });
});
