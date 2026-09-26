/**
 * Pre-check unit tests, ported from `tests/test_news_pipeline.py` (PrecheckTests) in the
 * Python reference implementation.
 */

import {
  run,
  similarityRatio,
  MIN_CONTENT_CHARS,
  THIN_CONTENT_CHARS,
} from './precheck';
import type { NewsArticleInput } from './types';

const NOW = new Date('2026-09-13T09:00:00Z');

function article(
  overrides: Partial<NewsArticleInput> & Pick<NewsArticleInput, 'sourceId'>,
): NewsArticleInput {
  return {
    headline: 'headline',
    content: 'x'.repeat(50),
    source: 'Some Wire',
    publishedAt: new Date('2026-09-12T12:00:00Z'),
    ...overrides,
  };
}

describe('similarityRatio', () => {
  test('identical strings are similarity 1', () => {
    expect(similarityRatio('hello world', 'hello world')).toBe(1);
  });

  test('completely different strings are similarity 0', () => {
    expect(similarityRatio('abc', 'xyz')).toBe(0);
  });

  test('near-duplicate wire copy scores above the syndication threshold', () => {
    const a =
      'Harbor Foods Inc. said on Friday its board approved a quarterly dividend of $0.48 per share';
    const b =
      'Harbor Foods Inc said on Friday its board approved a quarterly dividend of $0.48 per share';
    expect(similarityRatio(a, b)).toBeGreaterThanOrEqual(0.85);
  });
});

describe('syndication dedupe', () => {
  test('5 near-identical copies of one wire story count as one independent source', () => {
    const body =
      'Harbor Foods Inc. said on Friday its board approved a quarterly dividend of $0.48 per share, up from $0.44, payable on October 15 to shareholders of record on October 1. The company also reaffirmed its full-year 2026 outlook of organic sales growth of 3% to 4%. Harbor Foods shares have gained 6% so far this year.';
    const articles: NewsArticleInput[] = [
      article({
        sourceId: 'gw-hrbf',
        content: body,
        publishedAt: new Date('2026-09-12T13:05:00Z'),
      }),
      article({
        sourceId: 'md-hrbf',
        content: body,
        publishedAt: new Date('2026-09-12T13:40:00Z'),
      }),
      article({
        sourceId: 'fna-hrbf',
        content: `(Reporting by staff) ${body}`,
        publishedAt: new Date('2026-09-12T14:10:00Z'),
      }),
      article({
        sourceId: 'ih-hrbf',
        content: body.replace(/Oct\. /g, 'Oct '),
        publishedAt: new Date('2026-09-12T14:55:00Z'),
      }),
      article({
        sourceId: 'ms-hrbf',
        content: body,
        publishedAt: new Date('2026-09-12T15:30:00Z'),
      }),
    ];
    const pre = run(articles, NOW);
    expect(pre.ok).toBe(true);
    expect(pre.independentSourceCount).toBe(1);
    expect(pre.sources[0]?.syndicatedCopyIds).toHaveLength(4);
    expect(pre.sources[0]?.sourceId).toBe('gw-hrbf'); // earliest is canonical
  });

  test('genuinely different articles about the same company are not merged', () => {
    const articles: NewsArticleInput[] = [
      article({
        sourceId: 'a1',
        content:
          'บมจ.อาร์คาเดีย รีเทล (ARCR) รายงานผลประกอบการ Q2 2026 รายได้รวม 12,400 ล้านบาท เพิ่มขึ้น 6% YoY กำไรสุทธิ 610 ล้านบาท',
        publishedAt: new Date('2026-09-12T11:00:00+07:00'),
      }),
      article({
        sourceId: 'a2',
        content:
          'ARCR เปิดเผยรายได้ไตรมาส 2 ปี 2026 อยู่ที่ 14,200 ล้านบาท เติบโต 21% YoY และมีกำไรสุทธิ 610 ล้านบาท ผู้บริหารระบุว่าการเติบโตมาจากการขยายสาขา',
        publishedAt: new Date('2026-09-12T13:30:00+07:00'),
      }),
    ];
    const pre = run(articles, NOW);
    expect(pre.independentSourceCount).toBe(2);
  });
});

describe('stale detection', () => {
  test('an article older than 72h relative to `now` is flagged stale', () => {
    const pre = run(
      [
        article({
          sourceId: 's1',
          publishedAt: new Date('2025-11-02T10:00:00+07:00'),
        }),
      ],
      NOW,
    );
    expect(pre.stale).toBe(true);
    expect(pre.warnings.map((w) => w.code)).toContain('AI_SOURCE_STALE');
  });

  test('an article within 72h of `now` is not flagged stale', () => {
    const pre = run(
      [
        article({
          sourceId: 's1',
          publishedAt: new Date('2026-09-12T12:00:00Z'),
        }),
      ],
      NOW,
    );
    expect(pre.stale).toBe(false);
  });

  test('exactly at the 72h boundary is not stale (strictly greater-than)', () => {
    const boundary = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
    const pre = run([article({ sourceId: 's1', publishedAt: boundary })], NOW);
    expect(pre.stale).toBe(false);
  });
});

describe('thin content and short-circuit', () => {
  test('content under 40 chars short-circuits to insufficient_data with no thin/stale flags required', () => {
    const pre = run(
      [
        article({
          sourceId: 's1',
          headline: 'ด่วน! SNRG ประกาศข่าวสำคัญ',
          content: '',
        }),
      ],
      NOW,
    );
    expect(pre.ok).toBe(true);
    expect(pre.shortCircuit).not.toBeNull();
    expect(pre.shortCircuit?.status).toBe('insufficient_data');
    expect(pre.shortCircuit?.data.headline).toBe('ด่วน! SNRG ประกาศข่าวสำคัญ');
    expect(pre.warnings.map((w) => w.code)).toContain('AI_INSUFFICIENT_DATA');
  });

  test(`content under ${MIN_CONTENT_CHARS} chars but non-empty still short-circuits`, () => {
    const pre = run([article({ sourceId: 's1', content: 'short' })], NOW);
    expect(pre.shortCircuit).not.toBeNull();
  });

  test(`content between ${MIN_CONTENT_CHARS} and ${THIN_CONTENT_CHARS} chars is flagged thin but not short-circuited`, () => {
    const pre = run(
      [article({ sourceId: 's1', content: 'x'.repeat(100) })],
      NOW,
    );
    expect(pre.shortCircuit).toBeNull();
    expect(pre.contentThin).toBe(true);
  });

  test(`content at or above ${THIN_CONTENT_CHARS} chars is not thin`, () => {
    const pre = run(
      [article({ sourceId: 's1', content: 'x'.repeat(THIN_CONTENT_CHARS) })],
      NOW,
    );
    expect(pre.contentThin).toBe(false);
  });
});

describe('input validation', () => {
  test('empty articles array is AI_INPUT_INVALID', () => {
    const pre = run([], NOW);
    expect(pre.ok).toBe(false);
    expect(pre.inputErrors.length).toBeGreaterThan(0);
  });

  test('sourceId with whitespace is rejected', () => {
    const pre = run([article({ sourceId: 'bad id' })], NOW);
    expect(pre.ok).toBe(false);
  });
});

describe('AI-NEWS-007 event clustering integration', () => {
  test('N-03 case: conflicting-revenue ARCR articles from two outlets share one eventId and both appear in eventClusters', () => {
    const a1 = article({
      sourceId: 'khd-arcr-0912',
      headline: 'ARCR กำไร Q2 610 ล้านบาท รายได้โต 6%',
      content:
        'บมจ.อาร์คาเดีย รีเทล (ARCR) รายงานผลประกอบการ Q2 2026 รายได้รวม 12,400 ล้านบาท เพิ่มขึ้น 6% YoY กำไรสุทธิ 610 ล้านบาท',
      publishedAt: new Date('2026-09-12T11:00:00+07:00'),
      relatedSymbols: ['ARCR'],
    });
    const a2 = article({
      sourceId: 'tto-arcr-0912',
      headline: 'ARCR รายได้ Q2 แตะ 14,200 ล้านบาท โต 21%',
      content:
        'ARCR เปิดเผยรายได้ไตรมาส 2 ปี 2026 อยู่ที่ 14,200 ล้านบาท เติบโต 21% YoY และมีกำไรสุทธิ 610 ล้านบาท',
      publishedAt: new Date('2026-09-12T13:30:00+07:00'),
      relatedSymbols: ['ARCR'],
    });
    const pre = run([a1, a2], NOW);
    expect(pre.ok).toBe(true);
    // Syndication layer: these are different text, so both remain independent sources.
    expect(pre.independentSourceCount).toBe(2);
    // Clustering layer: same event, one eventId, one cluster holding both source ids.
    expect(pre.eventClusters).toHaveLength(1);
    expect(new Set(pre.eventClusters?.[0]?.sourceIds)).toEqual(
      new Set(['khd-arcr-0912', 'tto-arcr-0912']),
    );
    expect(pre.eventClusters?.[0]?.eventId).toBe(pre.eventId);
  });

  test('two unrelated same-ticker stories on the same day get separate eventIds via eventClusters', () => {
    const earnings = article({
      sourceId: 'wire-earnings',
      headline:
        'Nova Robotics reports Q3 earnings beat, raises full-year guidance',
      content:
        'Nova Robotics said Q3 revenue was $812 million, up 14% year over year, and raised full-year guidance to $3.3 billion.',
      publishedAt: new Date('2026-09-12T09:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const recall = article({
      sourceId: 'wire-recall',
      headline:
        'Nova Robotics issues voluntary recall of home cleaning robot over battery fire risk',
      content:
        'Nova Robotics is recalling roughly 40,000 units of its home cleaning robot after reports of battery overheating.',
      publishedAt: new Date('2026-09-12T15:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const pre = run([earnings, recall], NOW);
    expect(pre.eventClusters).toHaveLength(2);
    const eventIds = new Set(pre.eventClusters?.map((c) => c.eventId));
    expect(eventIds.size).toBe(2);
    // The single top-level eventId names one primary cluster, not a blend of both.
    expect(pre.eventClusters?.some((c) => c.eventId === pre.eventId)).toBe(
      true,
    );
  });

  test('eventClusters is null when input validation fails', () => {
    const pre = run([], NOW);
    expect(pre.ok).toBe(false);
    expect(pre.eventClusters).toBeNull();
  });

  test('a single-article batch produces exactly one cluster containing it', () => {
    const pre = run([article({ sourceId: 'solo' })], NOW);
    expect(pre.eventClusters).toHaveLength(1);
    expect(pre.eventClusters?.[0]?.sourceIds).toEqual(['solo']);
    expect(pre.eventClusters?.[0]?.eventId).toBe(pre.eventId);
  });
});

describe('precheck outputs the service needs', () => {
  test('exposes sourceText, knownSourceIds, eventId, dataAsOf, independentSourceCount', () => {
    const pre = run(
      [
        article({
          sourceId: 's1',
          headline: 'H1',
          content: 'x'.repeat(50),
          publishedAt: new Date('2026-09-12T10:00:00Z'),
        }),
        article({
          sourceId: 's2',
          headline: 'H2 different story entirely about something else',
          content:
            'y'.repeat(60) +
            ' completely unrelated body text here for good measure',
          publishedAt: new Date('2026-09-13T08:00:00Z'),
        }),
      ],
      NOW,
    );
    expect(pre.sourceText).toContain('H1');
    expect(pre.sourceText).toContain('H2');
    expect(pre.knownSourceIds.has('s1')).toBe(true);
    expect(pre.knownSourceIds.has('s2')).toBe(true);
    expect(pre.eventId).toMatch(/^evt_[0-9a-f]{12}$/);
    expect(pre.dataAsOf?.toISOString()).toBe(
      new Date('2026-09-13T08:00:00Z').toISOString(),
    );
    expect(pre.independentSourceCount).toBe(2);
  });
});
