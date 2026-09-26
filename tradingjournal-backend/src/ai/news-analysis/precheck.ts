/**
 * Deterministic steps that run BEFORE the LLM.
 * Ported from `ai_core/precheck.py` in the Python reference implementation.
 *
 * Covers:
 * - syndicated-copy dedupe by normalised text similarity >= 0.85 (near-identical
 *   copies of the same wire story count as ONE independent source)
 * - AI-NEWS-007 event clustering (see `./clustering.ts`) layered on top of dedupe:
 *   different outlets' own-words coverage of the same event share one canonical
 *   `eventId`/`eventClusters` entry without folding their `independentSourceCount`
 *   together the way syndication dedupe does
 * - stale detection (72h) against an injected `now`
 * - thin-content flag (<300 chars)
 * - short-circuit to `insufficient_data` when the longest body is under 40 chars
 *   (no model call at all)
 */

import type { NewsArticleInput, LlmNewsOutput, WarningCode } from './types';
import { clusterArticles } from './clustering';

export const STALE_AFTER_MS = 72 * 60 * 60 * 1000;
export const MIN_CONTENT_CHARS = 40;
export const THIN_CONTENT_CHARS = 300;
export const SYNDICATION_SIMILARITY = 0.85;

export interface PrecheckSource {
  readonly sourceId: string;
  readonly name: string;
  readonly publishedAt: Date;
  readonly url: string | null;
  /** source_ids of articles folded into this canonical entry as near-duplicates. */
  readonly syndicatedCopyIds: readonly string[];
}

/** One AI-NEWS-007 event cluster: a canonical event id plus the independent source ids in it. */
export interface PrecheckEventCluster {
  readonly eventId: string;
  readonly sourceIds: readonly string[];
}

export interface PrecheckWarning {
  readonly code: WarningCode;
  readonly message: string;
}

/** Result of the pre-check step; everything the service and prompt need. */
export interface PrecheckResult {
  readonly ok: boolean;
  /** Canonical article per syndication group (syndicated copies removed). */
  readonly articles: readonly NewsArticleInput[];
  readonly sources: readonly PrecheckSource[];
  readonly knownSourceIds: ReadonlySet<string>;
  readonly independentSourceCount: number;
  readonly eventId: string | null;
  /**
   * Richer AI-NEWS-007 detail: every same-event cluster found among the canonical
   * (post-syndication-dedupe) articles, not just the primary one `eventId` names.
   * Additive/optional so existing consumers that only read `eventId` /
   * `independentSourceCount` are unaffected. `null` when precheck short-circuited
   * on input errors (no clustering was attempted).
   */
  readonly eventClusters: readonly PrecheckEventCluster[] | null;
  readonly dataAsOf: Date | null;
  readonly stale: boolean;
  readonly contentThin: boolean;
  readonly warnings: readonly PrecheckWarning[];
  /** Deterministic LLM-output-shaped result when no LLM call is needed. */
  readonly shortCircuit: LlmNewsOutput | null;
  readonly inputErrors: readonly string[];
  /** Every headline + body concatenated, used later for numeric-grounding checks. */
  readonly sourceText: string;
}

/** NFKC-normalise, lowercase, strip punctuation, collapse whitespace. */
function normalize(text: string): string {
  const nfkc = text.normalize('NFKC').toLowerCase();
  const noPunct = nfkc.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return noPunct.replace(/\s+/g, ' ').trim();
}

/**
 * Similarity ratio between two strings in [0, 1], matching Python's
 * difflib.SequenceMatcher.ratio() semantics: 2 * M / T where M is the number
 * of matching characters found by a longest-matching-block recursive algorithm
 * and T is the total length of both strings.
 */
export function similarityRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const matches = matchingBlocksLength(a, b);
  return (2 * matches) / (a.length + b.length);
}

function matchingBlocksLength(a: string, b: string): number {
  let total = 0;
  const stack: Array<[number, number, number, number]> = [
    [0, a.length, 0, b.length],
  ];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) continue;
    const [alo, ahi, blo, bhi] = frame;
    const match = longestMatch(a, alo, ahi, b, blo, bhi);
    if (match === null) continue;
    const [i, j, size] = match;
    total += size;
    if (alo < i && blo < j) stack.push([alo, i, blo, j]);
    if (i + size < ahi && j + size < bhi)
      stack.push([i + size, ahi, j + size, bhi]);
  }
  return total;
}

/** Find the longest matching contiguous substring within the given ranges. */
function longestMatch(
  a: string,
  alo: number,
  ahi: number,
  b: string,
  blo: number,
  bhi: number,
): [number, number, number] | null {
  let bestI = alo;
  let bestJ = blo;
  let bestSize = 0;
  // j2len[j] = length of the match ending at b[j-1] for the previous row.
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const newJ2Len = new Map<number, number>();
    const ch = a[i];
    for (let j = blo; j < bhi; j++) {
      if (b[j] === ch) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2Len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2Len;
  }
  if (bestSize === 0) return null;
  return [bestI, bestJ, bestSize];
}

function bodySimilarity(a: NewsArticleInput, b: NewsArticleInput): number {
  return similarityRatio(normalize(a.content), normalize(b.content));
}

/** Greedy grouping of near-duplicate bodies. Earliest article in each group is canonical. */
function groupSyndicated(
  articles: readonly NewsArticleInput[],
): NewsArticleInput[][] {
  const sorted = [...articles].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
  );
  const groups: NewsArticleInput[][] = [];
  for (const article of sorted) {
    let placed = false;
    for (const group of groups) {
      const canonical = group[0];
      if (
        canonical &&
        article.content.trim() !== '' &&
        bodySimilarity(canonical, article) >= SYNDICATION_SIMILARITY
      ) {
        group.push(article);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([article]);
  }
  return groups;
}

function sha1Hex(input: string): string {
  // Minimal dependency-free SHA-1 (no new dependencies allowed). Only used to
  // build a short, stable, non-secret event id — not for anything security sensitive.
  function rotl(n: number, s: number): number {
    return (n << s) | (n >>> (32 - s));
  }
  const utf8 = unescape(encodeURIComponent(input));
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const w = new Array<number>(80).fill(0);
    for (let i = 0; i < 16; i++) {
      const o = chunkStart + i * 4;
      w[i] =
        ((bytes[o] ?? 0) << 24) |
        ((bytes[o + 1] ?? 0) << 16) |
        ((bytes[o + 2] ?? 0) << 8) |
        (bytes[o + 3] ?? 0);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(
        (w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0),
        1,
      );
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

function insufficientResult(
  sourceHeadline: string,
  warnings: readonly PrecheckWarning[],
): LlmNewsOutput {
  return {
    status: 'insufficient_data',
    confidence: 0.1,
    confidenceReason: 'ไม่มีเนื้อหาข่าวให้วิเคราะห์ ระบบจึงไม่สร้างบทวิเคราะห์',
    warnings: warnings.map((w) => ({ code: w.code, message: w.message })),
    data: {
      headline: sourceHeadline,
      summary: [
        'ข่าวนี้มีเพียงหัวข้อ ไม่มีเนื้อหาเพียงพอสำหรับสรุปหรือประเมินผลกระทบ',
      ],
      positiveFactors: [],
      negativeFactors: [],
      counterpointNote: 'ไม่มีเนื้อหาข่าว จึงไม่สามารถระบุปัจจัยบวกหรือลบได้',
      newsTone: null,
      sentiment: null,
      sentimentReason: null,
      impact: { shortTerm: null, mediumTerm: null, longTerm: null },
      affected: [],
      claimStatus: 'unconfirmed',
      conflicts: [],
      missingContext: ['article_content'],
    },
  };
}

/** Basic structural validation of the input, mirroring the JSON-schema `news_input.schema.json`. */
function validateInput(articles: readonly NewsArticleInput[]): string[] {
  const errors: string[] = [];
  if (articles.length === 0) {
    errors.push('articles: must contain at least 1 item');
    return errors;
  }
  if (articles.length > 50) {
    errors.push('articles: must contain at most 50 items');
  }
  articles.forEach((a, i) => {
    if (!a.headline || a.headline.length < 1)
      errors.push(`articles[${i}].headline: required`);
    if (typeof a.content !== 'string')
      errors.push(`articles[${i}].content: required`);
    if (!a.source || a.source.length < 1)
      errors.push(`articles[${i}].source: required`);
    if (!(a.publishedAt instanceof Date) || isNaN(a.publishedAt.getTime())) {
      errors.push(`articles[${i}].publishedAt: required, must be a valid Date`);
    }
    if (!a.sourceId || /\s/.test(a.sourceId)) {
      errors.push(
        `articles[${i}].sourceId: required, must not contain whitespace`,
      );
    }
  });
  return errors;
}

export function run(
  articles: readonly NewsArticleInput[],
  now: Date,
): PrecheckResult {
  const inputErrors = validateInput(articles);
  if (inputErrors.length > 0) {
    return {
      ok: false,
      articles: [],
      sources: [],
      knownSourceIds: new Set(),
      independentSourceCount: 0,
      eventId: null,
      eventClusters: null,
      dataAsOf: null,
      stale: false,
      contentThin: false,
      warnings: [],
      shortCircuit: null,
      inputErrors,
      sourceText: '',
    };
  }

  const groups = groupSyndicated(articles);
  const canonical = groups
    .map((g) => g[0])
    .filter((a): a is NewsArticleInput => a !== undefined);

  const sources: PrecheckSource[] = groups.map((g) => {
    const head = g[0];
    return {
      sourceId: head.sourceId,
      name: head.source,
      publishedAt: head.publishedAt,
      url: head.url ?? null,
      syndicatedCopyIds: g.slice(1).map((a) => a.sourceId),
    };
  });

  const latest = articles.reduce((a, b) =>
    b.publishedAt.getTime() > a.publishedAt.getTime() ? b : a,
  );

  // AI-NEWS-007: group the canonical (post-syndication-dedupe) articles into
  // same-event clusters. `independentSourceCount` above stays the syndication-only
  // count (each cluster keeps every one of its independent sources — clustering
  // never inflates or reduces it). `eventId` names the PRIMARY cluster (most
  // members, earliest tie-break) so a batch that unexpectedly mixes two distinct
  // events still returns one usable id; the full breakdown is in `eventClusters`.
  const rawClusters = clusterArticles(canonical);
  const eventClusters: PrecheckEventCluster[] = rawClusters.map((cluster) => {
    const clusterEarliest = cluster.members.reduce((a, b) =>
      b.publishedAt.getTime() < a.publishedAt.getTime() ? b : a,
    );
    return {
      eventId:
        'evt_' + sha1Hex(normalize(clusterEarliest.headline)).slice(0, 12),
      sourceIds: cluster.members.map((m) => m.sourceId),
    };
  });
  let primaryClusterIndex = 0;
  for (let i = 1; i < rawClusters.length; i++) {
    const current = rawClusters[i];
    const primary = rawClusters[primaryClusterIndex];
    if (current.members.length > primary.members.length) {
      primaryClusterIndex = i;
    } else if (current.members.length === primary.members.length) {
      const currentEarliestMs = Math.min(
        ...current.members.map((m) => m.publishedAt.getTime()),
      );
      const primaryEarliestMs = Math.min(
        ...primary.members.map((m) => m.publishedAt.getTime()),
      );
      if (currentEarliestMs < primaryEarliestMs) primaryClusterIndex = i;
    }
  }
  const primaryEventId = eventClusters[primaryClusterIndex]?.eventId ?? null;

  const warnings: PrecheckWarning[] = [];
  const age = now.getTime() - latest.publishedAt.getTime();
  const stale = age > STALE_AFTER_MS;
  if (stale) {
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    warnings.push({
      code: 'AI_SOURCE_STALE',
      message: `ข่าวล่าสุดเผยแพร่เมื่อ ${latest.publishedAt.toISOString()} (${days} วันก่อน) ข้อมูลอาจไม่เป็นปัจจุบัน`,
    });
  }

  const longestBody = Math.max(...articles.map((a) => a.content.trim().length));
  let contentThin = false;
  let shortCircuit: LlmNewsOutput | null = null;
  if (longestBody < MIN_CONTENT_CHARS) {
    warnings.push({
      code: 'AI_INSUFFICIENT_DATA',
      message: 'ไม่มีเนื้อหาข่าวเพียงพอสำหรับการวิเคราะห์ (มีเพียงหัวข้อข่าว)',
    });
    shortCircuit = insufficientResult(latest.headline, warnings);
  } else if (longestBody < THIN_CONTENT_CHARS) {
    contentThin = true;
  }

  return {
    ok: true,
    articles: canonical,
    sources,
    knownSourceIds: new Set(articles.map((a) => a.sourceId)),
    independentSourceCount: groups.length,
    eventId: primaryEventId,
    eventClusters,
    dataAsOf: latest.publishedAt,
    stale,
    contentThin,
    warnings,
    shortCircuit,
    inputErrors: [],
    sourceText: articles.map((a) => `${a.headline}\n${a.content}`).join('\n'),
  };
}
