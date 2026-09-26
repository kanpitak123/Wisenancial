import { assessOutputLanguage } from './ai-language';

const THAI =
  'พอร์ตนี้กระจุกตัวในหุ้นเทคโนโลยีสหรัฐมากเกินไป ควรติดตามความเสี่ยงด้านการกระจายการลงทุนอย่างใกล้ชิด';
const ENGLISH =
  'The portfolio is concentrated in US technology stocks, so diversification risk deserves close monitoring.';
const KOREAN =
  '이 포트폴리오는 미국 기술주에 지나치게 집중되어 있어 분산 투자 위험을 면밀히 살펴봐야 합니다.';
const CHINESE =
  '该投资组合过度集中于美国科技股，需要密切关注分散投资风险和整体波动。';
const JAPANESE =
  'このポートフォリオは米国のテクノロジー株に集中しすぎており分散投資のリスクに注意が必要です。';

describe('assessOutputLanguage', () => {
  describe('expected Thai', () => {
    it('accepts Thai prose', () => {
      expect(assessOutputLanguage({ summary: THAI }, 'th').ok).toBe(true);
    });

    it('accepts Thai prose that keeps tickers and English terms', () => {
      const text = `น้ำหนักของ AAPL และ MSFT สูงกว่า 25% ของพอร์ต ค่า beta และ P/E จึงมีผลต่อความเสี่ยงมาก`;
      expect(assessOutputLanguage({ summary: text }, 'th').ok).toBe(true);
    });

    it.each([
      ['Korean', KOREAN],
      ['Chinese', CHINESE],
      ['Japanese', JAPANESE],
    ])('rejects %s', (_name, text) => {
      const verdict = assessOutputLanguage({ summary: text }, 'th');
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBeDefined();
    });

    it('rejects English (the Risk Analysis case: Thai UI, English answer)', () => {
      const verdict = assessOutputLanguage({ analysisSummary: ENGLISH }, 'th');
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toMatch(/Thai/);
    });
  });

  describe('expected English', () => {
    it('accepts English prose', () => {
      expect(assessOutputLanguage({ summary: ENGLISH }, 'en').ok).toBe(true);
    });

    it.each([
      ['Korean', KOREAN],
      ['Chinese', CHINESE],
      ['Japanese', JAPANESE],
      ['Thai', THAI],
    ])('rejects %s', (_name, text) => {
      expect(assessOutputLanguage({ summary: text }, 'en').ok).toBe(false);
    });
  });

  describe('structure', () => {
    it('looks inside arrays and nested objects', () => {
      const answer = {
        strengths: [THAI, THAI],
        nested: { deeper: { note: KOREAN } },
      };
      // one Korean field among fine ones must not hide behind them
      expect(assessOutputLanguage(answer, 'th').ok).toBe(false);
    });

    it('ignores short values: enums, tickers, labels and numbers', () => {
      const answer = {
        riskLevel: 'Moderate',
        riskScore: 55,
        symbol: 'AAPL',
        sector: 'Technology',
        summary: THAI,
      };
      expect(assessOutputLanguage(answer, 'th').ok).toBe(true);
    });

    it('passes an answer with no prose at all', () => {
      expect(
        assessOutputLanguage(
          { disciplineScore: 80, riskProfile: 'MODERATE' },
          'th',
        ).ok,
      ).toBe(true);
      expect(assessOutputLanguage(null, 'en').ok).toBe(true);
    });

    it('takes a bare string or array as well as an object', () => {
      expect(assessOutputLanguage(KOREAN, 'th').ok).toBe(false);
      expect(assessOutputLanguage([THAI, THAI], 'th').ok).toBe(true);
    });
  });
});
