import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { BrokerApiKeyGuard } from './broker-api-key.guard';
import { BrokerConnectionsService } from './broker-connections.service';

const connectionsMock = {
  findByRawApiKey: jest.fn(),
};

function contextWithAuthHeader(header?: string): ExecutionContext {
  const request: any = { headers: { authorization: header } };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 42,
    broker_type: BrokerType.MT5,
    status: BrokerConnectionStatus.ACTIVE,
    ...overrides,
  };
}

describe('BrokerApiKeyGuard', () => {
  let guard: BrokerApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new BrokerApiKeyGuard(connectionsMock as unknown as BrokerConnectionsService);
  });

  it('ปฏิเสธเมื่อไม่มี Authorization header เลย', async () => {
    const context = contextWithAuthHeader(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(connectionsMock.findByRawApiKey).not.toHaveBeenCalled();
  });

  it('ปฏิเสธเมื่อ scheme ไม่ใช่ Bearer', async () => {
    const context = contextWithAuthHeader('Basic sometoken');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('ปฏิเสธเมื่อ key ไม่ตรงกับ connection ไหนเลย', async () => {
    connectionsMock.findByRawApiKey.mockResolvedValue(null);
    const context = contextWithAuthHeader('Bearer wsb_wrongkey');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('ปฏิเสธ connection ที่ถูก revoke แล้ว — ต้องไม่มีทางกลับมาใช้งานได้อีกผ่าน endpoint นี้', async () => {
    connectionsMock.findByRawApiKey.mockResolvedValue(
      connectionRow({ status: BrokerConnectionStatus.REVOKED }),
    );
    const context = contextWithAuthHeader('Bearer wsb_revokedkey');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('ยอมรับ connection ที่ ACTIVE และแนบ connection ไว้ใน request.brokerConnection', async () => {
    const row = connectionRow();
    connectionsMock.findByRawApiKey.mockResolvedValue(row);
    const context = contextWithAuthHeader('Bearer wsb_validkey');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest<any>();
    expect(request.brokerConnection).toBe(row);
  });

  it('ยอมรับ connection ที่เป็น DISCONNECTED/ERROR ได้ (heartbeat คือกลไกปลุกกลับมาเอง)', async () => {
    connectionsMock.findByRawApiKey.mockResolvedValue(
      connectionRow({ status: BrokerConnectionStatus.DISCONNECTED }),
    );
    const context = contextWithAuthHeader('Bearer wsb_key');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
