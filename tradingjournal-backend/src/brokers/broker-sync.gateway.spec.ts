/**
 * Phase 3L — same handshake-auth contract as ChatGateway/NewsGateway (see
 * chat.gateway.spec.ts): must verify with JWT_ACCESS_SECRET, must check the same
 * claim set as JwtAuthGuard, must disconnect rather than silently proceed on any
 * failure. What's specific to this gateway: no explicit joinRoom — the socket is
 * auto-joined to its own private `user:<userId>` room right at handshake, since MT5
 * sync data has no "pick a room" concept the way chat does.
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { BrokerSyncGateway } from './broker-sync.gateway';
import { Mt5EventType } from './ingestion/dto/mt5-ingest.dto';

const jwtMock = {
  verify: jest.fn(),
};

const defaultConfig = (key: string): string | undefined =>
  key === 'JWT_ACCESS_SECRET' ? 'access-secret' : undefined;

const configMock = {
  get: jest.fn(defaultConfig),
};

const VALID_PAYLOAD = {
  sub: 42,
  userId: 42,
  email: 'qa@wisenancial.test',
  username: 'qauser',
  role: Role.USER,
};

interface FakeSocket {
  id: string;
  rooms: Set<string>;
  data: { user?: unknown };
  handshake: {
    headers: Record<string, string | undefined>;
    auth: Record<string, unknown>;
  };
  disconnect: jest.Mock;
  join: jest.Mock;
}

function socketWith(options: { authorization?: string }): FakeSocket {
  return {
    id: 'socket-1',
    rooms: new Set(['socket-1']),
    data: {},
    handshake: {
      headers: options.authorization ? { authorization: options.authorization } : {},
      auth: {},
    },
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

describe('BrokerSyncGateway', () => {
  let gateway: BrokerSyncGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    configMock.get.mockImplementation(defaultConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerSyncGateway,
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    gateway = module.get<BrokerSyncGateway>(BrokerSyncGateway);
    gateway.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never;
  });

  describe('handleConnection', () => {
    it('auto-joins the caller-private room user:<userId> on a valid token — no explicit joinRoom needed', () => {
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);
      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user:42');
      expect(client.data.user).toEqual({
        userId: 42,
        email: 'qa@wisenancial.test',
        username: 'qauser',
        role: Role.USER,
      });
    });

    it('rejects a connection with no token', () => {
      const client = socketWith({});
      gateway.handleConnection(client as never);

      expect(jwtMock.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects a token that fails verification', () => {
      jwtMock.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const client = socketWith({ authorization: 'Bearer forged.token' });

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('never falls back to a hardcoded secret when JWT_ACCESS_SECRET is missing', () => {
      configMock.get.mockReturnValue(undefined);
      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect(jwtMock.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastMt5SyncUpdate', () => {
    it('emits mt5_sync_update to exactly the target user\'s private room, never a global broadcast', () => {
      gateway.broadcastMt5SyncUpdate(42, {
        connectionId: 7,
        eventType: Mt5EventType.POSITIONS_SNAPSHOT,
        portfolioId: 3,
        upsertedCount: 2,
        closedByAbsenceCount: 0,
      });

      // vi.fn() mock property access ตรงๆ โดน @typescript-eslint/unbound-method (false positive
      // มาตรฐานของ typescript-eslint กับ mocked object methods — ไม่ได้เรียกแบบ unbound จริง)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(gateway.server.to).toHaveBeenCalledWith('user:42');
      const emitted = (gateway.server.to as jest.Mock).mock.results[0].value.emit;
      expect(emitted).toHaveBeenCalledWith(
        'mt5_sync_update',
        expect.objectContaining({ connectionId: 7, eventType: Mt5EventType.POSITIONS_SNAPSHOT, upsertedCount: 2 }),
      );
    });

    it('never includes trade/position payload data — metadata only', () => {
      gateway.broadcastMt5SyncUpdate(42, {
        connectionId: 7,
        eventType: Mt5EventType.DEALS,
        portfolioId: 3,
        appliedDealsCount: 1,
      });

      const emitted = (gateway.server.to as jest.Mock).mock.results[0].value.emit;
      const payload = emitted.mock.calls[0][1];
      expect(payload).not.toHaveProperty('positions');
      expect(payload).not.toHaveProperty('deals');
      expect(payload).not.toHaveProperty('trades');
    });
  });
});
