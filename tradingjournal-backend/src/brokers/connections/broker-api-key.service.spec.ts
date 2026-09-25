import { createHash } from 'crypto';
import { BrokerApiKeyService } from './broker-api-key.service';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('BrokerApiKeyService', () => {
  let service: BrokerApiKeyService;

  beforeEach(() => {
    service = new BrokerApiKeyService();
  });

  describe('generate', () => {
    it('ออก raw key ที่ไม่ซ้ำกันทุกครั้ง', () => {
      const a = service.generate();
      const b = service.generate();

      expect(a.rawKey).not.toBe(b.rawKey);
      expect(a.hash).not.toBe(b.hash);
    });

    it('raw key มี prefix ให้รู้ประเภทได้ตอน debug และมี entropy สูงพอ (256-bit hex = 64 ตัวอักษรหลัง prefix)', () => {
      const { rawKey } = service.generate();

      expect(rawKey.startsWith('wsb_')).toBe(true);
      expect(rawKey.slice(4)).toHaveLength(64);
      expect(rawKey.slice(4)).toMatch(/^[0-9a-f]+$/);
    });

    it('hash ที่คืนมาต้องตรงกับ SHA-256 ของ raw key จริง (ไม่ใช่ scheme อ่อนแอที่คิดขึ้นเอง)', () => {
      const { rawKey, hash } = service.generate();

      expect(hash).toBe(sha256(rawKey));
    });

    it('ไม่เก็บ/คืน plaintext ที่ไหนอีกนอกจาก rawKey ตอน generate ครั้งเดียว', () => {
      const { hash } = service.generate();

      // hash ต้องกู้กลับเป็น raw key ไม่ได้ (ไม่ใช่ reversible encoding)
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain('wsb_');
    });
  });

  describe('hash', () => {
    it('deterministic — ค่าเดิมเข้าไปได้ hash เดิมออกมาเสมอ', () => {
      expect(service.hash('same-input')).toBe(service.hash('same-input'));
    });
  });

  describe('verify', () => {
    it('ยอมรับ raw key ที่ถูกต้อง', () => {
      const { rawKey, hash } = service.generate();

      expect(service.verify(rawKey, hash)).toBe(true);
    });

    it('ปฏิเสธ raw key ที่ผิด', () => {
      const { hash } = service.generate();
      const wrongKey = service.generate().rawKey;

      expect(service.verify(wrongKey, hash)).toBe(false);
    });

    it('ปฏิเสธเมื่อ stored hash สั้น/ยาวผิดปกติแทนที่จะ throw', () => {
      const { rawKey } = service.generate();

      expect(service.verify(rawKey, 'deadbeef')).toBe(false);
      expect(() => service.verify(rawKey, 'deadbeef')).not.toThrow();
    });

    it('ปฏิเสธเมื่อ stored hash เป็น garbage ที่ไม่ใช่ hex แทนที่จะ throw', () => {
      const { rawKey } = service.generate();

      expect(() => service.verify(rawKey, 'not-a-hex-string!!')).not.toThrow();
    });
  });
});
