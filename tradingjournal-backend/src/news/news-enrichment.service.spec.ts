import { NewsEnrichmentService } from './news-enrichment.service';
import { NewsImportance, NewsSentiment } from '@prisma/client';

/**
 * §4 QA bug: enrichTraderNews() เคยเขียน prompt ที่ยิงไป AI (ข้อความ "Economic event: ...
 * Analyze likely impact ... Do not provide investment instructions.") ลงคอลัมน์ content
 * ตรงๆ — news-feed.service.ts เอา content นั้นไปโชว์เป็น summary ของทุกข่าวปฏิทินเศรษฐกิจ
 * แทนที่ ai_summary ที่ AI สร้างจริง แก้แล้วโดยไม่แตะ content เลยตอน update (ไม่มี "เนื้อหา
 * ต้นฉบับ" ให้เก็บสำหรับข่าวปฏิทินเศรษฐกิจอยู่แล้ว — news-sync.service.ts ก็ไม่เคยเซ็ตมันตอน
 * ingest เช่นกัน).
 */

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: 'BRICS Summit',
    country: 'ALL',
    impact: 'Low',
    forecast: null,
    previous: null,
    actual: null,
    date: new Date('2026-09-12T08:15:00.000Z'),
    ...overrides,
  };
}

function makeService(row: ReturnType<typeof makeRow>) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const update = jest.fn().mockResolvedValue({ ...row, id: row.id });
  const enrichNewsArticle = jest.fn().mockResolvedValue({
    aiSummary: 'AI-generated summary text',
    aiTrend: null,
    aiImpactProbability: 0.4,
    stockImpactAnalysis: null,
    sector: null,
    importance: NewsImportance.LOW,
    sentiment: NewsSentiment.NEUTRAL,
    aiTranslatedSummary: undefined,
    fromFallback: false,
  });
  const broadcastNewsUpdate = jest.fn();

  const service = new NewsEnrichmentService(
    { news: { findUnique, update } } as never,
    { enrichNewsArticle } as never,
    { broadcastNewsUpdate } as never,
  );

  return { service, findUnique, update, enrichNewsArticle, broadcastNewsUpdate };
}

describe('NewsEnrichmentService — enrichTraderNews ไม่เขียน prompt ลง content (§4)', () => {
  it('ไม่ส่ง content ไปใน prisma.news.update เลย — ปฏิทินเศรษฐกิจไม่มีเนื้อหาต้นฉบับให้เก็บ', async () => {
    const row = makeRow();
    const { service, update } = makeService(row);

    await service.enrichTraderNews(1, 'en');

    expect(update).toHaveBeenCalledTimes(1);
    const [{ data }] = update.mock.calls[0] as [{ data: Record<string, unknown> }];

    expect(data).not.toHaveProperty('content');
  });

  it('ai_summary ที่บันทึกไว้คือของจริงจาก AI ไม่ใช่ prompt ที่ยิงไปถาม', async () => {
    const row = makeRow();
    const { service, update } = makeService(row);

    await service.enrichTraderNews(1, 'en');

    const [{ data }] = update.mock.calls[0] as [{ data: Record<string, unknown> }];

    expect(data.ai_summary).toBe('AI-generated summary text');
    expect(data.ai_summary).not.toContain('Do not provide investment instructions');
    expect(data.ai_summary).not.toContain('Economic event:');
  });
});
