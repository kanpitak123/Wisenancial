import { HttpException, HttpStatus } from '@nestjs/common';
import type { AiOutputLanguage } from './ai-prompt.shared';

/**
 * Output-language check for AI answers.
 *
 * Prompts state the language, but a model can still drift (a live Portfolio Review came
 * back in Korean for a Thai UI). This looks at the *script* of the prose the model wrote
 * so a wrong-language answer can be retried, and refused without charging, instead of
 * being shown to the user.
 *
 * It is deliberately script-based, not a language detector: Thai vs English vs
 * Hangul/CJK are the cases that actually happen and can be told apart reliably.
 */

export interface LanguageAssessment {
  ok: boolean;
  /** Why it failed, for logs. Never contains the model's text. */
  reason?: string;
}

/** A string needs at least this many letters to count as prose (skips enums, tickers, labels). */
const MIN_PROSE_LETTERS = 15;

/** Share of letters in an unexpected script that makes prose "wrong". */
const FOREIGN_SCRIPT_LIMIT = 0.1;

/** Thai answers must be at least this Thai (tickers/English terms are allowed to dilute it). */
const MIN_THAI_SHARE_FOR_THAI = 0.3;

/** English answers may contain a few Thai characters (a quoted term) but not Thai prose. */
const MAX_THAI_SHARE_FOR_ENGLISH = 0.05;

const LETTER = /\p{L}/gu;
const THAI = /\p{Script=Thai}/gu;
const LATIN = /\p{Script=Latin}/gu;

interface Tally {
  letters: number;
  thai: number;
  latin: number;
  /** Hangul, Han, Hiragana, Katakana and every other non-Thai, non-Latin script. */
  foreign: number;
}

const count = (text: string, pattern: RegExp): number =>
  (text.match(pattern) ?? []).length;

function tally(text: string): Tally {
  const letters = count(text, LETTER);
  const thai = count(text, THAI);
  const latin = count(text, LATIN);

  return { letters, thai, latin, foreign: letters - thai - latin };
}

/** Every string value in `value`, however deeply nested. */
function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, into);
  }

  return into;
}

/**
 * Whether the prose in `value` is written in `expected`.
 *
 * Only strings with real prose count; a payload with no prose at all (numbers, enums)
 * passes, since there is nothing to be in the wrong language.
 */
export function assessOutputLanguage(
  value: unknown,
  expected: AiOutputLanguage,
): LanguageAssessment {
  const prose = collectStrings(value).filter(
    (text) => count(text, LETTER) >= MIN_PROSE_LETTERS,
  );

  if (prose.length === 0) return { ok: true };

  // One field in Korean must not hide behind several fine ones.
  for (const text of prose) {
    const one = tally(text);
    if (one.foreign / one.letters > 0.5) {
      return { ok: false, reason: 'a text field is in an unexpected script' };
    }
  }

  const total = prose.reduce<Tally>(
    (sum, text) => {
      const one = tally(text);
      return {
        letters: sum.letters + one.letters,
        thai: sum.thai + one.thai,
        latin: sum.latin + one.latin,
        foreign: sum.foreign + one.foreign,
      };
    },
    { letters: 0, thai: 0, latin: 0, foreign: 0 },
  );

  if (total.foreign / total.letters > FOREIGN_SCRIPT_LIMIT) {
    return {
      ok: false,
      reason: 'answer contains Hangul/CJK or another unexpected script',
    };
  }

  const thaiShare = total.thai / total.letters;

  if (expected === 'th' && thaiShare < MIN_THAI_SHARE_FOR_THAI) {
    return {
      ok: false,
      reason: 'expected Thai, answer is not written in Thai',
    };
  }

  if (expected === 'en' && thaiShare > MAX_THAI_SHARE_FOR_ENGLISH) {
    return { ok: false, reason: 'expected English, answer contains Thai' };
  }

  return { ok: true };
}

/**
 * The model answered in the wrong language twice. Surfaced to the user as an error and
 * never charged: the fault is ours, not something the user should pay for.
 */
export class WrongLanguageError extends HttpException {
  readonly tag = 'wrong-language';
  readonly code = 'WRONG_LANGUAGE';

  constructor(
    readonly expected: AiOutputLanguage,
    readonly detail: string,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'AI_WRONG_LANGUAGE',
        message: `The AI answered in the wrong language (expected ${expected === 'th' ? 'Thai' : 'English'}). No credits were charged; please try again.`,
        expectedLanguage: expected,
        creditsCharged: 0,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/** Appended to the user message on the single retry. */
export function languageCorrection(expected: AiOutputLanguage): string {
  const name = expected === 'th' ? 'Thai' : 'English';

  return `\n\nRespond only in ${name}. Your previous answer was not written in ${name}; write the whole answer again in ${name}, in the same JSON shape.`;
}
