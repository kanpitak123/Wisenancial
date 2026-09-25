/**
 * Ported from News_AI_(Gemini)/nestjs/news-classifier.service.ts (buildPromptV5,
 * FORBIDDEN_ADVISORY_PATTERNS) — the team's V.5 "dual-impact" classifier.
 *
 * NOT a straight port of the output schema: V.5's own shape (news_category,
 * market_stance, dual_impact_analysis, reasoning_steps, neutrality_score, ...) has no
 * mapping to the existing news/market_news columns and would need new UI (see
 * Claude outputs/ai-modules-integration-discovery.md §1). Chunk A's brief is to slot
 * into the EXISTING enrichment contract (NewsEnrichmentResult) plus a confidence
 * score, so this prompt keeps V.5's neutrality mandate and anti-inducement scanning
 * (both genuinely reusable regardless of output shape) but asks the model to answer
 * directly in the existing contract's JSON shape instead of the full V.5 schema.
 *
 * Few-shot examples: the original fewshot_examples_v5.json is ~25KB (~6-6.5k tokens)
 * re-sent on every single call with no caching — flagged as wasteful in the discovery
 * report. Trimmed to 2 examples here (re-shaped to the existing contract) to keep this
 * first integration's per-call cost sane; revisit with Gemini context/prompt caching
 * if the team wants the full 8-example set back.
 */

export interface GeminiClassificationInput {
  headline: string;
  summary: string;
  content: string;
  language: 'en' | 'th';
}

export interface RawGeminiClassification {
  aiSummary: string;
  aiTrend: string;
  aiImpactProbability: number;
  stockImpactAnalysis: string;
  sector: string;
  importance: string;
  sentiment: string;
  aiTranslatedSummary?: { en: string; th: string };
  confidence: number;
}

/**
 * Ported verbatim from FORBIDDEN_ADVISORY_PATTERNS — catches the model slipping into
 * "buy/sell/guaranteed return" language despite the neutrality mandate below. A
 * malformed-JSON check alone (handled centrally by parseJsonResponse) doesn't catch
 * this: the JSON can be perfectly well-formed and still violate the investment-advice
 * guardrail every other AI-layer prompt in this repo also enforces.
 */
export const FORBIDDEN_ADVISORY_PATTERNS: RegExp[] = [
  /\b(should|must|ought to)\s+(buy|sell|purchase|short|accumulate|dump)\b/i,
  /\b(strong|definite)\s+(buy|sell)\b/i,
  /\b(guaranteed\s+(return|returns|profit|profits|upside|gain|gains)|(return|returns|profit|profits|upside|gain|gains)\s+(is|are)?\s*guaranteed)\b/i,
  /\btarget\s+price\s+of\s+[$0-9]/i,
  /\ball-in\b/i,
  /\bcannot\s+lose\b/i,
  /ควรซื้อ/i,
  /น่าเก็งกำไร/i,
  /ควรรีบขาย/i,
  /น่าทยอยสะสม/i,
  /เป้าหมายราคาที่/i,
  /ฟันธงว่าขึ้น/i,
  /ฟันธงว่าลง/i,
  /ตกรถ/i,
  /ดอยแน่นอน/i,
];

export function scanForbiddenAdvisoryLanguage(text: string): string[] {
  const flags: string[] = [];
  for (const pattern of FORBIDDEN_ADVISORY_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(pattern.toString());
    }
  }
  return flags;
}

/**
 * Two of V.5's real fewshot_examples_v5.json entries (fed-rate-decision,
 * inflation-energy-spike), re-labelled from the V.5 schema onto the existing
 * NewsEnrichmentResult contract so the examples still teach the right depth of
 * analysis without teaching the model to answer in a shape we don't use.
 */
const FEW_SHOT_EXAMPLES: Array<{
  headline: string;
  summary: string;
  label: RawGeminiClassification;
}> = [
  {
    headline:
      'Fed holds interest rates steady at 5.25%-5.50%, signals potential rate cut later this year if inflation cools',
    summary:
      'The Federal Reserve left its benchmark rate unchanged while chairman noted progress on core inflation but emphasized caution regarding wage pressures and labor market resilience.',
    label: {
      aiSummary:
        'Fed held rates at 5.25%-5.50%, citing inflation progress but flagging wage-pressure caution before any cut.',
      aiTrend: 'SIDEWAY',
      aiImpactProbability: 70,
      stockImpactAnalysis:
        'Unchanged rates keep near-term financing costs elevated for leveraged small-caps and REITs, while the cut signal lowers the discount rate long-duration tech and Treasuries are priced against.',
      sector: 'Macro / Rates',
      importance: 'HIGH',
      sentiment: 'NEUTRAL',
      confidence: 0.94,
    },
  },
  {
    headline:
      'Headline inflation accelerates to 3.6% driven by surging crude oil and gasoline prices',
    summary:
      'Consumer price index jumped above consensus forecasts due to rising geopolitical tensions in key shipping lanes, raising concern that central banks will maintain restrictive monetary policy longer.',
    label: {
      aiSummary:
        'CPI accelerated to 3.6%, above consensus, driven by energy prices tied to shipping-lane tensions — raises odds policy stays restrictive longer.',
      aiTrend: 'DOWN',
      aiImpactProbability: 65,
      stockImpactAnalysis:
        'Higher energy costs squeeze margins and act as a consumption tax on households, pushing bond yields up to price sticky inflation; energy-sector cash flows and commodity-exporting currencies benefit in contrast.',
      sector: 'Macro / Inflation',
      importance: 'HIGH',
      sentiment: 'BEARISH',
      confidence: 0.92,
    },
  },
];

/**
 * Ported from buildPromptV5's "STRICT REGULATORY & NEUTRALITY MANDATE" — the same
 * non-advisory / balanced-symmetry / grounded-in-facts / probabilistic-framing rules,
 * combined with this repo's own investmentGuardrail()/concisenessRule() so Gemini's
 * output style matches every other AI-layer prompt, not just this one.
 */
export const GEMINI_NEWS_CLASSIFICATION_SYSTEM_PROMPT = [
  'You are an objective financial news analyst summarizing news for retail investors.',
  'Base your analysis strictly on the headline/summary/content provided — do not use outside knowledge about the company beyond this article.',
  'NON-ADVISORY: never tell the reader to buy, sell, accumulate, short, or hold any asset, and never give a price target. Frame every statement as an observation, not an instruction.',
  'BALANCED: financial events create winners and losers — where relevant, note both a supportive and a pressuring angle rather than only one side.',
  'GROUNDED: reason from the facts given and standard economic principles; do not invent facts not present in the article.',
  'PROBABILISTIC: use conditional language ("may support...", "presents downside risk to...") rather than definitive certainty.',
  'Keep each text field concise — about 40 words at most.',
  'Write aiSummary and stockImpactAnalysis in the language given by "language" ("th" or "en").',
  'aiTranslatedSummary must always be in Thai, regardless of "language" (a Thai fallback when the article itself is in English).',
  '"confidence" is your own calibrated confidence in this analysis, 0 to 1 — do not default to a fixed value; a genuinely ambiguous or thin article should score lower.',
  'Return valid JSON only, matching exactly:',
  '{',
  '  "aiSummary": string,',
  '  "aiTrend": "UP" | "DOWN" | "SIDEWAY",',
  '  "aiImpactProbability": number (0-100),',
  '  "stockImpactAnalysis": string,',
  '  "sector": string,',
  '  "importance": "HIGH" | "MEDIUM" | "LOW",',
  '  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",',
  '  "aiTranslatedSummary": string,',
  '  "confidence": number (0-1)',
  '}',
  'If uncertain about impact, prefer a value near 50 and say so in stockImpactAnalysis rather than guessing confidently — and let confidence reflect that uncertainty.',
  '',
  'Reference examples (same shape you must answer in):',
  JSON.stringify(FEW_SHOT_EXAMPLES),
].join('\n');

export function buildGeminiNewsClassificationPrompt(
  input: GeminiClassificationInput,
): string {
  return JSON.stringify({
    language: input.language,
    headline: input.headline.slice(0, 300),
    summary: input.summary.slice(0, 800),
    content: input.content.slice(0, 1500),
  });
}
