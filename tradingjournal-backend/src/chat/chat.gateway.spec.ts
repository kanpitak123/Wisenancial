/**
 * เดิม ChatModule register JwtModule ของตัวเองด้วย
 *   secret: process.env.JWT_SECRET || 'MY_SECRET_KEY_1234'
 * ซึ่งเป็นคนละตัวกับ JWT_ACCESS_SECRET ที่ AuthService ใช้เซ็น (รอดมาได้เพราะ
 * บังเอิญตั้งเท่ากันใน .env) และมี fallback ที่ใครก็เดาได้ถ้า env หลุด
 *
 * เทสชุดนี้ล็อกไว้ว่า WS ต้อง verify ด้วย JWT_ACCESS_SECRET เท่านั้น
 * และต้องตรวจ claim ครบชุดเดียวกับ JwtAuthGuard ฝั่ง HTTP
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

const chatServiceMock = {
  saveMessage: jest.fn(),
  getRoomHistory: jest.fn(),
};

const jwtMock = {
  verify: jest.fn(),
};

const defaultConfig = (key: string): string | undefined =>
  key === 'JWT_ACCESS_SECRET' ? 'access-secret' : undefined;

const configMock = {
  get: jest.fn(defaultConfig),
};

const VALID_PAYLOAD = {
  sub: 10,
  userId: 10,
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
  leave: jest.Mock;
}

function socketWith(options: {
  authorization?: string;
  authToken?: unknown;
}): FakeSocket {
  return {
    id: 'socket-1',
    rooms: new Set(['socket-1']),
    data: {},
    handshake: {
      headers: options.authorization ? { authorization: options.authorization } : {},
      auth: options.authToken === undefined ? {} : { token: options.authToken },
    },
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  };
}

describe('ChatGateway — websocket auth', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks ล้างแค่ประวัติการเรียก ไม่ล้าง implementation ที่เทสก่อนหน้าตั้งทับไว้
    configMock.get.mockImplementation(defaultConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: ChatService, useValue: chatServiceMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    gateway.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never;
  });

  describe('handleConnection', () => {
    it('should verify with JWT_ACCESS_SECRET — the same secret the auth module signs with', () => {
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);

      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect(configMock.get).toHaveBeenCalledWith('JWT_ACCESS_SECRET');
      expect(jwtMock.verify).toHaveBeenCalledWith('good.token', {
        secret: 'access-secret',
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should never fall back to a hardcoded secret when the env var is missing', () => {
      configMock.get.mockReturnValue(undefined);

      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect(jwtMock.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.data.user).toBeUndefined();
    });

    it('should store a normalised auth user on the socket', () => {
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);

      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect(client.data.user).toEqual({
        userId: 10,
        email: 'qa@wisenancial.test',
        username: 'qauser',
        role: Role.USER,
      });
    });

    it('should fall back to sub when the token has no userId claim', () => {
      const { userId: _userId, ...withoutUserId } = VALID_PAYLOAD;
      jwtMock.verify.mockReturnValue(withoutUserId);

      const client = socketWith({ authorization: 'Bearer good.token' });

      gateway.handleConnection(client as never);

      expect((client.data.user as { userId: number }).userId).toBe(10);
    });

    it('should reject a connection with no token at all', () => {
      const client = socketWith({});

      gateway.handleConnection(client as never);

      expect(jwtMock.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should reject a token that fails verification', () => {
      jwtMock.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const client = socketWith({ authorization: 'Bearer forged.token' });

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.data.user).toBeUndefined();
    });

    it('should reject a token whose payload is missing claims', () => {
      // ของเดิมรับ payload อะไรก็ได้ที่ decode ผ่าน แล้วไปพังตอนบันทึกข้อความ
      jwtMock.verify.mockReturnValue({ sub: 10 });

      const client = socketWith({ authorization: 'Bearer thin.token' });

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(client.data.user).toBeUndefined();
    });

    it('should accept the token from socket.io auth payload as well as the header', () => {
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);

      const client = socketWith({ authToken: 'raw.token.without.bearer' });

      gateway.handleConnection(client as never);

      expect(jwtMock.verify).toHaveBeenCalledWith('raw.token.without.bearer', {
        secret: 'access-secret',
      });
    });

    it('should ignore a blank or non-string token instead of trying to verify it', () => {
      const blank = socketWith({ authorization: '   ' });
      gateway.handleConnection(blank as never);

      const notAString = socketWith({ authToken: { nested: true } });
      gateway.handleConnection(notAString as never);

      expect(jwtMock.verify).not.toHaveBeenCalled();
      expect(blank.disconnect).toHaveBeenCalledTimes(1);
      expect(notAString.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage', () => {
    it('should save the message under the id taken from the verified token', async () => {
      chatServiceMock.saveMessage.mockResolvedValue({ id: 1 });

      const client = socketWith({ authorization: 'Bearer good.token' });
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);
      gateway.handleConnection(client as never);

      await gateway.handleMessage(client as never, {
        roomName: 'General',
        message: 'hello',
      });

      expect(chatServiceMock.saveMessage).toHaveBeenCalledWith(10, 'General', 'hello');
    });

    it('should drop the socket rather than write a message for an unauthenticated client', async () => {
      const client = socketWith({});

      await gateway.handleMessage(client as never, {
        roomName: 'General',
        message: 'hello',
      });

      expect(chatServiceMock.saveMessage).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should ignore blank messages', async () => {
      const client = socketWith({ authorization: 'Bearer good.token' });
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);
      gateway.handleConnection(client as never);

      await gateway.handleMessage(client as never, {
        roomName: 'General',
        message: '   ',
      });

      expect(chatServiceMock.saveMessage).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinRoom', () => {
    it('should refuse to join a room without a verified user', () => {
      const client = socketWith({});

      gateway.handleJoinRoom(client as never, { roomName: 'General' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should leave previous rooms before joining a new one', () => {
      const client = socketWith({ authorization: 'Bearer good.token' });
      jwtMock.verify.mockReturnValue(VALID_PAYLOAD);
      gateway.handleConnection(client as never);

      client.rooms.add('BTC/USD');

      gateway.handleJoinRoom(client as never, { roomName: 'XAU/USD' });

      expect(client.leave).toHaveBeenCalledWith('BTC/USD');
      expect(client.leave).not.toHaveBeenCalledWith('socket-1');
      expect(client.join).toHaveBeenCalledWith('XAU/USD');
    });
  });
});
