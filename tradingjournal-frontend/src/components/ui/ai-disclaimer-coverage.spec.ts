/**
 * ทุกจุดที่แสดงเนื้อหาที่ AI สร้างต้องมีคำปฏิเสธ "ไม่ใช่คำแนะนำทางการเงิน" (WsAiDisclaimer)
 *
 * เทสนี้อ่านซอร์สของไฟล์ .vue ตรง ๆ เพื่อกันการเพิ่มจอ AI ใหม่แล้วลืมใส่:
 *   - รายการ AI_SURFACES ต้องนำเข้า WsAiDisclaimer (เพิ่มจอใหม่ = เพิ่มชื่อไฟล์ในรายการนี้)
 *   - ไฟล์ใดก็ตามที่แสดง `.aiSummary` ของข่าว/คำแนะนำ แต่ไม่ใช่ตัวที่อยู่ในรายการ จะทำให้เทสล้ม
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('/src/**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const AI_SURFACES = [
  '/src/pages/shared/AnalyticsPage.vue', // AI Insights (AiInsightPanel)
  '/src/components/analytics/AiPortfolioAdvisorCard.vue',
  '/src/components/analytics/AiRiskAnalysisCard.vue',
  '/src/pages/investor/MarketPulsePage.vue', // AI Picks
  '/src/pages/shared/NewsPage.vue', // สรุป AI ในการ์ดข่าว
];

describe('AI disclaimer coverage', () => {
  it.each(AI_SURFACES)('%s นำเข้าและใช้ WsAiDisclaimer', (file) => {
    const source = sources[file];

    expect(source, `ไม่พบไฟล์ ${file}`).toBeDefined();
    expect(source).toMatch(/\bWsAiDisclaimer\b/);
  });

  it('ไฟล์ที่แสดง .aiSummary ทุกไฟล์อยู่ในรายการจอ AI ที่มีคำปฏิเสธ', () => {
    const rendering = Object.entries(sources)
      .filter(([, source]) => /\{\{[^}]*\.aiSummary[^}]*\}\}/.test(source))
      .map(([file]) => file);

    expect(rendering.length).toBeGreaterThan(0);
    for (const file of rendering) {
      expect(AI_SURFACES, `${file} แสดงสรุป AI แต่ไม่อยู่ในรายการที่มีคำปฏิเสธ`).toContain(file);
    }
  });
});
