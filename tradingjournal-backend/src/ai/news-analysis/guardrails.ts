/**
 * Post-LLM checks (Appendix B: Schema Validation -> Safety/Neutrality Check).
 *
 * Ported from `ai_core/guardrails.py`. Every check returns Issues; level="error" blocks
 * the output (retry, then fallback), level="warning" is logged for QA review but still
 * shown to the user. Each rule keeps its spec-id tag in the message so failures can be
 * traced back to `docs/decisions.md` / the requirements doc.
 */

import type {
  Factor,
  GuardrailIssue,
  LlmNewsOutput,
  NewsAnalysis,
} from './types';

/** What the Python `Precheck` provided to the checks. */
export interface GuardrailContext {
  /** Every headline + body concatenated, used for numeric grounding. */
  readonly sourceText: string;
  readonly knownSourceIds: ReadonlySet<string>;
  readonly stale: boolean;
}

// AI-NEWS-001 says ~80-120; doc examples are 71-79 (D-04 in docs/decisions.md).
const HEADLINE_CHARS: readonly [number, number] = [60, 120];

// D-08 in docs/decisions.md.
const CONFIDENCE_CAPS = {
  insufficient_data: 0.4,
  conflict: 0.6,
  unverified_claim: 0.6,
  stale: 0.7,
} as const;

// AI-SAFE-001 / section 13: guarantees, direct commands, false probability, certain causality.
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /ขึ้นแน่/i,
  /ลงแน่/i,
  /พุ่งแน่/i,
  /กำไรแน่/i,
  /รวยแน่/i,
  /ไม่มีทางขาดทุน/i,
  /รับประกัน(ผลตอบแทน|กำไร)/i,
  /(?<!ไม่)(?<!ไม่มี)การันตี/i,
  /ซื้อเลย/i,
  /ขายเลย/i,
  /ขายทั้งหมด/i,
  /ต้องซื้อ/i,
  /ควร(ซื้อ|ขาย)ทันที/i,
  /ห้ามพลาด/i,
  /เพราะข่าวนี้แน่นอน/i,
  /\bguaranteed?\b/i,
  /\bwill (definitely|surely)\b/i,
  /\bbuy now\b/i,
  /\bsell everything\b/i,
  /\bcan'?t lose\b/i,
  /\brisk[- ]free\b/i,
  /\d+(\.\d+)?\s*%\s*(chance|probability|โอกาส)/i,
  /(โอกาส|chance|probability)(ที่)?\s*\d+(\.\d+)?\s*%/i,
];

// AI-GEN-005: emotive / clickbait wording. Allowed only with context, so flag for review.
const SENSATIONAL_PATTERNS: readonly RegExp[] = [
  /ถล่ม/i,
  /โอกาสทอง/i,
  /พุ่งแรง/i,
  /ร่วงหนัก/i,
  /ดิ่งเหว/i,
  /ทะยาน/i,
  /สุดปัง/i,
  /แตกตื่น/i,
  /\bskyrocket/i,
  /\bplunge/i,
  /\bcrash/i,
  /\bsoar/i,
];

const CONDITIONAL_WORDS: readonly string[] = [
  'อาจ',
  'หาก',
  'ถ้า',
  'เป็นไปได้',
  'may',
  'might',
  'could',
  'if ',
  'potential',
];
const PROBABILITY_WORDS = /%|ความน่าจะเป็น|probability|chance/i;
const NUMBER = /\d+(?:[.,]\d+)*/g;

// Source says "two to three quarters", output says "2-3 ไตรมาส": same number, not a fabrication.
const EN_NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
const EN_ORDINALS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];
const TH_NUMBER_WORDS = [
  '',
  'หนึ่ง',
  'สอง',
  'สาม',
  'สี่',
  'ห้า',
  'หก',
  'เจ็ด',
  'แปด',
  'เก้า',
  'สิบ',
];

const NUMBER_WORDS: Record<string, string> = {};
EN_NUMBER_WORDS.forEach((w, i) => {
  NUMBER_WORDS[w] = String(i);
});
EN_ORDINALS.forEach((w, i) => {
  if (w) NUMBER_WORDS[w] = String(i);
});
TH_NUMBER_WORDS.forEach((w, i) => {
  if (w) NUMBER_WORDS[w] = String(i);
});

const isAsciiWord = (w: string): boolean => /^[a-zA-Z]+$/.test(w);
const ASCII_NUMBER_WORDS = Object.keys(NUMBER_WORDS).filter(isAsciiWord);
const EN_WORD_RE = new RegExp(`\\b(${ASCII_NUMBER_WORDS.join('|')})\\b`, 'gi');

// Period labels are not financial figures ("second-quarter" in source -> "Q2" in Thai output).
const PERIOD_LABEL = /\b(Q[1-4]|[12]H|H[12])\b|ไตรมาส(ที่)?\s*[1-4]/gi;

/** Character count as a reader sees it: Thai above/below vowels and tone marks don't add width. */
export function visibleLength(text: string): number {
  const normalized = text.normalize('NFC');
  let count = 0;
  for (const ch of normalized) {
    if (!/^[\p{Mn}\p{Me}]$/u.test(ch)) count++;
  }
  return count;
}

function matchNumbers(text: string): string[] {
  return Array.from(text.matchAll(NUMBER), (m) => m[0]);
}

function normNumber(raw: string): string {
  let n = raw.replace(/,/g, '');
  if (n.includes('.')) {
    n = n.replace(/0+$/, '');
    n = n.replace(/\.$/, '');
  }
  n = n.replace(/^0+/, '');
  return n === '' ? '0' : n;
}

function buildSourceNumbers(sourceText: string): Set<string> {
  const numbers = new Set<string>();
  for (const raw of matchNumbers(sourceText)) numbers.add(normNumber(raw));
  for (const m of sourceText.matchAll(EN_WORD_RE)) {
    const word = (m[1] ?? '').toLowerCase();
    const digit = NUMBER_WORDS[word];
    if (digit !== undefined) numbers.add(digit);
  }
  // Common words that contain สาม / ห้า (false-positive source: "สามารถ", "ห้าง").
  const thaiText = sourceText.replace(/สามารถ|ห้าง/g, ' ');
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    if (!isAsciiWord(word) && thaiText.includes(word)) numbers.add(digit);
  }
  return numbers;
}

/** Yield [path, text] for user-facing text. claimsOnly skips meta fields (missing_context). */
function* texts(
  data: NewsAnalysis,
  claimsOnly: boolean,
): Generator<[string, string]> {
  yield ['headline', data.headline];
  for (let i = 0; i < data.summary.length; i++) {
    yield [`summary/${i}`, data.summary[i]];
  }
  const sides = ['positiveFactors', 'negativeFactors'] as const;
  for (const side of sides) {
    const factors: readonly Factor[] = data[side];
    for (let i = 0; i < factors.length; i++) {
      const f = factors[i];
      yield [`${side}/${i}/factor`, f.factor];
      yield [`${side}/${i}/reason`, f.reason];
    }
  }
  if (data.counterpointNote) yield ['counterpointNote', data.counterpointNote];
  if (data.sentimentReason) yield ['sentimentReason', data.sentimentReason];
  const horizons = ['shortTerm', 'mediumTerm', 'longTerm'] as const;
  for (const horizon of horizons) {
    const value = data.impact[horizon];
    if (value) yield [`impact/${horizon}/rationale`, value.rationale];
  }
  for (let i = 0; i < data.affected.length; i++) {
    yield [`affected/${i}/mechanism`, data.affected[i].mechanism];
  }
  for (let i = 0; i < data.conflicts.length; i++) {
    const c = data.conflicts[i];
    yield [`conflicts/${i}/claim`, c.claim];
    yield [`conflicts/${i}/note`, c.note];
    for (let j = 0; j < c.values.length; j++) {
      yield [
        `conflicts/${i}/values/${j}`,
        (c.values[j] as { value: string }).value,
      ];
    }
  }
  if (!claimsOnly) {
    for (let i = 0; i < data.missingContext.length; i++) {
      yield [`missingContext/${i}`, data.missingContext[i]];
    }
  }
}

/** Ratcliff/Obershelp longest-matching-block length, as used by Python's difflib.SequenceMatcher. */
function matchingBlockLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  let aBest = 0;
  let bBest = 0;
  let prevRow = new Array<number>(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    const currRow = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) {
      if (a[i] === b[j]) {
        const value = prevRow[j] + 1;
        currRow[j + 1] = value;
        if (value > best) {
          best = value;
          aBest = i + 1 - value;
          bBest = j + 1 - value;
        }
      }
    }
    prevRow = currRow;
  }
  if (best === 0) return 0;
  return (
    best +
    matchingBlockLength(a.slice(0, aBest), b.slice(0, bBest)) +
    matchingBlockLength(a.slice(aBest + best), b.slice(bBest + best))
  );
}

function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * matchingBlockLength(a, b)) / total;
}

export function checkAnalysis(
  output: LlmNewsOutput,
  context: GuardrailContext,
): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  const add = (
    level: 'error' | 'warning',
    rule: string,
    message: string,
  ): void => {
    issues.push({ level, rule, message });
  };
  const data = output.data;

  // --- Language safety -------------------------------------------------------------
  for (const [path, text] of texts(data, false)) {
    for (const pattern of BLOCKED_PATTERNS) {
      const m = text.match(pattern);
      if (m) add('error', 'AI-SAFE-001', `${path}: blocked wording '${m[0]}'`);
    }
    for (const pattern of SENSATIONAL_PATTERNS) {
      const m = text.match(pattern);
      if (m)
        add('warning', 'AI-GEN-005', `${path}: sensational wording '${m[0]}'`);
    }
  }

  if (PROBABILITY_WORDS.test(output.confidenceReason)) {
    add(
      'error',
      'AI-GEN-004',
      'confidence_reason uses probability/percent language',
    );
  }

  // --- Grounding ----------------------------------------------------------------------
  const sourceNumbers = buildSourceNumbers(context.sourceText);
  for (const [path, text] of texts(data, true)) {
    const stripped = text.replace(PERIOD_LABEL, ' ');
    for (const raw of matchNumbers(stripped)) {
      if (!sourceNumbers.has(normNumber(raw))) {
        add(
          'error',
          'AI-SAFE-002',
          `${path}: number '${raw}' not found in any source`,
        );
      }
    }
  }

  const sides = ['positiveFactors', 'negativeFactors'] as const;
  for (const side of sides) {
    data[side].forEach((f, i) => {
      for (const ref of f.evidenceRefs) {
        const sourceId = ref.startsWith('src:') ? ref.slice(4) : ref;
        if (!context.knownSourceIds.has(sourceId)) {
          add(
            'error',
            'AI-NEWS-003',
            `${side}/${i}: evidence_ref '${ref}' is not an input source`,
          );
        }
      }
      if (
        f.basis === 'scenario' &&
        !CONDITIONAL_WORDS.some((w) => f.reason.toLowerCase().includes(w))
      ) {
        add(
          'warning',
          'AI-GEN-001',
          `${side}/${i}: scenario factor without conditional wording`,
        );
      }
    });
  }
  data.conflicts.forEach((c, i) => {
    for (const v of c.values) {
      if (!context.knownSourceIds.has(v.sourceId)) {
        add(
          'error',
          'AI-NEWS-008',
          `conflicts/${i}: unknown source_id '${v.sourceId}'`,
        );
      }
    }
  });

  // --- Summary / headline -----------------------------------------------------------
  const [low, high] = HEADLINE_CHARS;
  const headlineLength = visibleLength(data.headline);
  if (
    output.status !== 'insufficient_data' &&
    !(headlineLength >= low && headlineLength <= high)
  ) {
    add(
      'warning',
      'AI-NEWS-001',
      `headline length ${headlineLength} outside ${low}-${high} visible chars`,
    );
  }
  const dupes = data.summary.filter(
    (s) => sequenceRatio(s, data.headline) > 0.9,
  );
  if (dupes.length > 0 && dupes.length === data.summary.length) {
    add('error', 'AI-NEWS-002', 'every summary line repeats the headline');
  } else if (dupes.length > 0) {
    add('warning', 'AI-NEWS-002', 'a summary line repeats the headline');
  }

  // --- Two-sided analysis -------------------------------------------------------------
  if (output.status !== 'insufficient_data') {
    for (const side of sides) {
      const grounded = data[side].filter(
        (f) => f.basis === 'fact' || f.basis === 'interpretation',
      );
      if (grounded.length === 0 && !data.counterpointNote) {
        add(
          'error',
          'AI-GEN-002',
          `no source-grounded ${side} and counterpoint_note is empty`,
        );
      }
    }
  }

  // --- Status / sentiment consistency -------------------------------------------------
  if (output.status === 'insufficient_data') {
    if (data.sentiment !== null) {
      add('error', 'AI-GEN-003', 'insufficient_data must have sentiment=null');
    }
    if (data.missingContext.length === 0) {
      add('error', 'AI-GEN-003', 'insufficient_data must list missing_context');
    }
  } else {
    if (data.sentiment === null || !data.sentimentReason) {
      add(
        'error',
        'AI-NEWS-004',
        'sentiment and sentiment_reason are required after analysis',
      );
    }
    if (output.status === 'partial' && data.missingContext.length === 0) {
      add('warning', 'AI-GEN-003', 'partial status without missing_context');
    }
  }

  // --- Conflicts & confidence ---------------------------------------------------------
  const warningCodes = new Set(output.warnings.map((w) => w.code));
  if (data.conflicts.length > 0 && !warningCodes.has('AI_SOURCE_CONFLICT')) {
    add(
      'error',
      'AI-NEWS-008',
      'conflicts listed but AI_SOURCE_CONFLICT warning missing',
    );
  }
  if (warningCodes.has('AI_SOURCE_CONFLICT') && data.conflicts.length === 0) {
    add(
      'error',
      'AI-NEWS-008',
      'AI_SOURCE_CONFLICT warning without conflict details',
    );
  }
  for (const c of data.conflicts) {
    const valueNumberSets = c.values.map(
      (v) => new Set(matchNumbers(v.value).map(normNumber)),
    );
    const unique = valueNumberSets.map((nums, i) => {
      const others = new Set<string>();
      valueNumberSets.forEach((o, j) => {
        if (j !== i) o.forEach((n) => others.add(n));
      });
      return new Set([...nums].filter((n) => !others.has(n)));
    });
    const targets: Array<[string, string, 'error' | 'warning']> = [
      ['headline', data.headline, 'error'],
      ...data.summary.map((s, i): [string, string, 'error' | 'warning'] => [
        `summary/${i}`,
        s,
        'warning',
      ]),
    ];
    for (const [path, text, level] of targets) {
      const textNumbers = new Set(matchNumbers(text).map(normNumber));
      const asserted: string[] = [];
      unique.forEach((u, i) => {
        if ([...u].some((n) => textNumbers.has(n))) {
          asserted.push((c.values[i] as { value: string }).value);
        }
      });
      if (asserted.length === 1) {
        add(
          level,
          'AI-NEWS-008',
          `${path} states only one conflicting value '${asserted[0]}'`,
        );
      }
    }
  }

  const caps: Array<[keyof typeof CONFIDENCE_CAPS, number]> = [];
  if (output.status === 'insufficient_data')
    caps.push(['insufficient_data', CONFIDENCE_CAPS.insufficient_data]);
  if (data.conflicts.length > 0)
    caps.push(['conflict', CONFIDENCE_CAPS.conflict]);
  if (data.claimStatus === 'unconfirmed' || data.claimStatus === 'rumor') {
    caps.push(['unverified_claim', CONFIDENCE_CAPS.unverified_claim]);
  }
  if (context.stale) caps.push(['stale', CONFIDENCE_CAPS.stale]);
  for (const [reason, cap] of caps) {
    if (output.confidence > cap) {
      add(
        'error',
        'AI-GEN-003',
        `confidence ${output.confidence} exceeds cap ${cap} for ${reason}`,
      );
    }
  }

  data.affected.forEach((item, i) => {
    if (
      item.relation === 'second_order' &&
      item.confidence > output.confidence
    ) {
      add(
        'warning',
        'AI-NEWS-006',
        `affected/${i}: second-order confidence above overall confidence`,
      );
    }
  });

  return issues;
}

export function blocking(issues: readonly GuardrailIssue[]): GuardrailIssue[] {
  return issues.filter((i) => i.level === 'error');
}
