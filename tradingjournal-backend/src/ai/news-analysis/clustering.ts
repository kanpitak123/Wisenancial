/**
 * AI-NEWS-007 Event Clustering.
 *
 * `precheck.ts`'s syndication dedupe (Ratcliff/Obershelp similarity >= 0.85 on
 * normalised body text) only catches near-IDENTICAL text — five copies of the same
 * wire story. It says nothing about two DIFFERENT outlets independently reporting the
 * SAME event in their own words (spec 4.1 "Deduplicate syndicated news before
 * computing confidence" + AI-NEWS-007 "group articles from multiple outlets that are
 * one event; canonical event_id; keep every source; never let syndicated copies
 * inflate confidence").
 *
 * This module is the outer layer: given a batch of articles that have ALREADY been
 * through syndication dedupe (one canonical article per near-duplicate group), decide
 * which of those canonical articles describe the same real-world event.
 *
 * ---------------------------------------------------------------------------
 * Signals (each documented with which way its threshold errs — AI-NEWS-007 says
 * "precision matters more than recall": merging two different events about the same
 * ticker produces a confidently wrong analysis; failing to merge just produces two
 * separate (still individually correct) analyses):
 *
 * 1. Headline token overlap (TF-IDF-style cosine, computed over the WHOLE batch).
 *    Plain Jaccard was considered, but with batches as small as 2 articles (the
 *    common case — two outlets covering one event) a raw term-frequency scheme lets
 *    generic finance vocabulary ("baht", "quarter", "grew") dominate the score just
 *    as much as the terms that actually identify the event (the ticker, a proper
 *    noun, a specific figure). TF-IDF downweights whatever most of the batch's
 *    headlines share and rewards the rare, batch-specific terms two truly-related
 *    headlines are likely to both contain. Smoothed idf (`ln((1+N)/(1+df)) + 1`) is
 *    used so idf never hits zero even in a 2-document batch where a shared term has
 *    df == N — the classic degenerate case for TF-IDF on tiny corpora.
 *    Errs toward MISSING a match (false negative): a low headline score alone never
 *    forces a merge, it only ever contributes a fraction of the combined score.
 *
 * 2. `relatedSymbols` overlap (Jaccard). Two articles that both carry non-empty,
 *    completely disjoint symbol sets are almost certainly about different companies
 *    — that HARD-BLOCKS a merge regardless of every other signal. This is the single
 *    biggest precision guard in this module: it is the difference between "NVDA
 *    earnings" and "NVDA product recall" never being merged just because both are
 *    tagged NVDA and published the same day. When symbols are unknown (missing on
 *    either side) the signal is neutral (0.5) — absence of a symbol is not evidence
 *    of a different company, so it errs toward NOT blocking (false negative risk:
 *    an unrelated pair with no symbol data can still be merged on other signals).
 *
 * 3. Publication time proximity, linear decay to 0 over `EVENT_TIME_WINDOW_MS`
 *    (default 48h — most wire follow-ups land within hours, but slower outlets or
 *    a "developing story" can lag a day). Outside the window the pair is
 *    HARD-BLOCKED — errs toward MISSING a match (false negative): a real event
 *    reported more than 48h apart across outlets will not be merged, but that
 *    protects against merging two coincidentally-similar stories about the same
 *    ticker published days apart.
 *
 * 4. Numeric agreement (Jaccard over significant figures extracted from the body:
 *    amounts, percentages — bare 4-digit numbers that look like a year, and 1-digit
 *    numbers, are filtered out as too generic to mean anything). This is what lets
 *    N-03 (ARCR: two outlets disagree on revenue, 12,400m vs 14,200m, but both quote
 *    net profit of 610m) still cluster: the conflicting headline figure would BLOCK
 *    a naive "do the numbers match" check, but a *shared* figure elsewhere in the
 *    body is strong same-event evidence even when another figure conflicts — the
 *    conflict itself becomes an AI-NEWS-008 concern for the LLM step, not a reason
 *    to treat the articles as unrelated. If neither body has any significant number,
 *    this signal is 0 (no evidence), not neutral — errs toward NOT merging on thin
 *    bodies (false negative), which matches precheck's separate thin-content flag.
 *
 * Combined score = weighted sum of the four signals in [0,1], gated by the two hard
 * blocks above. `CLUSTER_MERGE_THRESHOLD` is deliberately on the high side (favours
 * false negatives = two separate analyses over false positives = one wrong merged
 * analysis).
 *
 * Clustering itself uses COMPLETE-linkage (a candidate must clear the threshold
 * against EVERY existing member of a cluster, not just one), which avoids "chaining"
 * — the classic single-linkage failure mode where A-B and B-C are each plausibly the
 * same event but A and C are not, yet all three end up merged. Complete-linkage is
 * the more conservative (precision-favouring) choice; the known false-negative cost
 * is a large batch of legitimately-related articles being fragmented into several
 * smaller clusters at the edges of similarity.
 *
 * ---------------------------------------------------------------------------
 * Thai handling: Thai script has no spaces between words, so naive whitespace
 * tokenisation either produces one giant unsplit blob or (if the source happens to
 * have spaces around numbers/punctuation, as our fixtures do) word-ish chunks that
 * are really multi-word compounds. Neither behaves like a token. This module first
 * splits on whitespace (a cheap, dependency-free approximation of "phrase" boundaries
 * that exists in almost all real headlines even in Thai), then, per chunk: a chunk
 * containing Thai script is expanded into overlapping character 3-grams
 * (`THAI_NGRAM_SIZE`), while a Latin/numeric chunk is kept as a single word token
 * (after stopword and single-character filtering). Character n-grams tolerate
 * inflection/compounding differences ("รายได้โต" vs "รายได้" share four of their
 * six 3-grams) that exact word matching would completely miss, which is exactly the
 * situation in the N-03 fixture's two Thai headlines.
 *
 * ---------------------------------------------------------------------------
 * Known false-positive mode: two genuinely different stories about the same ticker,
 * on the same day, that happen to share a generic figure (e.g. both mention "10%")
 * and enough generic headline vocabulary to push headline similarity up, could in
 * principle cross the threshold. The symbol-overlap signal does NOT block same-ticker
 * pairs (only disjoint-ticker pairs), so it cannot save this case by itself — the
 * headline TF-IDF and numeric-agreement signals are the only defense here. Mitigate
 * by keeping the threshold high and monitoring cluster sizes > 2 in production.
 *
 * Known false-negative mode: a real event covered by an outlet whose headline is
 * written very differently (translation, a strong editorial angle, or a follow-up
 * that leads with analyst reaction rather than the fact) and cites no overlapping
 * figures will likely NOT cluster. This fails safe (two separate, individually
 * correct analyses) rather than fails dangerous, per the spec's precision mandate.
 */

/** Minimal article shape this module needs — structurally compatible with `NewsArticleInput`. */
export interface ArticleForClustering {
  readonly sourceId: string;
  readonly headline: string;
  readonly content: string;
  readonly publishedAt: Date;
  readonly relatedSymbols?: readonly string[];
}

export interface EventCluster<
  T extends ArticleForClustering = ArticleForClustering,
> {
  /** Stable, deterministic id derived from the cluster's earliest headline. Not a security token. */
  readonly clusterId: string;
  readonly members: readonly T[];
}

export interface EventSignals {
  readonly headlineSimilarity: number;
  readonly symbolOverlap: number;
  readonly timeProximity: number;
  readonly numericAgreement: number;
}

export interface ClusterPairScore extends EventSignals {
  readonly combined: number;
  readonly blocked: boolean;
  readonly blockedReason:
    'disjoint_related_symbols' | 'outside_time_window' | null;
}

// --- Tunable thresholds -----------------------------------------------------
// See the module doc comment above for which direction each one errs.

export const THAI_NGRAM_SIZE = 3;

/** Beyond this, a pair is hard-blocked from clustering regardless of other signals. */
export const EVENT_TIME_WINDOW_MS = 48 * 60 * 60 * 1000;

export const HEADLINE_WEIGHT = 0.35;
export const SYMBOL_WEIGHT = 0.2;
export const TIME_WEIGHT = 0.15;
export const NUMERIC_WEIGHT = 0.3;

/**
 * Deliberately on the high side of the [0,1] combined-score range: precision (avoid
 * false merges) over recall (avoid missed merges). Calibrated against the fixtures:
 * N-03 (two outlets, same event, conflicting headline revenue figure but a shared
 * profit figure) combines to ~0.56 and must clear it; an unrelated same-ticker,
 * same-day pair (earnings vs. a product recall) combines to ~0.37 and must not — the
 * margin between those two numbers is the room this threshold has to work with.
 */
export const CLUSTER_MERGE_THRESHOLD = 0.55;

// --- Tokenisation -------------------------------------------------------------

const THAI_RANGE = /[฀-๿]/;

const STOPWORDS = new Set([
  // English function words — generic enough to be noise in a headline-overlap signal.
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'to',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'by',
  'at',
  'as',
  'its',
  'from',
  'said',
  'will',
  'has',
  'have',
  'had',
  'be',
  'this',
  'that',
  'it',
  // Thai particles/function words — kept as a word-level filter; Thai CONTENT words
  // still go through char n-grams below, where stopwords are not filtered (n-grams
  // are short enough that TF-IDF's document-frequency weighting handles common
  // fragments on its own).
  'ที่',
  'และ',
  'ของ',
  'ใน',
  'ให้',
  'ได้',
  'เป็น',
  'มี',
  'ว่า',
  'กับ',
  'จาก',
  'ไป',
  'มา',
  'นี้',
  'นั้น',
  'ก็',
  'ยัง',
  'ซึ่ง',
  'โดย',
  'อยู่',
  'ต่อ',
  'แต่',
  'คือ',
  'ตาม',
]);

function isThaiWord(word: string): boolean {
  return THAI_RANGE.test(word);
}

function charNGrams(s: string, n: number): string[] {
  if (s.length <= n) return [s];
  const grams: string[] = [];
  for (let i = 0; i <= s.length - n; i++) grams.push(s.slice(i, i + n));
  return grams;
}

/**
 * Splits text into words, then per word: Thai script -> character n-grams (no
 * word-spacing available), Latin/numeric -> the word itself (stopwords and
 * single-character tokens dropped as too generic to be event-identifying).
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  // \p{M} (combining marks) must be kept: Thai tone marks and vowel signs are
  // Unicode category Mn, not L, so excluding them would corrupt every Thai word.
  const stripped = normalized.replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ');
  const words = stripped.split(/\s+/).filter((w) => w.length > 0);
  const tokens: string[] = [];
  for (const w of words) {
    if (isThaiWord(w)) {
      for (const g of charNGrams(w, THAI_NGRAM_SIZE)) tokens.push(g);
    } else {
      if (w.length < 2) continue;
      if (STOPWORDS.has(w)) continue;
      tokens.push(w);
    }
  }
  return tokens;
}

/**
 * Cosine similarity between two token lists using smoothed TF-IDF weights, with
 * document frequency computed across `corpus` (every canonical article's tokenised
 * headline in the current batch — NOT some external/global corpus, so a term shared
 * by every headline in a small batch never accidentally scores as maximally rare).
 */
export function tfIdfCosine(
  tokensA: readonly string[],
  tokensB: readonly string[],
  corpus: readonly (readonly string[])[],
): number {
  const n = corpus.length;
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = (t: string): number =>
    Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1;

  function vector(tokens: readonly string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [t, c] of tf) vec.set(t, c * idf(t));
    return vec;
  }

  const va = vector(tokensA);
  const vb = vector(tokensB);
  let dot = 0;
  for (const [t, w] of va) {
    const wb = vb.get(t);
    if (wb !== undefined) dot += w * wb;
  }
  const normA = Math.sqrt([...va.values()].reduce((s, w) => s + w * w, 0));
  const normB = Math.sqrt([...vb.values()].reduce((s, w) => s + w * w, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// --- Other signals --------------------------------------------------------

/**
 * Significant numeric figures from a body: amounts and percentages. Bare 4-digit
 * numbers in a plausible year range (and no percent/comma grouping) are dropped —
 * "2026" appearing in both articles is not evidence they describe the same event.
 * Bare 1-digit numbers are dropped as too generic (quarter numbers, list counts).
 */
export function extractSignificantNumbers(text: string): Set<string> {
  const matches = text.match(/\d[\d,]*\.?\d*\s*%?/g) ?? [];
  const out = new Set<string>();
  for (const raw of matches) {
    const m = raw.trim();
    const isPercent = m.endsWith('%');
    const digits = m.replace(/%/g, '').replace(/,/g, '').trim();
    if (digits.length === 0) continue;
    const isYearLike =
      /^(19|20)\d{2}$/.test(digits) && !isPercent && !m.includes(',');
    if (isYearLike) continue;
    if (digits.replace('.', '').length < 2 && !isPercent) continue;
    out.add(isPercent ? `${digits}%` : digits);
  }
  return out;
}

function setJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0; // no evidence either way -> conservative, not neutral
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function symbolOverlap(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): { score: number; hardBlock: boolean } {
  const sa = new Set((a ?? []).map((s) => s.toUpperCase()));
  const sb = new Set((b ?? []).map((s) => s.toUpperCase()));
  if (sa.size === 0 || sb.size === 0) return { score: 0.5, hardBlock: false };
  const inter = [...sa].filter((x) => sb.has(x)).length;
  if (inter === 0) return { score: 0, hardBlock: true };
  const union = new Set([...sa, ...sb]).size;
  return { score: inter / union, hardBlock: false };
}

function timeProximity(
  a: Date,
  b: Date,
): { score: number; hardBlock: boolean } {
  const diff = Math.abs(a.getTime() - b.getTime());
  if (diff > EVENT_TIME_WINDOW_MS) return { score: 0, hardBlock: true };
  return { score: 1 - diff / EVENT_TIME_WINDOW_MS, hardBlock: false };
}

/** Weighted sum of the four [0,1] signals. Weights sum to 1. */
export function combinedScore(signals: EventSignals): number {
  return (
    HEADLINE_WEIGHT * signals.headlineSimilarity +
    SYMBOL_WEIGHT * signals.symbolOverlap +
    TIME_WEIGHT * signals.timeProximity +
    NUMERIC_WEIGHT * signals.numericAgreement
  );
}

// Guards the inclusive ">=" boundary against binary floating-point rounding of the
// weighted sum (e.g. 0.35*0.6 + 0.2*0.6 + 0.15*0.6 + 0.3*0.6 can land a hair under
// 0.6 rather than exactly on it) without weakening the threshold in any meaningful way.
const FLOAT_EPSILON = 1e-9;

/** `blocked` (a hard rule) always wins over the combined score. */
export function shouldMerge(signals: EventSignals, blocked: boolean): boolean {
  return (
    !blocked &&
    combinedScore(signals) >= CLUSTER_MERGE_THRESHOLD - FLOAT_EPSILON
  );
}

/**
 * Full pairwise comparison of two articles. `corpus` must be every article in the
 * current batch's tokenised headline (see `tfIdfCosine`), computed once per batch.
 */
export function pairScore(
  a: ArticleForClustering,
  b: ArticleForClustering,
  corpus: readonly (readonly string[])[],
): ClusterPairScore {
  const headlineSimilarity = tfIdfCosine(
    tokenize(a.headline),
    tokenize(b.headline),
    corpus,
  );
  const sym = symbolOverlap(a.relatedSymbols, b.relatedSymbols);
  const time = timeProximity(a.publishedAt, b.publishedAt);
  const numericAgreement = setJaccard(
    extractSignificantNumbers(a.content),
    extractSignificantNumbers(b.content),
  );
  const blocked = sym.hardBlock || time.hardBlock;
  const blockedReason: ClusterPairScore['blockedReason'] = sym.hardBlock
    ? 'disjoint_related_symbols'
    : time.hardBlock
      ? 'outside_time_window'
      : null;
  const signals: EventSignals = {
    headlineSimilarity,
    symbolOverlap: sym.score,
    timeProximity: time.score,
    numericAgreement,
  };
  return {
    ...signals,
    combined: blocked ? 0 : combinedScore(signals),
    blocked,
    blockedReason,
  };
}

// --- Non-cryptographic stable id (no new deps; not security-sensitive) ------

function stableId(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  let h2 = 0x9e3779b9 ^ input.length;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).slice(0, 12);
}

function earliestOf<T extends ArticleForClustering>(members: readonly T[]): T {
  return [...members].sort(
    (a, b) =>
      a.publishedAt.getTime() - b.publishedAt.getTime() ||
      a.sourceId.localeCompare(b.sourceId),
  )[0];
}

/**
 * Groups a batch of (already syndication-deduped) articles into same-event clusters.
 *
 * Deterministic: articles are processed in (publishedAt, sourceId) order, and a
 * candidate joins the existing cluster with the highest average pairwise score among
 * those where it clears `CLUSTER_MERGE_THRESHOLD` against EVERY current member
 * (complete-linkage — see module doc comment for why this is the precision-favouring
 * choice over single-linkage transitive chaining).
 */
export function clusterArticles<T extends ArticleForClustering>(
  articles: readonly T[],
): Array<EventCluster<T>> {
  if (articles.length === 0) return [];
  const corpus = articles.map((a) => tokenize(a.headline));
  const ordered = [...articles].sort(
    (a, b) =>
      a.publishedAt.getTime() - b.publishedAt.getTime() ||
      a.sourceId.localeCompare(b.sourceId),
  );

  const clusters: T[][] = [];
  for (const article of ordered) {
    let bestIdx = -1;
    let bestAvg = -1;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      let allClear = true;
      let sum = 0;
      for (const member of cluster) {
        const ps = pairScore(article, member, corpus);
        if (!shouldMerge(ps, ps.blocked)) {
          allClear = false;
          break;
        }
        sum += ps.combined;
      }
      if (!allClear) continue;
      const avg = sum / cluster.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      clusters[bestIdx].push(article);
    } else {
      clusters.push([article]);
    }
  }

  return clusters.map((members) => ({
    clusterId:
      'evtc_' +
      stableId(
        tokenize(earliestOf(members).headline).join(' ') ||
          earliestOf(members).sourceId,
      ),
    members,
  }));
}
