/**
 * เวอร์ชัน Terms/Privacy มีแหล่งเดียวคือหลังบ้าน (CURRENT_TERMS_VERSION)
 *
 * เทสนี้อ่านซอร์สหน้าบ้านทุกไฟล์ (ยกเว้นเทสต์เอง) แล้วล้มถ้ามีเลขเวอร์ชันแบบ `draft-0.1` ฝังอยู่ในโค้ด
 * เพื่อกันไม่ให้มีสำเนาที่สองกลับมาแล้วค่อย ๆ เพี้ยนจากหลังบ้าน
 * (ข้อความ "Draft v0.1" ที่แสดงบนหน้าเอกสารเป็นเนื้อหาให้คนอ่าน ไม่ใช่ค่าที่ส่งให้หลังบ้าน)
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('/src/**/*.{ts,vue}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('terms version single source', () => {
  it('ไม่มีเลขเวอร์ชันของ Terms ฝังในโค้ดหน้าบ้าน', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.spec\.ts$/.test(file))
      .filter(([, source]) => /['"`]draft-\d/.test(source))
      .map(([file]) => file);

    expect(offenders, 'ต้องอ่านเวอร์ชันจาก LegalStore เท่านั้น').toEqual([]);
  });

  it('ไม่มีค่าคงที่ TERMS_VERSION ในโค้ดหน้าบ้านอีกต่อไป', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.spec\.ts$/.test(file))
      .filter(([, source]) => /\bTERMS_VERSION\b/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('หน้าสมัครส่งเวอร์ชันจาก LegalStore ไม่ใช่ค่าคงที่', () => {
    const page = sources['/src/pages/auth/RegisterPage.vue'] ?? '';

    expect(page).toMatch(/legalStore\.termsVersion/);
    expect(page).toMatch(/accepted_terms_version:\s*termsVersion/);
  });
});
