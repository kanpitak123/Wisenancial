import type { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { AuthUser, JwtAccessPayload } from '../types/auth-user.type';

/**
 * ตรวจ JWT ตอน handshake ของ WebSocket — ใช้ร่วมกันทุก gateway
 *
 * ChatGateway ทำถูกอยู่แล้วตั้งแต่แรก แต่ NewsGateway ไม่มีการตรวจอะไรเลยทั้งที่
 * news.controller.ts บังคับ JwtAuthGuard ทั้ง controller — ผลคือเนื้อหาชุดเดียวกัน
 * (รวมข่าวที่ผ่าน AI enrichment ซึ่งจ่ายค่าโมเดลไปแล้ว) ถูก broadcast ให้ใครก็ได้
 * ที่ต่อ socket เข้ามา ย้ายมาไว้ที่เดียวเพื่อให้ gateway ใหม่ในอนาคตหยิบไปใช้ได้เลย
 * ไม่ต้องเขียนใหม่แล้วเผลอตกข้อใดข้อหนึ่ง
 */

/** อ่าน token จาก header หรือ auth payload ของ socket.io (รองรับทั้งสองแบบ) */
export function extractSocketToken(client: Socket): string | undefined {
  const raw =
    client.handshake.headers.authorization || client.handshake.auth?.token;

  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }

  const value = raw.trim();

  return value.startsWith('Bearer ')
    ? value.slice('Bearer '.length).trim()
    : value;
}

/**
 * คืน user เมื่อ handshake ผ่านเท่านั้น ไม่ผ่าน = undefined (ผู้เรียก disconnect เอง)
 *
 * ใช้ JWT_ACCESS_SECRET ตัวเดียวกับที่ AuthService ใช้เซ็นและ JwtAuthGuard ใช้ตรวจ
 * ฝั่ง HTTP — ระบุตรง ๆ จะได้ไม่มีทางหล่นไปใช้ config อื่นแม้วันหลังมีใครมา
 * register JwtModule ทับ
 */
export function verifySocketUser(
  client: Socket,
  jwtService: JwtService,
  secret: string | undefined,
  logger: Logger,
  label: string,
): AuthUser | undefined {
  const rawToken = extractSocketToken(client);

  if (!rawToken) {
    logger.warn(`${label} WS connection rejected: no token provided`);
    return undefined;
  }

  if (!secret) {
    logger.error(
      `JWT_ACCESS_SECRET is not configured — rejecting ${label} WS connection`,
    );
    return undefined;
  }

  let payload: JwtAccessPayload;

  try {
    payload = jwtService.verify<JwtAccessPayload>(rawToken, { secret });
  } catch {
    logger.warn(`${label} WS connection rejected: invalid or expired token`);
    return undefined;
  }

  // ตรวจ claim ชุดเดียวกับ JwtAuthGuard — token ที่ decode ผ่านแต่ claim ไม่ครบ
  // ยังใช้ระบุตัวตนไม่ได้
  if (!payload.sub || !payload.email || !payload.username || !payload.role) {
    logger.warn(`${label} WS connection rejected: token payload is incomplete`);
    return undefined;
  }

  return {
    userId: payload.userId ?? payload.sub,
    email: payload.email,
    username: payload.username,
    role: payload.role,
  };
}
