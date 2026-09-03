import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface GeneratedBrokerApiKey {
  /** ค่าจริงที่ต้องส่งคืนให้ผู้ใช้ครั้งเดียวตอนนี้เท่านั้น — ไม่ถูกเก็บที่ไหนอีกเลย */
  rawKey: string;
  /** ค่าที่เก็บลง broker_connections.api_key_hash */
  hash: string;
}

/**
 * ออก/ตรวจ API key ของ broker connection แบบ push-based (MT4/MT5) — reuse pattern เดียวกับ
 * RefreshTokenService.hash() ในโปรเจกต์นี้ (src/auth/refresh-token.service.ts): เก็บแค่
 * SHA-256 hex ไม่ใช่ bcrypt/argon2 เพราะ key เป็นค่าสุ่ม entropy สูงอยู่แล้ว (256 บิตจาก
 * randomBytes) ไม่ใช่รหัสผ่านที่คนตั้งเอง จึงไม่ต้องพึ่ง slow hash เพื่อกัน brute force —
 * แต่ต่างจาก refresh token ตรงที่ verify() ที่นี่ใช้ timingSafeEqual แทน string `===`
 * ธรรมดา เพราะ endpoint ที่ใช้ (heartbeat/ingest ในอนาคต) ไม่มี JWT signature เป็นด่านแรก
 * มาช่วยกรองเหมือน refresh token flow ให้ก่อนแล้ว
 */
@Injectable()
export class BrokerApiKeyService {
  private static readonly KEY_BYTES = 32; // 256-bit
  // เติม prefix ให้ดูออกทันทีว่าเป็น key ประเภทไหนตอน debug/audit log หลุดออกมา
  // (เหมือน pattern sk_live_ ของ Stripe) ไม่ใช่ secret ในตัวเอง แค่ label
  private static readonly KEY_PREFIX = 'wsb_';

  generate(): GeneratedBrokerApiKey {
    const rawKey = `${BrokerApiKeyService.KEY_PREFIX}${randomBytes(BrokerApiKeyService.KEY_BYTES).toString('hex')}`;

    return { rawKey, hash: this.hash(rawKey) };
  }

  hash(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  /** เปรียบเทียบ hash แบบ constant-time กัน timing attack ระหว่างเทียบ byte ทีละตัว */
  verify(rawKey: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hash(rawKey), 'hex');
    const stored = Buffer.from(storedHash, 'hex');

    // timingSafeEqual โยน error ถ้าความยาว buffer ไม่เท่ากัน (ในทางปฏิบัติไม่เกิดขึ้นเพราะ
    // ทั้งคู่เป็น SHA-256 hex เสมอ) เช็คไว้ก่อนกันพังและกันรั่วข้อมูลความยาวผ่าน exception
    if (candidate.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(candidate, stored);
  }
}
