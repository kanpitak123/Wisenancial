/**
 * ข้อความบนหน้าจอต้องไม่บอกว่าแอปให้ "คำแนะนำการลงทุน" / มี "ที่ปรึกษา" / บอกว่า "แนะนำ-ไม่แนะนำ" หุ้น
 *
 * ข้อกำหนดการให้บริการ (Terms §2-3) ระบุว่าบริการนี้ไม่ใช่โบรกเกอร์และไม่ใช่ที่ปรึกษาทางการเงิน
 * ข้อความการตลาด/ป้ายในแอปที่ขัดกับข้อนั้นทำให้คำปฏิเสธไร้น้ำหนัก เทสนี้กันไม่ให้ถ้อยคำแบบนี้กลับมา
 * ใช้คำว่า "บทวิเคราะห์ / ข้อสังเกต / จุดที่ควรพิจารณา / AI คัด" แทน
 *
 * ยกเว้น: เนื้อหาเอกสารกฎหมาย (ต้องพูดถึง "คำแนะนำ" เพื่อปฏิเสธมัน), คำปฏิเสธ AI, mock data และไฟล์เทสต์
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('/src/**/*.{ts,vue}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXEMPT = [/\.spec\.ts$/, /\/mocks\//, /\/legal\.content\.ts$/, /\/WsAiDisclaimer\.vue$/];

/** [ชื่ออธิบาย, pattern] — ตรงกับข้อความที่ผู้ใช้เห็น */
const BANNED: [string, RegExp][] = [
  ['รับคำแนะนำ (จาก AI)', /รับคำแนะนำ/],
  ['คำแนะนำการลงทุน', /คำแนะนำการลงทุน/],
  ['AI แนะนำ', /AI แนะนำ/],
  ['ที่ปรึกษาพอร์ต', /ที่ปรึกษาพอร์ต/],
  ['AI Portfolio Advisor', /AI Portfolio Advisor/],
  ['Not Recommended / ไม่แนะนำ', /Not Recommended|ไม่แนะนำ/],
  ['ใกล้เกณฑ์แนะนำ / Near Recommended', /ใกล้เกณฑ์แนะนำ|Near Recommended/],
  ['Actionable Recommendations', /Actionable Recommendations/],
  ['investment advice (ยกเว้นในเชิงปฏิเสธ)', /(?<!not\s)(?<!not personalized\s)investment advice/i],
];

/** ตัดบรรทัดคอมเมนต์ทิ้ง — ตรวจเฉพาะข้อความที่ผู้ใช้เห็น (คอมเมนต์ของนักพัฒนาพูดถึงชื่อเดิมได้) */
const withoutComments = (source: string) =>
  source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(line))
    .join('\n');

describe('advice wording', () => {
  const files = Object.entries(sources)
    .filter(([file]) => !EXEMPT.some((rule) => rule.test(file)))
    .map(([file, source]): [string, string] => [file, withoutComments(source)]);

  it('มีไฟล์ให้ตรวจ (กัน glob เสียแล้วเทสผ่านเพราะว่างเปล่า)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(BANNED)('ไม่มีข้อความ "%s" บนหน้าจอ', (_label, pattern) => {
    const offenders = files.filter(([, source]) => pattern.test(source)).map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});
