import { validateLlmOutput } from './validate';
import type { LlmNewsOutput } from './types';

/** Deeply-mutable mirror of a (deeply readonly) type, for building editable test fixtures. */
type DeepMutable<T> = T extends (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

/** Minimal-but-complete valid LlmNewsOutput, mirroring eval/dryrun/N-01.json (camelCase). */
function goodOutput(): DeepMutable<LlmNewsOutput> {
  return {
    status: 'success',
    confidence: 0.82,
    confidenceReason: 'ตัวเลขผลประกอบการมาจากบริษัทและครบถ้วน',
    warnings: [],
    data: {
      headline:
        'Kestrel Microdevices รายได้ Q2 เหนือคาด แต่ประมาณการไตรมาสถัดไปต่ำกว่าคาด',
      summary: [
        'Kestrel รายงานรายได้ Q2 2026 สูงกว่าที่นักวิเคราะห์คาด',
        'แต่ประมาณการรายได้ไตรมาส 3 ต่ำกว่าที่คาดไว้',
      ],
      positiveFactors: [
        {
          factor: 'รายได้และ EPS เหนือคาด',
          reason: 'รายได้สูงกว่า consensus',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
      ],
      negativeFactors: [
        {
          factor: 'Guidance ต่ำกว่าคาด',
          reason: 'บริษัทประมาณการรายได้ไตรมาส 3 ต่ำกว่าที่คาด',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
      ],
      counterpointNote: null,
      newsTone: 'mixed',
      sentiment: 'mixed_negative',
      sentimentReason: 'ผลประกอบการดีกว่าคาดแต่ guidance แย่กว่าคาด',
      impact: {
        shortTerm: {
          direction: 'mixed_negative',
          strength: 'medium',
          rationale: 'guidance ที่ต่ำกว่าคาด',
          uncertainty: 'medium',
        },
        mediumTerm: null,
        longTerm: null,
      },
      affected: [
        {
          name: 'Kestrel Microdevices',
          symbol: 'KSTL',
          kind: 'asset',
          relation: 'direct',
          mechanism: 'ผลประกอบการโดยตรง',
          confidence: 0.82,
        },
      ],
      claimStatus: 'confirmed',
      conflicts: [],
      missingContext: ['ประมาณการทั้งปี'],
    },
  };
}

function clone(): ReturnType<typeof goodOutput> {
  return JSON.parse(JSON.stringify(goodOutput())) as ReturnType<
    typeof goodOutput
  >;
}

describe('validateLlmOutput', () => {
  it('accepts a well-formed output', () => {
    const result = validateLlmOutput(goodOutput());
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object value', () => {
    const result = validateLlmOutput('not an object');
    expect(result.ok).toBe(false);
  });

  it('rejects more than 3 summary lines', () => {
    const out = clone();
    out.data.summary.push('บรรทัดที่สาม', 'บรรทัดที่สี่');
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.startsWith('data/summary:') && e.includes('at most 3 items'),
        ),
      ).toBe(true);
    }
  });

  it('rejects an empty summary array (minItems 1)', () => {
    const out = clone();
    out.data.summary = [];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.startsWith('data/summary:') && e.includes('at least 1'),
        ),
      ).toBe(true);
    }
  });

  it('rejects a missing required field', () => {
    const out = clone() as unknown as Record<string, unknown>;
    const data = out['data'] as Record<string, unknown>;
    delete data['claimStatus'];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) =>
          e.includes("missing required property 'claimStatus'"),
        ),
      ).toBe(true);
    }
  });

  it('rejects an unknown top-level property (additionalProperties: false)', () => {
    const out = clone() as unknown as Record<string, unknown>;
    out['extra'] = true;
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("unexpected property 'extra'")),
      ).toBe(true);
    }
  });

  it('rejects an invalid status enum value', () => {
    const out = clone() as unknown as Record<string, unknown>;
    out['status'] = 'done';
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith('status:'))).toBe(true);
    }
  });

  it('rejects confidence outside 0-1', () => {
    const out = clone() as unknown as Record<string, unknown>;
    out['confidence'] = 1.5;
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith('confidence:'))).toBe(true);
    }
  });

  it('rejects more than 5 positive factors', () => {
    const out = clone();
    const factor = out.data.positiveFactors[0];
    out.data.positiveFactors = [factor, factor, factor, factor, factor, factor];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) =>
            e.startsWith('data/positiveFactors:') && e.includes('at most 5'),
        ),
      ).toBe(true);
    }
  });

  it('rejects an evidence_ref that does not match ^src:\\S+$', () => {
    const out = clone();
    out.data.positiveFactors[0].evidenceRefs = ['made-up-source'];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('evidenceRefs/0'))).toBe(
        true,
      );
    }
  });

  it('rejects empty evidence_refs (minItems 1)', () => {
    const out = clone();
    out.data.positiveFactors[0].evidenceRefs = [];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.includes('evidenceRefs') && e.includes('at least 1'),
        ),
      ).toBe(true);
    }
  });

  it('rejects a conflict with fewer than 2 values', () => {
    const out = clone();
    out.data.conflicts = [
      {
        claim: 'รายได้ Q2',
        values: [{ value: '100', sourceId: 'gw-kstl-0912' }],
        note: 'note',
      },
    ];
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.includes('conflicts/0/values:') && e.includes('at least 2'),
        ),
      ).toBe(true);
    }
  });

  it('rejects an invalid factor.basis enum value', () => {
    const out = clone() as unknown as {
      data: { positiveFactors: Array<Record<string, unknown>> };
    };
    out.data.positiveFactors[0]['basis'] = 'guess';
    const result = validateLlmOutput(out);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes('positiveFactors/0/basis')),
      ).toBe(true);
    }
  });
});
