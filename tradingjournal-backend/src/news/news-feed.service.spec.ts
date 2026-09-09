import { NewsFeedService } from './news-feed.service';
import { NewsScope, NewsQueryDto } from './dto/news-query.dto';
import { NewsImportance, NewsSentiment } from '@prisma/client';

/**
 * §4 QA bug (defense in depth): แม้ news-enrichment.service.ts จะไม่เขียน prompt ลง content
 * แล้วก็ตาม (ดู news-enrichment.service.spec.ts) แต่ getTraderItems() เดิม map
 * `summary: row.content ?? ''` ตรงๆ — ถ้ามี content ค้างอยู่จากก่อนแก้ (แถวเก่าในโปรดักชัน)
 * หรือ ingest path อื่นในอนาคตดันเซ็ต content ผิดพลาดอีก summary ก็จะพังซ้ำ ตอนนี้จึง fallback
 * ไปที่ ai_summary (ซึ่งเป็นคำอธิบายที่ AI สร้างจริง) เมื่อ content ว่าง
 */

function makeTraderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: 'BRICS Summit',
    content: null as string | null,
    source: 'Forex Factory',
    url: null,
    importance: NewsImportance.LOW,
    sentiment: NewsSentiment.NEUTRAL,
    ai_summary: 'AI-generated summary text',
    market_impact_analysis: null,
    ai_trend: null,
    ai_impact_probability: null,
    ai_translated_summary: null,
    related_symbols: [] as string[],
    country: 'ALL',
    impact: 'Low',
    forecast: null,
    previous: null,
    actual: null,
    date: new Date('2026-09-12T08:15:00.000Z'),
    pinned_by: [] as { id: number }[],
    ...overrides,
  };
}

function makeService(rows: ReturnType<typeof makeTraderRow>[]) {
  const count = jest.fn().mockResolvedValue(rows.length);
  const findMany = jest.fn().mockResolvedValue(rows);

  const service = new NewsFeedService({
    news: { count, findMany },
    market_news: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as never);

  return service;
}

function traderQuery(): NewsQueryDto {
  return { scope: NewsScope.TRADER, page: 1, limit: 12, language: 'en' } as NewsQueryDto;
}

describe('NewsFeedService — summary ของข่าวปฏิทินเศรษฐกิจ (§4)', () => {
  it('content เป็น null (กรณีปกติ) -> summary fallback ไปที่ ai_summary', async () => {
    const service = makeService([makeTraderRow({ content: null })]);

    const result = await service.getUnifiedFeed(1, traderQuery());

    expect(result.data[0].summary).toBe('AI-generated summary text');
  });

  it('content ว่างเป็นสตริง -> summary ก็ยัง fallback ไปที่ ai_summary เหมือนกัน', async () => {
    const service = makeService([makeTraderRow({ content: '' })]);

    const result = await service.getUnifiedFeed(1, traderQuery());

    expect(result.data[0].summary).toBe('AI-generated summary text');
  });

  it('content มีค่าจริง (เผื่ออนาคต) -> ยังใช้ content เป็น summary เหมือนเดิม', async () => {
    const service = makeService([makeTraderRow({ content: 'A real scraped article body' })]);

    const result = await service.getUnifiedFeed(1, traderQuery());

    expect(result.data[0].summary).toBe('A real scraped article body');
  });

  it('ไม่มีทั้ง content และ ai_summary (ยังไม่ถูก enrich) -> summary เป็นสตริงว่าง ไม่ใช่ prompt', async () => {
    const service = makeService([makeTraderRow({ content: null, ai_summary: null })]);

    const result = await service.getUnifiedFeed(1, traderQuery());

    expect(result.data[0].summary).toBe('');
  });
});
