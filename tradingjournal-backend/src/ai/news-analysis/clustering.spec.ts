/**
 * AI-NEWS-007 event clustering tests.
 *
 * Uses the real golden fixtures (N-03, N-08) plus synthetic cases for the precision
 * test that matters most (two different same-ticker, same-day stories must NOT
 * merge), Thai/English mixed batches, single-article and empty batches, and
 * threshold boundary behaviour.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  clusterArticles,
  tokenize,
  tfIdfCosine,
  extractSignificantNumbers,
  combinedScore,
  shouldMerge,
  pairScore,
  CLUSTER_MERGE_THRESHOLD,
  HEADLINE_WEIGHT,
  SYMBOL_WEIGHT,
  TIME_WEIGHT,
  NUMERIC_WEIGHT,
  EVENT_TIME_WINDOW_MS,
  type ArticleForClustering,
  type EventSignals,
} from './clustering';

function art(
  overrides: Partial<ArticleForClustering> &
    Pick<ArticleForClustering, 'sourceId'>,
): ArticleForClustering {
  return {
    headline: 'headline',
    content: '',
    publishedAt: new Date('2026-09-12T12:00:00Z'),
    ...overrides,
  };
}

function loadGolden(id: string): {
  articles: readonly ArticleForClustering[];
} {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'golden', `${id}.json`), 'utf-8'),
  ) as {
    request: {
      articles: ReadonlyArray<{
        sourceId: string;
        headline: string;
        content: string;
        publishedAt: string;
        relatedSymbols?: readonly string[];
      }>;
    };
  };
  return {
    articles: raw.request.articles.map((a) => ({
      sourceId: a.sourceId,
      headline: a.headline,
      content: a.content,
      publishedAt: new Date(a.publishedAt),
      ...(a.relatedSymbols !== undefined
        ? { relatedSymbols: a.relatedSymbols }
        : {}),
    })),
  };
}

describe('weights sanity', () => {
  test('signal weights sum to 1', () => {
    expect(
      HEADLINE_WEIGHT + SYMBOL_WEIGHT + TIME_WEIGHT + NUMERIC_WEIGHT,
    ).toBeCloseTo(1);
  });
});

describe('tokenize', () => {
  test('Latin words become word tokens, stopwords and single letters dropped', () => {
    const tokens = tokenize(
      'Harbor Foods raises the dividend to $0.48 a share',
    );
    expect(tokens).toContain('harbor');
    expect(tokens).toContain('foods');
    expect(tokens).toContain('dividend');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('a');
  });

  test('Thai words expand into overlapping character 3-grams', () => {
    const tokens = tokenize('รายได้');
    // "รายได้" has 6 characters -> 4 overlapping 3-grams.
    expect(tokens.length).toBe(4);
    for (const t of tokens) expect(t.length).toBe(3);
  });

  test('Thai words sharing a common stem share most of their n-grams', () => {
    const a = new Set(tokenize('รายได้โต'));
    const b = new Set(tokenize('รายได้'));
    const shared = [...b].filter((t) => a.has(t));
    expect(shared.length).toBeGreaterThanOrEqual(4);
  });

  test('mixed Thai/English headline tokenises both scripts', () => {
    const tokens = tokenize('ARCR กำไร Q2 610 ล้านบาท');
    expect(tokens).toContain('arcr');
    expect(tokens).toContain('q2');
    expect(tokens).toContain('610');
    expect(tokens.some((t) => t.length === 3 && /[฀-๿]/.test(t))).toBe(true);
  });
});

describe('tfIdfCosine', () => {
  test('identical headlines score 1', () => {
    const toks = tokenize('Nvidia beats revenue expectations');
    expect(tfIdfCosine(toks, toks, [toks, toks])).toBeCloseTo(1);
  });

  test('completely disjoint headlines score 0', () => {
    const a = tokenize('Nvidia beats revenue expectations');
    const b = tokenize('typhoon disrupts shipping routes');
    expect(tfIdfCosine(a, b, [a, b])).toBe(0);
  });

  test('a term common to every document in the batch is downweighted vs a batch-rare shared term', () => {
    // "quarterly" appears in all three headlines (generic); "harbor" only in the two
    // that are actually about the same company. TF-IDF should let the rare shared
    // term dominate over the generic one.
    const common = tokenize('company reports quarterly results today');
    const a = tokenize('harbor foods reports quarterly dividend increase');
    const b = tokenize('harbor foods raises quarterly payout again');
    const corpus = [common, a, b];
    const simAB = tfIdfCosine(a, b, corpus);
    const simCommonA = tfIdfCosine(common, a, corpus);
    expect(simAB).toBeGreaterThan(simCommonA);
  });
});

describe('extractSignificantNumbers', () => {
  test('extracts amounts and percentages, drops bare years and single digits', () => {
    const nums = extractSignificantNumbers(
      'ARCR รายงาน Q2 2026 กำไร 610 ล้านบาท เติบโต 6%',
    );
    expect(nums.has('610')).toBe(true);
    expect(nums.has('6%')).toBe(true);
    expect(nums.has('2026')).toBe(false); // year-like, filtered
    expect(nums.has('2')).toBe(false); // single digit ("Q2"), filtered
  });

  test('comma-grouped thousands are normalised to a single token', () => {
    const nums = extractSignificantNumbers('revenue of 12,400 million baht');
    expect(nums.has('12400')).toBe(true);
  });

  test('no significant numbers on either side yields zero agreement, not neutral', () => {
    const score = pairScore(
      art({ sourceId: 'a', headline: 'x', content: 'no numbers here at all' }),
      art({
        sourceId: 'b',
        headline: 'x',
        content: 'still nothing numeric in this one',
      }),
      [[], []],
    );
    expect(score.numericAgreement).toBe(0);
  });
});

describe('combinedScore / shouldMerge boundary behaviour', () => {
  function signalsAt(v: number): EventSignals {
    return {
      headlineSimilarity: v,
      symbolOverlap: v,
      timeProximity: v,
      numericAgreement: v,
    };
  }

  test('all four signals at the threshold produce a combined score exactly at the threshold (weights sum to 1)', () => {
    expect(combinedScore(signalsAt(CLUSTER_MERGE_THRESHOLD))).toBeCloseTo(
      CLUSTER_MERGE_THRESHOLD,
    );
  });

  test('exactly at the threshold merges (>=, inclusive boundary)', () => {
    expect(shouldMerge(signalsAt(CLUSTER_MERGE_THRESHOLD), false)).toBe(true);
  });

  test('just below the threshold does not merge', () => {
    expect(shouldMerge(signalsAt(CLUSTER_MERGE_THRESHOLD - 0.01), false)).toBe(
      false,
    );
  });

  test('a hard block overrides an otherwise-passing combined score', () => {
    expect(shouldMerge(signalsAt(1), true)).toBe(false);
  });
});

describe('pairScore hard blocks', () => {
  test('disjoint related symbols hard-block a merge regardless of other similarity', () => {
    const a = art({
      sourceId: 'a',
      headline: 'same words here',
      relatedSymbols: ['AAA'],
    });
    const b = art({
      sourceId: 'b',
      headline: 'same words here',
      relatedSymbols: ['ZZZ'],
    });
    const score = pairScore(a, b, [tokenize(a.headline), tokenize(b.headline)]);
    expect(score.blocked).toBe(true);
    expect(score.blockedReason).toBe('disjoint_related_symbols');
  });

  test('publication times more than the event time window apart hard-block a merge', () => {
    const a = art({
      sourceId: 'a',
      headline: 'same words here',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const b = art({
      sourceId: 'b',
      headline: 'same words here',
      publishedAt: new Date(
        new Date('2026-01-01T00:00:00Z').getTime() +
          EVENT_TIME_WINDOW_MS +
          1000,
      ),
    });
    const score = pairScore(a, b, [tokenize(a.headline), tokenize(b.headline)]);
    expect(score.blocked).toBe(true);
    expect(score.blockedReason).toBe('outside_time_window');
  });

  test('missing symbols on either side is neutral, not blocking', () => {
    const a = art({ sourceId: 'a', headline: 'x' });
    const b = art({ sourceId: 'b', headline: 'x', relatedSymbols: ['AAA'] });
    const score = pairScore(a, b, [tokenize(a.headline), tokenize(b.headline)]);
    expect(score.blocked).toBe(false);
    expect(score.symbolOverlap).toBe(0.5);
  });
});

describe('clusterArticles: batch edge cases', () => {
  test('empty batch returns no clusters', () => {
    expect(clusterArticles([])).toEqual([]);
  });

  test('a single article is its own cluster', () => {
    const clusters = clusterArticles([art({ sourceId: 'only' })]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members.map((m) => m.sourceId)).toEqual(['only']);
  });
});

describe('clusterArticles: N-08 (5 syndicated copies)', () => {
  test('after syndication dedupe there is exactly 1 canonical article, so exactly 1 cluster of 1', () => {
    // clustering.ts operates on already-deduped canonical articles; precheck.ts is
    // what performs syndication dedupe first (see precheck.spec.ts for that layer).
    // Here we confirm that a single canonical Harbor Foods article clusters alone.
    const { articles } = loadGolden('N-08');
    const canonical = [articles[0]];
    const clusters = clusterArticles(canonical);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members).toHaveLength(1);
  });
});

describe('clusterArticles: N-03 (conflicting ARCR revenue figures)', () => {
  test('two different outlets, same event, conflicting revenue but matching profit -> ONE cluster of 2', () => {
    const { articles } = loadGolden('N-03');
    expect(articles).toHaveLength(2);
    const clusters = clusterArticles(articles);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members).toHaveLength(2);
    expect(new Set(clusters[0]?.members.map((m) => m.sourceId))).toEqual(
      new Set(['khd-arcr-0912', 'tto-arcr-0912']),
    );
  });
});

describe('clusterArticles: precision test — same ticker, same day, different stories must NOT merge', () => {
  test('an earnings story and an unrelated product-recall story about the same company stay separate', () => {
    const earnings = art({
      sourceId: 'wire-earnings',
      headline:
        'Nova Robotics reports Q3 earnings beat, raises full-year guidance',
      content:
        'Nova Robotics said Q3 revenue was $812 million, up 14% year over year, and raised full-year guidance to $3.3 billion. Net income rose to $95 million.',
      publishedAt: new Date('2026-09-12T09:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const recall = art({
      sourceId: 'wire-recall',
      headline:
        'Nova Robotics issues voluntary recall of home cleaning robot over battery fire risk',
      content:
        'Nova Robotics is recalling roughly 40,000 units of its home cleaning robot after reports of battery overheating. No injuries have been reported. Customers can request a free replacement.',
      publishedAt: new Date('2026-09-12T15:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const clusters = clusterArticles([earnings, recall]);
    expect(clusters).toHaveLength(2);
  });

  test('two different companies in the same sector, same day, are not merged even with similar headlines', () => {
    const a = art({
      sourceId: 'a',
      headline: 'Retailer ARCR posts strong quarterly sales growth',
      content:
        'ARCR same-store sales rose 5% in the quarter, beating expectations.',
      publishedAt: new Date('2026-09-12T09:00:00Z'),
      relatedSymbols: ['ARCR'],
    });
    const b = art({
      sourceId: 'b',
      headline: 'Retailer MEGA posts strong quarterly sales growth',
      content:
        'MEGA same-store sales rose 5% in the quarter, beating expectations.',
      publishedAt: new Date('2026-09-12T09:30:00Z'),
      relatedSymbols: ['MEGA'],
    });
    const clusters = clusterArticles([a, b]);
    expect(clusters).toHaveLength(2);
  });
});

describe('clusterArticles: Thai and English articles about the same event', () => {
  test('a Thai-language and an English-language report of the same event cluster together', () => {
    const th = art({
      sourceId: 'th-1',
      headline: 'ARCR กำไรสุทธิไตรมาส 2 โต 610 ล้านบาท',
      content:
        'ARCR รายงานกำไรสุทธิไตรมาส 2 ที่ 610 ล้านบาท เพิ่มขึ้นจากปีก่อน',
      publishedAt: new Date('2026-09-12T09:00:00Z'),
      relatedSymbols: ['ARCR'],
    });
    const en = art({
      sourceId: 'en-1',
      headline: 'ARCR posts Q2 net profit of 610 million baht',
      content:
        'ARCR reported second-quarter net profit of 610 million baht, up from a year earlier.',
      publishedAt: new Date('2026-09-12T10:30:00Z'),
      relatedSymbols: ['ARCR'],
    });
    const clusters = clusterArticles([th, en]);
    expect(clusters).toHaveLength(1);
  });
});

describe('clusterArticles: complete-linkage avoids chaining', () => {
  test('A-B similar and B-C similar but A-C dissimilar does not force all three into one cluster', () => {
    // B is deliberately built to be plausibly similar to BOTH A and C (shared symbol,
    // close in time, some numeric overlap with each), but A and C share nothing.
    const a = art({
      sourceId: 'a',
      headline: 'Nova Robotics wins new government contract worth $200 million',
      content:
        'Nova Robotics announced a new contract worth $200 million with a government agency.',
      publishedAt: new Date('2026-09-12T08:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const b = art({
      sourceId: 'b',
      headline:
        'Nova Robotics stock rises on contract win and separate recall news',
      content:
        'Shares of Nova Robotics moved after a $200 million contract win and a product recall were both reported today.',
      publishedAt: new Date('2026-09-12T09:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const c = art({
      sourceId: 'c',
      headline: 'Nova Robotics recalls cleaning robot over battery fire risk',
      content:
        'Nova Robotics is recalling its home cleaning robot after battery fire reports; no injuries reported.',
      publishedAt: new Date('2026-09-12T10:00:00Z'),
      relatedSymbols: ['NOVA'],
    });
    const clusters = clusterArticles([a, b, c]);
    // Complete-linkage requirement: no cluster may contain both `a` and `c` unless
    // pairScore(a, c) itself clears the threshold, which it should not (disjoint topics).
    for (const cluster of clusters) {
      const ids = cluster.members.map((m) => m.sourceId);
      if (ids.includes('a') && ids.includes('c')) {
        throw new Error(
          'A and C were chained together through B despite being dissimilar',
        );
      }
    }
  });
});
