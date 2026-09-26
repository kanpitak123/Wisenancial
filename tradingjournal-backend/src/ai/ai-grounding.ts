import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Numeric grounding for AI answers about the user's own numbers.
 *
 * The model is told to quote figures from the payload and never compute new ones. This is
 * the check behind that instruction: every percent or money figure in the answer's prose
 * must equal a number that was in the payload, within the precision the answer wrote it
 * with. A figure the model invented, converted or recomputed fails the check.
 *
 * It is a guard against fabrication, not a proof of correctness: a number that exists in the
 * payload but is attached to the wrong label passes. Clear labels in the payload (see
 * portfolio-review-metrics.ts) are what make that mistake unlikely.
 */

export interface GroundingAssessment {
  ok: boolean;
  /** Why it failed, for logs. Contains the offending figures, never the payload. */
  reason?: string;
  /** The figures that matched nothing in the payload. */
  ungrounded?: string[];
}

/** Plain integers in this range are read as years/dates, not money. */
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

/** A plain integer below this, with no %, currency or separator, is a count ("3 holdings"). */
const PLAIN_INTEGER_FIGURE_FROM = 1000;

const CURRENCY_BEFORE = /[$฿€£¥]\s*$/;
const CURRENCY_AFTER =
  /^\s*(?:USD|THB|EUR|GBP|JPY|baht|dollars?|บาท|ดอลลาร์)\b/i;
const PERCENT_AFTER = /^\s*(?:%|percent\b|เปอร์เซ็นต์|เปอร์เซนต์)/i;

/** Every numeric value that appears anywhere in the payload, as absolute values. */
export function collectPayloadNumbers(
  payload: unknown,
  into: number[] = [],
): number[] {
  if (typeof payload === 'number') {
    if (Number.isFinite(payload)) into.push(Math.abs(payload));
  } else if (typeof payload === 'string') {
    // numeric strings (Prisma Decimals serialise as strings) and numbers inside text
    for (const match of payload.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const value = Number(match[0].replace(/,/g, ''));
      if (Number.isFinite(value)) into.push(value);
    }
  } else if (Array.isArray(payload)) {
    for (const item of payload) collectPayloadNumbers(item, into);
  } else if (payload && typeof payload === 'object') {
    for (const item of Object.values(payload))
      collectPayloadNumbers(item, into);
  }

  return into;
}

interface Figure {
  literal: string;
  value: number;
  decimals: number;
}

/**
 * Percent and money figures in a piece of prose.
 *
 * Counts a number when it has a % sign, a currency marker, a decimal part, a thousands
 * separator, or is a plain integer of 1,000 or more (outside the year range). Small plain
 * integers are counts and are left alone.
 */
export function extractFigures(text: string): Figure[] {
  const figures: Figure[] = [];

  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const literal = match[0].replace(/,+$/, '');
    const start = match.index ?? 0;
    const before = text.slice(0, start);
    const after = text.slice(start + match[0].length);

    // a digit run glued to letters ("Q3", "H2", "MT5") is a label, not a figure
    if (/[A-Za-z]$/.test(before)) continue;

    const value = Number(literal.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;

    const hasMarker =
      PERCENT_AFTER.test(after) ||
      CURRENCY_BEFORE.test(before) ||
      CURRENCY_AFTER.test(after);
    const hasDecimal = literal.includes('.');
    const hasSeparator = literal.includes(',');
    const isYear =
      !hasDecimal &&
      !hasSeparator &&
      value >= YEAR_MIN &&
      value <= YEAR_MAX &&
      !hasMarker;
    const isBigInteger = !hasDecimal && value >= PLAIN_INTEGER_FIGURE_FROM;

    if (hasMarker || hasDecimal || hasSeparator || (isBigInteger && !isYear)) {
      figures.push({
        literal,
        value,
        decimals: hasDecimal ? (literal.split('.')[1]?.length ?? 0) : 0,
      });
    }
  }

  return figures;
}

/** Same number, allowing for rounding to the precision the answer used. */
function matches(figure: Figure, payloadNumbers: readonly number[]): boolean {
  const tolerance = 0.5 * 10 ** -figure.decimals + 1e-9;

  return payloadNumbers.some(
    (candidate) => Math.abs(candidate - figure.value) <= tolerance,
  );
}

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value))
    for (const item of value) collectStrings(item, into);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) collectStrings(item, into);

  return into;
}

/** Whether every percent/money figure in `output`'s prose comes from `payload`. */
export function assessNumericGrounding(
  output: unknown,
  payload: unknown,
): GroundingAssessment {
  const payloadNumbers = collectPayloadNumbers(payload);
  const ungrounded = collectStrings(output)
    .flatMap((text) => extractFigures(text))
    .filter((figure) => !matches(figure, payloadNumbers))
    .map((figure) => figure.literal);

  if (ungrounded.length === 0) return { ok: true };

  const unique = [...new Set(ungrounded)];

  return {
    ok: false,
    reason: `figures not found in the supplied data: ${unique.join(', ')}`,
    ungrounded: unique,
  };
}

/**
 * The model kept quoting figures that are not in the supplied data, even after a retry.
 * Surfaced as an error and never charged: an answer the user cannot trust is not a
 * deliverable.
 */
export class UngroundedNumbersError extends HttpException {
  readonly tag = 'ungrounded-numbers';
  readonly code = 'UNGROUNDED_NUMBERS';

  constructor(readonly detail: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'AI_UNGROUNDED_NUMBERS',
        message:
          'The AI quoted figures that are not in your data, so the answer was discarded. No credits were charged; please try again.',
        creditsCharged: 0,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/** Appended to the user message on the single retry. */
export function groundingCorrection(ungrounded: readonly string[]): string {
  return `\n\nYour previous answer contained figures that are not in the supplied data (${ungrounded.join(', ')}). Rewrite the whole answer in the same JSON shape and quote only numbers that appear in "metrics", exactly as given. Do not compute, estimate, convert or round any number; if a number you need is not there, describe it in words instead.`;
}
