/**
 * NewsGateway ต้องตรวจ token ตอน handshake และใช้ CORS ชุดเดียวกับฝั่ง HTTP
 *
 * ของเดิมทั้งไฟล์มี 17 บรรทัด ไม่มี OnGatewayConnection ไม่ตรวจอะไรเลย ทั้งที่
 * news.controller.ts ใส่ JwtAuthGuard ครอบทั้ง controller — เนื้อหาชุดเดียวกัน
 * (รวม news_ai_enriched ที่จ่ายค่าโมเดลไปแล้ว) จึงรั่วออกทาง WebSocket ให้ใครก็ได้
 * และ cors ก็ hardcode '*' ไว้ทั้งที่ main.ts ไม่ยอมให้ '*' ผ่านด้วยซ้ำ
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { NewsGateway } from './news.gateway';
import { NewsScope } from './dto/news-query.dto';

const SECRET = 'test-access-secret';

const VALID_PAYLOAD = {
  sub: 7,
  email: 'qa@wisenancial.test',
  username: 'qa',
  role: 'USER',
};

beforeAll(() => {
  // เทสหลายเคสตั้งใจให้เกิด warn/error — ปิดล็อกของ Nest ไม่ให้ผลรันดูเหมือนพัง
  Logger.overrideLogger(false);
});

afterAll(() => {
  Logger.overrideLogger(console);
});

function makeGateway(verifyImpl?: () => unknown) {
  const verify = jest.fn(verifyImpl ?? (() => VALID_PAYLOAD));

  const gateway = new NewsGateway(
    { verify } as unknown as JwtService,
    { get: () => SECRET } as unknown as ConfigService,
  );

  return { gateway, verify };
}

/** socket ปลอมเท่าที่ handshake ใช้ */
function makeClient(token?: string, via: 'header' | 'auth' = 'header') {
  const disconnect = jest.fn();

  const client = {
    handshake: {
      headers: via === 'header' && token ? { authorization: token } : {},
      auth: via === 'auth' && token ? { token } : {},
    },
    data: {} as Record<string, unknown>,
    disconnect,
  } as unknown as Socket & { data: Record<string, unknown> };

  return { client, disconnect };
}

describe('NewsGateway handshake', () => {
  it('ไม่มี token -> ถูกตัดการเชื่อมต่อ', () => {
    const { gateway } = makeGateway();
    const { client, disconnect } = makeClient();

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(client.data.user).toBeUndefined();
  });

  it('token เสีย/หมดอายุ -> ถูกตัดการเชื่อมต่อ', () => {
    const { gateway } = makeGateway(() => {
      throw new Error('jwt expired');
    });
    const { client, disconnect } = makeClient('Bearer broken.token.here');

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(client.data.user).toBeUndefined();
  });

  /** decode ผ่านแต่ claim ไม่ครบ ยังใช้ระบุตัวตนไม่ได้ */
  it('payload ขาด claim -> ถูกตัดการเชื่อมต่อ', () => {
    const { gateway } = makeGateway(() => ({ sub: 7 }));
    const { client, disconnect } = makeClient('Bearer partial');

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('token ถูกต้อง -> ต่อได้ และ user ติดไปกับ socket', () => {
    const { gateway, verify } = makeGateway();
    const { client, disconnect } = makeClient('Bearer good.token');

    gateway.handleConnection(client);

    expect(disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toMatchObject({
      userId: 7,
      username: 'qa',
      role: 'USER',
    });
    // ต้องตรวจด้วย JWT_ACCESS_SECRET ตัวเดียวกับฝั่ง HTTP
    expect(verify).toHaveBeenCalledWith('good.token', { secret: SECRET });
  });

  it('ส่ง token มาทาง auth payload ของ socket.io ก็ใช้ได้', () => {
    const { gateway } = makeGateway();
    const { client, disconnect } = makeClient('good.token', 'auth');

    gateway.handleConnection(client);

    expect(disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toBeDefined();
  });

  it('ไม่ได้ตั้ง JWT_ACCESS_SECRET -> ปฏิเสธ ไม่ใช่ปล่อยผ่าน', () => {
    const gateway = new NewsGateway(
      { verify: jest.fn() } as unknown as JwtService,
      { get: () => undefined } as unknown as ConfigService,
    );
    const { client, disconnect } = makeClient('Bearer good.token');

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('NewsGateway broadcast', () => {
  it('ยัง broadcast ได้เหมือนเดิมหลังเพิ่ม auth', () => {
    const { gateway } = makeGateway();
    const emit = jest.fn();
    gateway.server = { emit } as never;

    gateway.broadcastNewsUpdate('news_ai_enriched', NewsScope.TRADER, {
      id: 1,
    });

    expect(emit).toHaveBeenCalledWith('news_ai_enriched', {
      scope: NewsScope.TRADER,
      data: { id: 1 },
    });
  });
});
