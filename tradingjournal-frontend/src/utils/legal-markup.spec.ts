/**
 * ตัวแยกข้อความกฎหมาย — ตัวยึด [ ... ] ต้องถูกแยกออกมาให้ไฮไลต์เสมอ ห้ามหายเงียบ ๆ
 */
import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENTS } from 'src/constants/legal.content';
import { countLegalPlaceholders, tokenizeLegalText } from './legal-markup';

describe('tokenizeLegalText', () => {
  it('ข้อความล้วนคืนส่วนเดียว', () => {
    expect(tokenizeLegalText('hello')).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('แยกตัวหนาและตัวยึดออกจากข้อความรอบข้าง', () => {
    expect(tokenizeLegalText('a **b** c [d] e')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' c ' },
      { type: 'placeholder', text: '[d]' },
      { type: 'text', text: ' e' },
    ]);
  });

  it('ตัวยึดยังมีวงเล็บเหลี่ยมครบ (แสดงตามต้นฉบับ)', () => {
    const [segment] = tokenizeLegalText('[Placeholder — refund policy]');

    expect(segment).toEqual({ type: 'placeholder', text: '[Placeholder — refund policy]' });
  });

  it('ไม่ตีความ HTML — แท็กยังเป็นข้อความธรรมดา', () => {
    expect(tokenizeLegalText('<b>x</b>')).toEqual([{ type: 'text', text: '<b>x</b>' }]);
  });
});

describe('เนื้อหาฉบับร่างที่ส่งเข้าตัวแยก', () => {
  const all = (doc: 'terms' | 'privacy', lang: 'th' | 'en') => {
    const d = LEGAL_DOCUMENTS[doc][lang];

    return [d.updated, d.intro ?? '', ...d.sections.map((s) => s.body)];
  };

  const count = (doc: 'terms' | 'privacy', lang: 'th' | 'en') =>
    all(doc, lang).reduce((sum, text) => sum + countLegalPlaceholders(text), 0);

  it.each([
    ['terms', 'en'],
    ['terms', 'th'],
    ['privacy', 'en'],
    ['privacy', 'th'],
  ] as const)('%s/%s ยังมีตัวยึดที่รอคำตอบ (วันที่อัปเดตเป็นตัวยึดเสมอ)', (doc, lang) => {
    expect(count(doc, lang)).toBeGreaterThanOrEqual(2);
    expect(countLegalPlaceholders(LEGAL_DOCUMENTS[doc][lang].updated)).toBe(1);
  });

  it('TH และ EN มีจำนวนหัวข้อเท่ากันในแต่ละเอกสาร', () => {
    expect(LEGAL_DOCUMENTS.terms.th.sections).toHaveLength(LEGAL_DOCUMENTS.terms.en.sections.length);
    expect(LEGAL_DOCUMENTS.privacy.th.sections).toHaveLength(
      LEGAL_DOCUMENTS.privacy.en.sections.length,
    );
  });

  it('TH และ EN มีตัวยึดจำนวนเท่ากันในแต่ละเอกสาร (ไม่มีภาษาไหนตกหล่น)', () => {
    for (const doc of ['terms', 'privacy'] as const) {
      expect(count(doc, 'th')).toBe(count(doc, 'en'));
    }
  });
});
