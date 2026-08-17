import type { DCAScenario, DCASimulatorResponse } from 'src/types/analytics.types';

/**
 * รวมผลจำลอง DCA ของหลายหุ้นให้เป็นผลระดับพอร์ตเดียว
 *
 * Port มาจาก aggregateScenarioResponses/aggregateDcaAnalysis ใน AnalyticsPage ของ
 * โปรเจกต์เก่า — backend มี /analytics/dca-simulator แค่ทีละหุ้น การรวมจึงทำฝั่ง client
 *
 * แยกออกมาจาก component เพื่อให้เทสตรรกะการรวมได้โดยไม่ต้อง mount อะไรเลย
 */

export interface DcaAllocationRow {
  id: number;
  symbol: string;
  allocationPercent: number;
}

export interface DcaBreakdownEntry extends DCASimulatorResponse {
  allocationPercent: number;
}

export interface DcaCombinedResult {
  currency: string;
  totalMonthlyAmount: number;
  durationYears: number;
  scenarios: DCAScenario[];
  analysis: {
    historicalContext: string;
    riskFactors: string[];
    recommendations: string[];
  };
  breakdown: DcaBreakdownEntry[];
}

/** ลำดับที่อยากให้การ์ดเรียง ไม่ใช่ลำดับที่ backend บังเอิญคืนมา */
const SCENARIO_ORDER: DCAScenario['scenario'][] = ['Low Growth', 'Medium Growth', 'High Growth'];

/**
 * รวม scenario ข้ามหุ้น
 *
 * เงินลงทุน/มูลค่าปลายทางบวกกันตรงๆ ได้ ส่วน annualizedReturn เป็นอัตรา บวกกันไม่ได้ —
 * ต้องถ่วงน้ำหนักด้วย totalInvested ของหุ้นนั้น ไม่งั้นหุ้นสัดส่วน 5% จะมีน้ำหนักเท่ากับ 60%
 */
export function aggregateScenarios(responses: { data: DCASimulatorResponse }[]): DCAScenario[] {
  const buckets = new Map<
    string,
    {
      scenario: DCAScenario['scenario'];
      totalInvested: number;
      finalValue: number;
      weightedAnnualized: number;
      annualizedWeight: number;
      reasoning: string[];
      confidenceSum: number;
      sampleCount: number;
    }
  >();

  for (const entry of responses) {
    for (const scenario of entry.data.scenarios) {
      const bucket = buckets.get(scenario.scenario) ?? {
        scenario: scenario.scenario,
        totalInvested: 0,
        finalValue: 0,
        weightedAnnualized: 0,
        annualizedWeight: 0,
        reasoning: [] as string[],
        confidenceSum: 0,
        sampleCount: 0,
      };

      bucket.totalInvested += scenario.totalInvested;
      bucket.finalValue += scenario.finalValue;
      bucket.weightedAnnualized += scenario.annualizedReturn * scenario.totalInvested;
      bucket.annualizedWeight += scenario.totalInvested;
      bucket.reasoning.push(`${entry.data.symbol}: ${scenario.reasoning}`);
      bucket.confidenceSum += scenario.confidence;
      bucket.sampleCount += 1;

      buckets.set(scenario.scenario, bucket);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      scenario: bucket.scenario,
      totalInvested: Number(bucket.totalInvested.toFixed(2)),
      finalValue: Number(bucket.finalValue.toFixed(2)),
      totalReturn: Number((bucket.finalValue - bucket.totalInvested).toFixed(2)),
      annualizedReturn:
        bucket.annualizedWeight > 0
          ? Number((bucket.weightedAnnualized / bucket.annualizedWeight).toFixed(4))
          : 0,
      reasoning: bucket.reasoning.join(' • '),
      confidence: Math.round(bucket.confidenceSum / Math.max(1, bucket.sampleCount)),
    }))
    .sort((a, b) => SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario));
}

/** รวมคำอธิบาย/ความเสี่ยง/คำแนะนำ โดยตัดข้อความซ้ำที่มักโผล่ซ้ำกันหลายหุ้นออก */
export function aggregateAnalysis(
  responses: { data: DCASimulatorResponse }[],
): DcaCombinedResult['analysis'] {
  const historicalContext: string[] = [];
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  for (const entry of responses) {
    const analysis = entry.data.analysis;

    if (!analysis) continue;

    if (analysis.historicalContext) {
      historicalContext.push(`[${entry.data.symbol}] ${analysis.historicalContext}`);
    }

    riskFactors.push(...(analysis.riskFactors ?? []));
    recommendations.push(...(analysis.recommendations ?? []));
  }

  return {
    historicalContext: historicalContext.join(' • '),
    riskFactors: [...new Set(riskFactors)],
    recommendations: [...new Set(recommendations)],
  };
}

export interface NormalizedAllocation {
  symbol: string;
  allocationPercent: number;
  /** สัดส่วนหลัง normalize ให้รวมได้ 1 — ใช้คูณกับเงินลงทุนรายเดือน */
  weight: number;
}

/**
 * เตรียมสัดส่วนก่อนยิง simulate
 *
 * normalize ด้วยผลรวมจริง ไม่ใช่หาร 100 ตายตัว — ถ้าผู้ใช้ใส่รวมได้ 98% เงินลงทุนรายเดือน
 * ต้องยังถูกใช้เต็มจำนวน ไม่ใช่หายไป 2%
 */
export function normalizeAllocations(rows: DcaAllocationRow[]): NormalizedAllocation[] {
  const prepared = rows
    .map((row) => ({
      symbol: row.symbol.trim().toUpperCase(),
      allocationPercent: clampAllocationPercent(row.allocationPercent),
    }))
    .filter((row) => row.symbol !== '' && row.allocationPercent > 0);

  const total = prepared.reduce((sum, row) => sum + row.allocationPercent, 0);

  if (total <= 0) return [];

  return prepared.map((row) => ({
    ...row,
    weight: row.allocationPercent / total,
  }));
}

export function clampAllocationPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;

  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

/** แบ่งสัดส่วนเท่าๆ กัน แล้วโยนเศษปัดไปแถวสุดท้ายให้รวมได้ 100 พอดี */
export function balanceAllocations(rows: DcaAllocationRow[]): DcaAllocationRow[] {
  const valid = rows.filter((row) => row.symbol.trim() !== '');

  if (valid.length === 0) return rows;

  const evenShare = Math.round((100 / valid.length) * 100) / 100;
  const allocated = Number((evenShare * valid.length).toFixed(2));
  const remainder = Number((100 - allocated).toFixed(2));

  let seen = 0;

  return rows.map((row) => {
    if (row.symbol.trim() === '') return { ...row, allocationPercent: 0 };

    seen += 1;
    const isLast = seen === valid.length;

    return {
      ...row,
      allocationPercent: isLast ? Number((evenShare + remainder).toFixed(2)) : evenShare,
    };
  });
}
