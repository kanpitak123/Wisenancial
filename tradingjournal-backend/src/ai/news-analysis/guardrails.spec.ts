import {
  checkAnalysis,
  blocking,
  visibleLength,
  type GuardrailContext,
} from './guardrails';
import type { LlmNewsOutput } from './types';

/** Deeply-mutable mirror of a (deeply readonly) type, for building editable test fixtures. */
type DeepMutable<T> = T extends (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

/**
 * Ported from tests/test_news_pipeline.py (GuardrailTests, ConflictTests) in the Python
 * reference implementation. Fixtures mirror tests/golden/N-01_beat_weak_guidance.json /
 * eval/dryrun/N-01.json and tests/golden/N-03_conflicting_revenue.json / eval/dryrun/N-03.json,
 * translated field-by-field from snake_case to the camelCase `LlmNewsOutput` contract.
 */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rules(
  issues: ReturnType<typeof checkAnalysis>,
  level: 'error' | 'warning' = 'error',
): Set<string> {
  return new Set(issues.filter((i) => i.level === level).map((i) => i.rule));
}

// --- N-01: Earnings beat + weak guidance ------------------------------------------------

function n01Good(): DeepMutable<LlmNewsOutput> {
  return {
    status: 'success',
    confidence: 0.82,
    confidenceReason:
      'ตัวเลขผลประกอบการและประมาณการมาจากบริษัทและครบถ้วน แต่ไม่มีประมาณการทั้งปีและรายละเอียดลูกค้าที่ปรับสินค้าคงคลัง',
    warnings: [],
    data: {
      headline:
        'Kestrel Microdevices รายได้ Q2 เหนือคาด แต่ประมาณการรายได้ไตรมาสถัดไปต่ำกว่าที่นักวิเคราะห์คาด',
      summary: [
        'Kestrel รายงานรายได้ Q2 2026 ที่ 4.2 พันล้านดอลลาร์ และ adjusted EPS 1.12 ดอลลาร์ สูงกว่าที่นักวิเคราะห์คาด',
        'แต่ประมาณการรายได้ไตรมาส 3 ที่ 4.0-4.1 พันล้านดอลลาร์ ต่ำกว่าที่คาดไว้ 4.5 พันล้านดอลลาร์ จากการปรับสินค้าคงคลังของลูกค้ารายใหญ่',
        'ควรติดตามว่า Demand จะกลับสู่ภาวะปกติในสองถึงสามไตรมาสตามที่ผู้บริหารคาดหรือไม่ เพราะบริษัทยังไม่ให้ประมาณการทั้งปี',
      ],
      positiveFactors: [
        {
          factor: 'รายได้และ EPS เหนือคาด',
          reason:
            'รายได้ 4.2 พันล้านดอลลาร์ สูงกว่า consensus 3.9 พันล้านดอลลาร์ และ adjusted EPS 1.12 ดอลลาร์ สูงกว่าคาดที่ 1.05 ดอลลาร์',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
      ],
      negativeFactors: [
        {
          factor: 'Guidance ไตรมาส 3 ต่ำกว่าคาด',
          reason:
            'บริษัทประมาณการรายได้ไตรมาส 3 ที่ 4.0-4.1 พันล้านดอลลาร์ ต่ำกว่าที่นักวิเคราะห์คาดไว้ 4.5 พันล้านดอลลาร์',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
        {
          factor: 'ลูกค้าปรับลดสินค้าคงคลัง',
          reason:
            'บริษัทระบุว่าลูกค้ารายใหญ่หลายรายกำลังปรับสินค้าคงคลัง ซึ่งอาจกดดัน Demand ในระยะสั้น',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
        {
          factor: 'ระยะเวลาฟื้นตัวไม่แน่นอน',
          reason:
            'การฟื้นตัวของ Demand ในสองถึงสามไตรมาสเป็นการคาดการณ์ของผู้บริหารที่ยังไม่มีข้อมูลยืนยัน',
          basis: 'interpretation',
          evidenceRefs: ['src:gw-kstl-0912'],
        },
      ],
      counterpointNote: null,
      newsTone: 'mixed',
      sentiment: 'mixed_negative',
      sentimentReason:
        'ผลประกอบการไตรมาสที่ผ่านมาดีกว่าคาด แต่ประมาณการไตรมาสถัดไปต่ำกว่าคาดและสะท้อน Demand ที่อ่อนลงในระยะสั้น',
      impact: {
        shortTerm: {
          direction: 'mixed_negative',
          strength: 'medium',
          rationale:
            'Guidance ที่ต่ำกว่าคาดอาจมีน้ำหนักมากกว่าผลประกอบการที่ผ่านมา',
          uncertainty: 'medium',
        },
        mediumTerm: {
          direction: 'uncertain',
          strength: null,
          rationale:
            'ขึ้นกับว่าการปรับสินค้าคงคลังของลูกค้าจะจบลงตามที่ผู้บริหารคาดหรือไม่',
          uncertainty: 'high',
        },
        longTerm: null,
      },
      affected: [
        {
          name: 'Kestrel Microdevices',
          symbol: 'KSTL',
          kind: 'asset',
          relation: 'direct',
          mechanism: 'ผลประกอบการและประมาณการของบริษัทโดยตรง',
          confidence: 0.82,
        },
        {
          name: 'Semiconductor',
          symbol: null,
          kind: 'sector',
          relation: 'second_order',
          mechanism:
            'การปรับสินค้าคงคลังของลูกค้ารายใหญ่อาจสะท้อนภาวะ Demand ของอุตสาหกรรม แต่ข่าวไม่ได้ระบุผู้ผลิตรายอื่น',
          confidence: 0.4,
        },
      ],
      claimStatus: 'confirmed',
      conflicts: [],
      missingContext: [
        'ประมาณการทั้งปี',
        'ชื่อลูกค้าและขนาดการปรับสินค้าคงคลัง',
      ],
    },
  };
}

const N01_HEADLINE =
  'Kestrel Microdevices tops Q2 estimates but third-quarter forecast disappoints';
const N01_CONTENT =
  'Kestrel Microdevices reported second-quarter 2026 revenue of $4.2 billion, above the analyst consensus of $3.9 billion, ' +
  'and adjusted EPS of $1.12 versus the $1.05 expected. Gross margin was 51.3%. However, the company guided third-quarter ' +
  'revenue to $4.0-4.1 billion, below the $4.5 billion analysts had expected, citing inventory adjustments at several large ' +
  'customers. CFO Dana Morel said the company expects demand to normalize over the next two to three quarters but gave no ' +
  'full-year outlook.';

function n01Context(): GuardrailContext {
  return {
    sourceText: `${N01_HEADLINE}\n${N01_CONTENT}`,
    knownSourceIds: new Set(['gw-kstl-0912']),
    stale: false,
  };
}

describe('checkAnalysis - N-01 beat + weak guidance', () => {
  const ctx = n01Context();

  it('good output has no blocking errors', () => {
    expect(blocking(checkAnalysis(n01Good(), ctx))).toEqual([]);
  });

  it('blocks guarantee wording (AI-SAFE-001)', () => {
    const out = clone(n01Good());
    out.data.summary[2] = 'หุ้นขึ้นแน่หลังจากนี้';
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-SAFE-001');
  });

  it('blocks direct buy/sell commands (AI-SAFE-001)', () => {
    const out = clone(n01Good());
    out.data.impact.shortTerm!.rationale = 'ซื้อเลยก่อนราคาขึ้น';
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-SAFE-001');
  });

  it('does not block a negated guarantee', () => {
    const out = clone(n01Good());
    out.data.summary[2] = 'ประมาณการของผู้บริหารไม่การันตีว่า Demand จะฟื้นตัว';
    expect(rules(checkAnalysis(out, ctx))).not.toContain('AI-SAFE-001');
  });

  it('blocks false probability language in confidence_reason (AI-GEN-004)', () => {
    const out = clone(n01Good());
    out.confidenceReason = 'มีโอกาส 82% ที่ราคาจะขึ้น';
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-GEN-004');
  });

  it('blocks an invented number not present in the source (AI-SAFE-002)', () => {
    const out = clone(n01Good());
    out.data.summary[1] = 'ประมาณการรายได้ไตรมาส 3 ลดลง 9.5% จากไตรมาสก่อน';
    const issues = checkAnalysis(out, ctx);
    expect(rules(issues)).toContain('AI-SAFE-002');
    expect(issues.some((i) => i.message.includes('9.5'))).toBe(true);
  });

  it('does not treat quarter labels as numbers (AI-SAFE-002)', () => {
    const out = clone(n01Good());
    out.data.summary[0] = 'รายได้ Q2 และแนวโน้มไตรมาส 3 ตามที่บริษัทรายงาน';
    expect(rules(checkAnalysis(out, ctx))).not.toContain('AI-SAFE-002');
  });

  it('regression: number words in the source count as digits ("two to three quarters" -> "2-3 ไตรมาส")', () => {
    const out = clone(n01Good());
    out.data.summary[2] = 'CFO คาดว่า Demand จะกลับสู่ภาวะปกติภายใน 2-3 ไตรมาส';
    expect(rules(checkAnalysis(out, ctx))).not.toContain('AI-SAFE-002');
  });

  it('regression: headline length is measured in visible characters (Thai combining marks excluded)', () => {
    // 126 code points, 109 visible characters (real Opus 5 headline) - must NOT warn.
    const headline =
      'มีรายงานว่า Nvidia หารือเป็น anchor investor ใน IPO ของ Anthropic สูงสุด 10 พันล้านดอลลาร์ แต่ดีลยังไม่ยืนยันและอาจเปลี่ยนแปลง';
    expect([...headline].length).toBe(126);
    expect(visibleLength(headline)).toBe(109);

    const out = clone(n01Good());
    out.data.headline = headline;
    expect(rules(checkAnalysis(out, ctx), 'warning')).not.toContain(
      'AI-NEWS-001',
    );
  });

  it('warns on sensational wording (AI-GEN-005)', () => {
    const out = clone(n01Good());
    out.data.headline =
      'Kestrel รายได้ทะยานเหนือคาด แต่ guidance ต่ำกว่าที่นักวิเคราะห์คาดไว้สำหรับไตรมาสถัดไป';
    expect(rules(checkAnalysis(out, ctx), 'warning')).toContain('AI-GEN-005');
  });

  it('blocks an evidence_ref pointing at an unknown source (AI-NEWS-003)', () => {
    const out = clone(n01Good());
    out.data.positiveFactors[0].evidenceRefs = ['src:made-up-source'];
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-003');
  });

  it('blocks a one-sided analysis with no counterpoint_note (AI-GEN-002)', () => {
    const out = clone(n01Good());
    out.data.negativeFactors = [];
    out.data.counterpointNote = null;
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-GEN-002');
  });

  it('a scenario-only side still needs counterpoint_note (AI-GEN-002)', () => {
    const out = clone(n01Good());
    out.data.negativeFactors = [
      {
        factor: 'Valuation',
        reason: 'หากความคาดหวังสูง ราคาอาจผันผวน',
        basis: 'scenario',
        evidenceRefs: ['src:gw-kstl-0912'],
      },
    ];
    out.data.counterpointNote = null;
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-GEN-002');
  });

  it('warns when a scenario factor has no conditional wording (AI-GEN-001)', () => {
    const out = clone(n01Good());
    out.data.negativeFactors[2].basis = 'scenario';
    out.data.negativeFactors[2].reason = 'Demand จะไม่ฟื้นตัวในปีนี้';
    expect(rules(checkAnalysis(out, ctx), 'warning')).toContain('AI-GEN-001');
  });

  it('blocks insufficient_data status carrying a non-null sentiment (AI-GEN-003)', () => {
    const out = clone(n01Good());
    out.status = 'insufficient_data';
    out.confidence = 0.3;
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-GEN-003');
  });

  it('blocks a success status with no sentiment (AI-NEWS-004)', () => {
    const out = clone(n01Good());
    out.data.sentiment = null;
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-004');
  });

  it('blocks every summary line repeating the headline (AI-NEWS-002)', () => {
    const out = clone(n01Good());
    out.data.summary = [out.data.headline];
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-002');
  });
});

// --- N-03: Conflicting revenue figures ---------------------------------------------------

function n03Good(): DeepMutable<LlmNewsOutput> {
  return {
    status: 'partial',
    confidence: 0.5,
    confidenceReason:
      'สองแหล่งข่าวรายงานตัวเลขรายได้และอัตราการเติบโตไม่ตรงกัน จึงยังระบุขนาดการเติบโตที่แท้จริงไม่ได้',
    warnings: [
      {
        code: 'AI_SOURCE_CONFLICT',
        message: 'รายได้ Q2 2026 ไม่ตรงกันระหว่างสองแหล่งข่าว',
      },
    ],
    data: {
      headline:
        'ARCR รายงานกำไรสุทธิ Q2 610 ล้านบาท แต่สองแหล่งข่าวรายงานตัวเลขรายได้ไม่ตรงกัน',
      summary: [
        'ทั้งสองแหล่งข่าวรายงานตรงกันว่า ARCR มีกำไรสุทธิ Q2 2026 ที่ 610 ล้านบาท',
        'แต่ตัวเลขรายได้ไม่ตรงกัน: ข่าวหุ้นรายวันระบุ 12,400 ล้านบาท (+6% YoY) ขณะที่ตลาดทุนออนไลน์ระบุ 14,200 ล้านบาท (+21% YoY)',
        'ควรตรวจสอบกับงบการเงินที่แจ้งตลาดหลักทรัพย์ก่อนประเมินการเติบโตของบริษัท',
      ],
      positiveFactors: [
        {
          factor: 'รายได้เติบโต YoY',
          reason:
            'ทั้งสองแหล่งระบุว่ารายได้เติบโตจากปีก่อน แม้อัตราการเติบโตจะไม่ตรงกัน',
          basis: 'fact',
          evidenceRefs: ['src:khd-arcr-0912', 'src:tto-arcr-0912'],
        },
        {
          factor: 'การขยายสาขาและยอดขาย',
          reason:
            'ข่าวหุ้นรายวันระบุการเปิดสาขาใหม่ 18 แห่งและ SSSG เติบโต 3.5% ส่วนตลาดทุนออนไลน์ระบุว่ายอดขายออนไลน์เพิ่มขึ้นต่อเนื่อง',
          basis: 'fact',
          evidenceRefs: ['src:khd-arcr-0912', 'src:tto-arcr-0912'],
        },
      ],
      negativeFactors: [],
      counterpointNote:
        'ข่าวไม่ได้ระบุปัจจัยลบด้านธุรกิจที่มีหลักฐานรองรับโดยตรง ประเด็นหลักที่ต้องระวังคือตัวเลขรายได้ที่ขัดแย้งกัน',
      newsTone: 'positive',
      sentiment: 'mixed_positive',
      sentimentReason:
        'ทั้งสองแหล่งระบุว่ารายได้เติบโต แต่ขนาดการเติบโตยังไม่ชัดเจนเพราะข้อมูลขัดแย้งกัน',
      impact: {
        shortTerm: {
          direction: 'uncertain',
          strength: null,
          rationale: 'ผลต่อมุมมองต่อบริษัทขึ้นกับว่าตัวเลขรายได้ใดถูกต้อง',
          uncertainty: 'high',
        },
        mediumTerm: null,
        longTerm: null,
      },
      affected: [
        {
          name: 'Arcadia Retail',
          symbol: 'ARCR',
          kind: 'asset',
          relation: 'direct',
          mechanism: 'ผลประกอบการของบริษัทโดยตรง',
          confidence: 0.5,
        },
      ],
      claimStatus: 'confirmed',
      conflicts: [
        {
          claim: 'รายได้ Q2 2026',
          values: [
            { value: '12,400 ล้านบาท (+6% YoY)', sourceId: 'khd-arcr-0912' },
            { value: '14,200 ล้านบาท (+21% YoY)', sourceId: 'tto-arcr-0912' },
          ],
          note: 'ยังไม่มีข้อมูลเพียงพอที่จะระบุว่าตัวเลขใดถูกต้อง ควรตรวจสอบกับงบการเงินที่แจ้งตลาดหลักทรัพย์',
        },
      ],
      missingContext: [
        'งบการเงิน Q2 2026 ที่แจ้งตลาดหลักทรัพย์',
        'ตัวเลขรายได้ที่ยืนยันแล้ว',
      ],
    },
  };
}

function n03Context(): GuardrailContext {
  const headline1 = 'ARCR กำไร Q2 610 ล้านบาท รายได้โต 6%';
  const content1 =
    'บมจ.อาร์คาเดีย รีเทล (ARCR) รายงานผลประกอบการ Q2 2026 รายได้รวม 12,400 ล้านบาท เพิ่มขึ้น 6% YoY กำไรสุทธิ 610 ล้านบาท ' +
    'โดยได้แรงหนุนจากยอดขายสาขาเดิม (SSSG) ที่เติบโต 3.5% และการเปิดสาขาใหม่ 18 แห่งในช่วงครึ่งแรกของปี';
  const headline2 = 'ARCR รายได้ Q2 แตะ 14,200 ล้านบาท โต 21%';
  const content2 =
    'ARCR เปิดเผยรายได้ไตรมาส 2 ปี 2026 อยู่ที่ 14,200 ล้านบาท เติบโต 21% YoY และมีกำไรสุทธิ 610 ล้านบาท ' +
    'ผู้บริหารระบุว่าการเติบโตมาจากการขยายสาขาและยอดขายช่องทางออนไลน์ที่เพิ่มขึ้นต่อเนื่อง';
  return {
    sourceText: `${headline1}\n${content1}\n${headline2}\n${content2}`,
    knownSourceIds: new Set(['khd-arcr-0912', 'tto-arcr-0912']),
    stale: false,
  };
}

describe('checkAnalysis - N-03 conflicting revenue', () => {
  const ctx = n03Context();

  it('good output has no blocking errors', () => {
    expect(blocking(checkAnalysis(n03Good(), ctx))).toEqual([]);
  });

  it('blocks conflicts present without the AI_SOURCE_CONFLICT warning (AI-NEWS-008)', () => {
    const out = clone(n03Good());
    out.warnings = [];
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-008');
  });

  it('caps confidence when conflicts are present', () => {
    const out = clone(n03Good());
    out.confidence = 0.9;
    const issues = checkAnalysis(out, ctx);
    expect(
      issues.some(
        (i) => i.message.includes('cap') && i.message.includes('conflict'),
      ),
    ).toBe(true);
  });

  it('blocks a headline that states only one conflicting value (AI-NEWS-008)', () => {
    const out = clone(n03Good());
    out.data.headline =
      'ARCR รายได้ Q2 แตะ 14,200 ล้านบาท กำไรสุทธิ 610 ล้านบาท ตามรายงานผลประกอบการล่าสุด';
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-008');
  });

  it('allows a summary line that states both conflicting values', () => {
    const issues = checkAnalysis(n03Good(), ctx);
    expect(issues.filter((i) => i.rule === 'AI-NEWS-008')).toEqual([]);
  });

  it('blocks AI_SOURCE_CONFLICT warning present without any conflict details (AI-NEWS-008)', () => {
    const out = clone(n03Good());
    out.data.conflicts = [];
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-008');
  });

  it('blocks an unknown source_id inside a conflict value (AI-NEWS-008)', () => {
    const out = clone(n03Good());
    out.data.conflicts[0].values[0].sourceId = 'unknown-source';
    expect(rules(checkAnalysis(out, ctx))).toContain('AI-NEWS-008');
  });
});

describe('blocking', () => {
  it('keeps only error-level issues', () => {
    const issues = [
      { level: 'error' as const, rule: 'A', message: 'a' },
      { level: 'warning' as const, rule: 'B', message: 'b' },
    ];
    expect(blocking(issues)).toEqual([
      { level: 'error', rule: 'A', message: 'a' },
    ]);
  });
});
