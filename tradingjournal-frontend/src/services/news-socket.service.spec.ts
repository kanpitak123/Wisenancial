/**
 * ข่าวแบบเรียลไทม์ต้องแนบ access token ไปตอน handshake
 *
 * ฝั่งเซิร์ฟเวอร์ (news.gateway.ts) ตรวจ token ตอนต่อแล้ว — เดิม gateway นั้นไม่ตรวจ
 * อะไรเลยทั้งที่ /news ฝั่ง HTTP บังคับล็อกอิน ถ้าฝั่งนี้ไม่แนบ token ไปด้วย
 * ฟีดเรียลไทม์จะเงียบสนิทโดยไม่มี error ให้เห็นบนหน้าจอ
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
};

const io = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io }));

const ACCESS_TOKEN_KEY = 'access_token';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  io.mockReturnValue(socket);
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

/** import ใหม่ทุกครั้งเพราะ service เก็บ socket ไว้ใน module scope */
async function loadService() {
  const module = await import('./news-socket.service');
  return module.newsSocketService;
}

/** ตัวเลือกที่ส่งเข้า io() รอบที่ n (1-based) */
function handshakeOptions(call = 1) {
  const options = io.mock.calls[call - 1]?.[1] as
    | { auth?: { token?: string } }
    | undefined;

  expect(options).toBeDefined();

  return options as { auth?: { token?: string } };
}

describe('newsSocketService.connect', () => {
  it('แนบ token จาก localStorage ไปกับ handshake', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'jwt-from-login');

    const service = await loadService();
    service.connect({});

    expect(io).toHaveBeenCalledTimes(1);
    expect(handshakeOptions()).toMatchObject({
      auth: { token: 'jwt-from-login' },
    });
  });

  /**
   * ยังไม่ได้ล็อกอินก็ยังต้องต่อได้โดยไม่ throw — เซิร์ฟเวอร์จะเป็นคนปฏิเสธเอง
   * ไม่ใช่ให้หน้าเว็บพังตั้งแต่ยังไม่ทันยิง
   */
  it('ไม่มี token -> ส่งค่าว่างไป ไม่ใช่ undefined หรือโยน error', async () => {
    const service = await loadService();

    expect(() => service.connect({})).not.toThrow();
    expect(handshakeOptions()).toMatchObject({ auth: { token: '' } });
  });

  it('ต่อซ้ำโดยยังไม่ disconnect -> ไม่สร้าง socket ใหม่', async () => {
    const service = await loadService();

    service.connect({});
    service.connect({});

    expect(io).toHaveBeenCalledTimes(1);
  });

  /** token ถูกหมุนใหม่ทุกครั้งที่ refresh — ต่อรอบใหม่ต้องได้ใบล่าสุด ไม่ใช่ใบเดิม */
  it('disconnect แล้วต่อใหม่ -> อ่าน token ใบล่าสุด', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');

    const service = await loadService();
    service.connect({});
    service.disconnect();

    localStorage.setItem(ACCESS_TOKEN_KEY, 'rotated-token');
    service.connect({});

    expect(io).toHaveBeenCalledTimes(2);
    expect(handshakeOptions(2)).toMatchObject({
      auth: { token: 'rotated-token' },
    });
  });
});
