/**
 * Hand-written runtime validation for LlmNewsOutput.
 *
 * Mirrors `schemas/news_llm_output.schema.json`, `schemas/news_analysis.schema.json`
 * and `schemas/common.defs.schema.json` from the Python reference implementation.
 * No validation library: the backend has neither zod nor ajv, and this module must
 * drop in without adding a dependency.
 */

import type {
  AffectedItem,
  AnalysisSentiment,
  AnalysisStatus,
  ClaimStatus,
  Factor,
  FactorBasis,
  ImpactDirection,
  ImpactHorizon,
  LlmNewsOutput,
  NewsAnalysis,
  NewsTone,
  SourceConflict,
  Strength,
  Uncertainty,
  WarningCode,
} from './types';

export type ValidationResult =
  { ok: true; value: LlmNewsOutput } | { ok: false; errors: string[] };

const STATUS_VALUES: readonly AnalysisStatus[] = [
  'success',
  'partial',
  'insufficient_data',
];
const SENTIMENT_VALUES: readonly AnalysisSentiment[] = [
  'strong_positive',
  'positive',
  'mixed_positive',
  'mixed',
  'neutral',
  'mixed_negative',
  'negative',
  'strong_negative',
];
const NEWS_TONE_VALUES: readonly NewsTone[] = [
  'positive',
  'negative',
  'mixed',
  'neutral',
  'promotional',
  'sensational',
];
const FACTOR_BASIS_VALUES: readonly FactorBasis[] = [
  'fact',
  'interpretation',
  'scenario',
];
const CLAIM_STATUS_VALUES: readonly ClaimStatus[] = [
  'confirmed',
  'unconfirmed',
  'rumor',
];
const IMPACT_DIRECTION_VALUES: readonly ImpactDirection[] = [
  'positive',
  'mixed_positive',
  'mixed',
  'neutral',
  'mixed_negative',
  'negative',
  'uncertain',
];
const STRENGTH_VALUES: readonly Strength[] = ['low', 'medium', 'high'];
const UNCERTAINTY_VALUES: readonly Uncertainty[] = ['low', 'medium', 'high'];
const WARNING_CODE_VALUES: readonly WarningCode[] = [
  'AI_INPUT_INVALID',
  'AI_INSUFFICIENT_DATA',
  'AI_SOURCE_CONFLICT',
  'AI_SOURCE_STALE',
  'AI_MODEL_TIMEOUT',
  'AI_OUTPUT_INVALID',
];
const AFFECTED_KIND_VALUES = [
  'asset',
  'sector',
  'theme',
  'asset_class',
] as const;
const AFFECTED_RELATION_VALUES = ['direct', 'related', 'second_order'] as const;

const EVIDENCE_REF_PATTERN = /^src:\S+$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(errors: string[], path: string, message: string): void {
  errors.push(`${path}: ${message}`);
}

/** Verifies `obj` is a plain object with exactly `required` keys (additionalProperties: false). */
function checkShape(
  errors: string[],
  path: string,
  v: unknown,
  required: readonly string[],
): v is Record<string, unknown> {
  if (!isPlainObject(v)) {
    fail(errors, path, 'expected an object');
    return false;
  }
  let ok = true;
  for (const key of required) {
    if (!(key in v)) {
      fail(errors, path, `missing required property '${key}'`);
      ok = false;
    }
  }
  for (const key of Object.keys(v)) {
    if (!required.includes(key)) {
      fail(errors, path, `unexpected property '${key}'`);
      ok = false;
    }
  }
  return ok;
}

function checkString(
  errors: string[],
  path: string,
  v: unknown,
  opts: { minLength?: number } = {},
): v is string {
  if (typeof v !== 'string') {
    fail(errors, path, 'expected a string');
    return false;
  }
  const minLength = opts.minLength ?? 0;
  if (v.length < minLength) {
    fail(errors, path, `expected at least ${minLength} character(s)`);
    return false;
  }
  return true;
}

function checkNullableString(
  errors: string[],
  path: string,
  v: unknown,
): v is string | null {
  if (v === null) return true;
  return checkString(errors, path, v);
}

function checkEnum<T extends string>(
  errors: string[],
  path: string,
  v: unknown,
  allowed: readonly T[],
): v is T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(errors, path, `expected one of [${allowed.join(', ')}]`);
    return false;
  }
  return true;
}

function checkNumberRange(
  errors: string[],
  path: string,
  v: unknown,
  min: number,
  max: number,
): v is number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    fail(errors, path, 'expected a number');
    return false;
  }
  if (v < min || v > max) {
    fail(errors, path, `expected a number between ${min} and ${max}`);
    return false;
  }
  return true;
}

function checkArray(
  errors: string[],
  path: string,
  v: unknown,
  opts: { minItems?: number; maxItems?: number } = {},
): v is unknown[] {
  if (!Array.isArray(v)) {
    fail(errors, path, 'expected an array');
    return false;
  }
  const { minItems, maxItems } = opts;
  let ok = true;
  if (minItems !== undefined && v.length < minItems) {
    fail(errors, path, `expected at least ${minItems} items`);
    ok = false;
  }
  if (maxItems !== undefined && v.length > maxItems) {
    fail(errors, path, `expected at most ${maxItems} items`);
    ok = false;
  }
  return ok;
}

function checkEvidenceRefs(
  errors: string[],
  path: string,
  v: unknown,
): v is string[] {
  if (!checkArray(errors, path, v, { minItems: 1 })) return false;
  const arr = v;
  let ok = true;
  arr.forEach((item, i) => {
    if (typeof item !== 'string' || !EVIDENCE_REF_PATTERN.test(item)) {
      fail(errors, `${path}/${i}`, `expected a string matching ^src:\\S+$`);
      ok = false;
    }
  });
  return ok;
}

function checkFactor(errors: string[], path: string, v: unknown): v is Factor {
  if (
    !checkShape(errors, path, v, ['factor', 'reason', 'basis', 'evidenceRefs'])
  )
    return false;
  const obj = v;
  let ok = true;
  ok =
    checkString(errors, `${path}/factor`, obj['factor'], { minLength: 1 }) &&
    ok;
  ok =
    checkString(errors, `${path}/reason`, obj['reason'], { minLength: 1 }) &&
    ok;
  ok =
    checkEnum(errors, `${path}/basis`, obj['basis'], FACTOR_BASIS_VALUES) && ok;
  ok =
    checkEvidenceRefs(errors, `${path}/evidenceRefs`, obj['evidenceRefs']) &&
    ok;
  return ok;
}

function checkFactorArray(
  errors: string[],
  path: string,
  v: unknown,
): v is Factor[] {
  if (!checkArray(errors, path, v, { maxItems: 5 })) return false;
  const arr = v;
  let ok = true;
  arr.forEach((item, i) => {
    ok = checkFactor(errors, `${path}/${i}`, item) && ok;
  });
  return ok;
}

function checkHorizon(
  errors: string[],
  path: string,
  v: unknown,
): v is ImpactHorizon | null {
  if (v === null) return true;
  if (
    !checkShape(errors, path, v, [
      'direction',
      'strength',
      'rationale',
      'uncertainty',
    ])
  )
    return false;
  const obj = v;
  let ok = true;
  ok =
    checkEnum(
      errors,
      `${path}/direction`,
      obj['direction'],
      IMPACT_DIRECTION_VALUES,
    ) && ok;
  const strength = obj['strength'];
  if (
    strength !== null &&
    !checkEnum(errors, `${path}/strength`, strength, STRENGTH_VALUES)
  )
    ok = false;
  ok =
    checkString(errors, `${path}/rationale`, obj['rationale'], {
      minLength: 1,
    }) && ok;
  ok =
    checkEnum(
      errors,
      `${path}/uncertainty`,
      obj['uncertainty'],
      UNCERTAINTY_VALUES,
    ) && ok;
  return ok;
}

function checkAffectedItem(
  errors: string[],
  path: string,
  v: unknown,
): v is AffectedItem {
  if (
    !checkShape(errors, path, v, [
      'name',
      'symbol',
      'kind',
      'relation',
      'mechanism',
      'confidence',
    ])
  )
    return false;
  const obj = v;
  let ok = true;
  ok = checkString(errors, `${path}/name`, obj['name'], { minLength: 1 }) && ok;
  const symbol = obj['symbol'];
  if (symbol !== null && !checkString(errors, `${path}/symbol`, symbol))
    ok = false;
  ok =
    checkEnum(errors, `${path}/kind`, obj['kind'], AFFECTED_KIND_VALUES) && ok;
  ok =
    checkEnum(
      errors,
      `${path}/relation`,
      obj['relation'],
      AFFECTED_RELATION_VALUES,
    ) && ok;
  ok =
    checkString(errors, `${path}/mechanism`, obj['mechanism'], {
      minLength: 1,
    }) && ok;
  ok =
    checkNumberRange(errors, `${path}/confidence`, obj['confidence'], 0, 1) &&
    ok;
  return ok;
}

function checkConflictValue(
  errors: string[],
  path: string,
  v: unknown,
): boolean {
  if (!checkShape(errors, path, v, ['value', 'sourceId'])) return false;
  const obj = v;
  let ok = true;
  ok =
    checkString(errors, `${path}/value`, obj['value'], { minLength: 1 }) && ok;
  ok =
    checkString(errors, `${path}/sourceId`, obj['sourceId'], {
      minLength: 1,
    }) && ok;
  return ok;
}

function checkConflict(
  errors: string[],
  path: string,
  v: unknown,
): v is SourceConflict {
  if (!checkShape(errors, path, v, ['claim', 'values', 'note'])) return false;
  const obj = v;
  let ok = true;
  ok =
    checkString(errors, `${path}/claim`, obj['claim'], { minLength: 1 }) && ok;
  if (checkArray(errors, `${path}/values`, obj['values'], { minItems: 2 })) {
    const values = obj['values'];
    values.forEach((item, i) => {
      ok = checkConflictValue(errors, `${path}/values/${i}`, item) && ok;
    });
  } else {
    ok = false;
  }
  ok = checkString(errors, `${path}/note`, obj['note'], { minLength: 1 }) && ok;
  return ok;
}

function checkStringArray(
  errors: string[],
  path: string,
  v: unknown,
  opts: { minItems?: number; maxItems?: number; itemMinLength?: number } = {},
): v is string[] {
  if (!checkArray(errors, path, v, opts)) return false;
  const arr = v;
  let ok = true;
  arr.forEach((item, i) => {
    ok =
      checkString(errors, `${path}/${i}`, item, {
        minLength: opts.itemMinLength ?? 0,
      }) && ok;
  });
  return ok;
}

function checkNewsAnalysis(
  errors: string[],
  path: string,
  v: unknown,
): v is NewsAnalysis {
  const required = [
    'headline',
    'summary',
    'positiveFactors',
    'negativeFactors',
    'counterpointNote',
    'newsTone',
    'sentiment',
    'sentimentReason',
    'impact',
    'affected',
    'claimStatus',
    'conflicts',
    'missingContext',
  ];
  if (!checkShape(errors, path, v, required)) return false;
  const obj = v;
  let ok = true;

  ok =
    checkString(errors, `${path}/headline`, obj['headline'], {
      minLength: 1,
    }) && ok;
  ok =
    checkStringArray(errors, `${path}/summary`, obj['summary'], {
      minItems: 1,
      maxItems: 3,
      itemMinLength: 1,
    }) && ok;
  ok =
    checkFactorArray(
      errors,
      `${path}/positiveFactors`,
      obj['positiveFactors'],
    ) && ok;
  ok =
    checkFactorArray(
      errors,
      `${path}/negativeFactors`,
      obj['negativeFactors'],
    ) && ok;
  ok =
    checkNullableString(
      errors,
      `${path}/counterpointNote`,
      obj['counterpointNote'],
    ) && ok;

  const newsTone = obj['newsTone'];
  if (
    newsTone !== null &&
    !checkEnum(errors, `${path}/newsTone`, newsTone, NEWS_TONE_VALUES)
  )
    ok = false;

  const sentiment = obj['sentiment'];
  if (
    sentiment !== null &&
    !checkEnum(errors, `${path}/sentiment`, sentiment, SENTIMENT_VALUES)
  )
    ok = false;

  ok =
    checkNullableString(
      errors,
      `${path}/sentimentReason`,
      obj['sentimentReason'],
    ) && ok;

  if (
    checkShape(errors, `${path}/impact`, obj['impact'], [
      'shortTerm',
      'mediumTerm',
      'longTerm',
    ])
  ) {
    const impact = obj['impact'];
    ok =
      checkHorizon(errors, `${path}/impact/shortTerm`, impact['shortTerm']) &&
      ok;
    ok =
      checkHorizon(errors, `${path}/impact/mediumTerm`, impact['mediumTerm']) &&
      ok;
    ok =
      checkHorizon(errors, `${path}/impact/longTerm`, impact['longTerm']) && ok;
  } else {
    ok = false;
  }

  if (
    checkArray(errors, `${path}/affected`, obj['affected'], { maxItems: 10 })
  ) {
    obj['affected'].forEach((item, i) => {
      ok = checkAffectedItem(errors, `${path}/affected/${i}`, item) && ok;
    });
  } else {
    ok = false;
  }

  ok =
    checkEnum(
      errors,
      `${path}/claimStatus`,
      obj['claimStatus'],
      CLAIM_STATUS_VALUES,
    ) && ok;

  if (checkArray(errors, `${path}/conflicts`, obj['conflicts'])) {
    obj['conflicts'].forEach((item, i) => {
      ok = checkConflict(errors, `${path}/conflicts/${i}`, item) && ok;
    });
  } else {
    ok = false;
  }

  ok =
    checkStringArray(errors, `${path}/missingContext`, obj['missingContext'], {
      itemMinLength: 1,
    }) && ok;

  return ok;
}

function checkWarning(errors: string[], path: string, v: unknown): boolean {
  if (!checkShape(errors, path, v, ['code', 'message'])) return false;
  const obj = v;
  let ok = true;
  ok =
    checkEnum(errors, `${path}/code`, obj['code'], WARNING_CODE_VALUES) && ok;
  ok =
    checkString(errors, `${path}/message`, obj['message'], { minLength: 1 }) &&
    ok;
  return ok;
}

export function validateLlmOutput(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (
    !checkShape(errors, '<root>', value, [
      'status',
      'data',
      'confidence',
      'confidenceReason',
      'warnings',
    ])
  ) {
    return { ok: false, errors };
  }
  const obj = value;
  let ok = true;

  ok = checkEnum(errors, 'status', obj['status'], STATUS_VALUES) && ok;
  ok = checkNewsAnalysis(errors, 'data', obj['data']) && ok;
  ok = checkNumberRange(errors, 'confidence', obj['confidence'], 0, 1) && ok;
  ok =
    checkString(errors, 'confidenceReason', obj['confidenceReason'], {
      minLength: 1,
    }) && ok;

  if (checkArray(errors, 'warnings', obj['warnings'])) {
    obj['warnings'].forEach((item, i) => {
      ok = checkWarning(errors, `warnings/${i}`, item) && ok;
    });
  } else {
    ok = false;
  }

  if (!ok || errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: value as unknown as LlmNewsOutput };
}
