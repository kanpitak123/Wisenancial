import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Metric key names must not leak into the prose a user reads.
 *
 * The review payload is full of machine words (`unrealizedProfitLoss_USD`, `totalReturn`,
 * ALL-CAPS emphasis in definitions). A model copies them into an otherwise fluent Thai
 * sentence ("... UNREALIZED ..."), which reads as a bug. The prompt supplies plain-language
 * labels and forbids key names; this is the check that the answer obeyed.
 *
 * Flagged in prose:
 *   - identifiers with an underscore (`total_pnl`, `cash_USD`)
 *   - a camelCase key that exists in the payload (`unrealizedProfitLoss`, `totalReturn`)
 *   - an ALL-CAPS word of 4+ letters, unless it is a ticker/enum that the payload itself
 *     contains or a well-known finance abbreviation (`UNREALIZED`, `REALIZED`, `TOTAL`)
 */

export interface KeyLeakAssessment {
  ok: boolean;
  reason?: string;
  /** The offending tokens, for the retry correction. */
  found?: string[];
}

/** Legitimate ALL-CAPS words that are not payload keys. Currency codes are 3 letters and never match. */
const ALLOWED_CAPS = new Set([
  'NASDAQ',
  'NYSE',
  'ETFS',
  'EBITDA',
  'JSON',
  'OPEC',
  'FOMC',
  'NFP',
]);

/** A string needs at least this many letters to count as prose (same bar as the language check). */
const MIN_PROSE_LETTERS = 15;

const UNDERSCORE_IDENTIFIER = /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g;
const ALL_CAPS_WORD = /\b[A-Z]{4,}\b/g;
const CAMEL_CASE = /[a-z][A-Z]/;

const letters = (text: string): number => (text.match(/\p{L}/gu) ?? []).length;

function walk(
  value: unknown,
  visit: (text: string, isKey: boolean) => void,
): void {
  if (typeof value === 'string') {
    visit(value, false);
  } else if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      visit(key, true);
      walk(item, visit);
    }
  }
}

export function assessKeyNameLeak(
  output: unknown,
  payload: unknown,
): KeyLeakAssessment {
  // camelCase keys the model was shown, and ALL-CAPS words the payload itself uses
  const camelKeys = new Set<string>();
  const capsInPayload = new Set<string>();

  walk(payload, (text, isKey) => {
    if (isKey) {
      if (CAMEL_CASE.test(text)) camelKeys.add(text);
      // `unrealizedProfitLoss_USD` -> also the base `unrealizedProfitLoss`
      const base = text.split('_')[0];
      if (base && CAMEL_CASE.test(base)) camelKeys.add(base);
    } else {
      for (const word of text.match(ALL_CAPS_WORD) ?? []) {
        capsInPayload.add(word);
      }
    }
  });

  const found = new Set<string>();

  walk(output, (text, isKey) => {
    if (isKey || letters(text) < MIN_PROSE_LETTERS) return;

    for (const token of text.match(UNDERSCORE_IDENTIFIER) ?? []) {
      found.add(token);
    }

    for (const key of camelKeys) {
      if (text.includes(key)) found.add(key);
    }

    for (const word of text.match(ALL_CAPS_WORD) ?? []) {
      if (!ALLOWED_CAPS.has(word) && !capsInPayload.has(word)) found.add(word);
    }
  });

  if (found.size === 0) return { ok: true };

  const list = [...found];

  return {
    ok: false,
    reason: `metric key names or ALL-CAPS labels in the prose: ${list.join(', ')}`,
    found: list,
  };
}

/**
 * The model kept writing key names into the prose even after a retry. Surfaced as an error
 * and never charged.
 */
export class KeyNameLeakError extends HttpException {
  readonly tag = 'key-name-leak';
  readonly code = 'KEY_NAME_LEAK';

  constructor(readonly detail: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'AI_KEY_NAME_LEAK',
        message:
          'The AI answer contained internal field names, so it was discarded. No credits were charged; please try again.',
        creditsCharged: 0,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/** Appended to the user message on the single retry. */
export function keyLeakCorrection(found: readonly string[]): string {
  return `\n\nYour previous answer contained internal field names or ALL-CAPS labels (${found.join(', ')}). Rewrite the whole answer in the same JSON shape. Refer to each figure only by its plain-language label from "labels" (exactly as written there, in the answer's language) or by ordinary words; never write a key name, an identifier with an underscore, or an ALL-CAPS word for emphasis.`;
}
