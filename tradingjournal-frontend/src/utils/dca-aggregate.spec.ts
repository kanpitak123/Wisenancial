/**
 * ตรรกะรวมผล DCA หลายหุ้น — จุดที่พลาดง่ายคือ annualizedReturn ซึ่งเป็น "อัตรา"
 * ถ้าเอามาเฉลี่ยแบบธรรมดา หุ้นสัดส่วน 5% จะมีน้ำหนักเท่ากับหุ้นสัดส่วน 95%
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateAnalysis,
  aggregateScenarios,
  balanceAllocations,
  clampAllocationPercent,
  normalizeAllocations,
} from './dca-aggregate';
import type { DCAScenario, DCASimulatorResponse } from 'src/types/analytics.types';

function scenario(
  name: DCAScenario['scenario'],
  totalInvested: number,
  finalValue: number,
  annualizedReturn: number,
  confidence = 70,
): DCAScenario {
  return {
    scenario: name,
    totalInvested,
    finalValue,
    totalReturn: finalValue - totalInvested,
    annualizedReturn,
    reasoning: `${name} reasoning`,
    confidence,
  };
}

function response(symbol: string, scenarios: DCAScenario[]): { data: DCASimulatorResponse } {
  return {
    data: {
      symbol,
      monthlyAmount: 100,
      durationYears: 5,
      scenarios,
      analysis: {
        historicalContext: `${symbol} context`,
        riskFactors: ['ความผันผวนสูง'],
        recommendations: ['ทยอยลงทุน'],
      },
    },
  };
}

describe('aggregateScenarios', () => {
  it('บวกเงินลงทุนและมูลค่าปลายทางข้ามหุ้น', () => {
    const result = aggregateScenarios([
      response('AAPL', [scenario('Medium Growth', 6000, 8000, 10)]),
      response('MSFT', [scenario('Medium Growth', 4000, 5000, 5)]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.totalInvested).toBe(10000);
    expect(result[0]!.finalValue).toBe(13000);
    expect(result[0]!.totalReturn).toBe(3000);
  });

  it('annualizedReturn ถ่วงน้ำหนักด้วยเงินลงทุน ไม่ใช่เฉลี่ยธรรมดา', () => {
    const result = aggregateScenarios([
      response('BIG', [scenario('Medium Growth', 9000, 10000, 10)]),
      response('TINY', [scenario('Medium Growth', 1000, 1100, 0)]),
    ]);

    // เฉลี่ยธรรมดาจะได้ 5 — ถ่วงน้ำหนักต้องได้ (10×9000 + 0×1000) / 10000 = 9
    expect(result[0]!.annualizedReturn).toBe(9);
  });

  it('เรียงการ์ดเป็น Low -> Medium -> High เสมอ ไม่ตามลำดับที่ backend คืนมา', () => {
    const result = aggregateScenarios([
      response('AAPL', [
        scenario('High Growth', 1000, 2000, 20),
        scenario('Low Growth', 1000, 900, -2),
        scenario('Medium Growth', 1000, 1400, 8),
      ]),
    ]);

    expect(result.map((item) => item.scenario)).toEqual([
      'Low Growth',
      'Medium Growth',
      'High Growth',
    ]);
  });

  it('confidence เฉลี่ยจากจำนวนหุ้นที่มีข้อมูล', () => {
    const result = aggregateScenarios([
      response('A', [scenario('Low Growth', 100, 100, 0, 60)]),
      response('B', [scenario('Low Growth', 100, 100, 0, 80)]),
    ]);

    expect(result[0]!.confidence).toBe(70);
  });

  it('ไม่มี response เลย -> คืน array ว่าง ไม่ throw', () => {
    expect(aggregateScenarios([])).toEqual([]);
  });
});

describe('aggregateAnalysis', () => {
  it('ติดป้ายชื่อหุ้นหน้าบริบทย้อนหลัง และตัดความเสี่ยง/คำแนะนำที่ซ้ำกันออก', () => {
    const result = aggregateAnalysis([
      response('AAPL', []),
      response('MSFT', []),
    ]);

    expect(result.historicalContext).toContain('[AAPL]');
    expect(result.historicalContext).toContain('[MSFT]');
    // ทั้งสองหุ้นให้ risk/recommendation ข้อความเดียวกัน ต้องเหลือข้อละครั้ง
    expect(result.riskFactors).toEqual(['ความผันผวนสูง']);
    expect(result.recommendations).toEqual(['ทยอยลงทุน']);
  });
});

describe('normalizeAllocations', () => {
  it('normalize ด้วยผลรวมจริง — รวมได้ 98% เงินก็ยังถูกใช้เต็มจำนวน', () => {
    const result = normalizeAllocations([
      { id: 1, symbol: 'aapl', allocationPercent: 49 },
      { id: 2, symbol: 'msft', allocationPercent: 49 },
    ]);

    expect(result.map((row) => row.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(result.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1, 10);
  });

  it('ตัดแถวที่ยังไม่ได้เลือกหุ้นหรือสัดส่วนเป็น 0 ออก', () => {
    const result = normalizeAllocations([
      { id: 1, symbol: 'AAPL', allocationPercent: 100 },
      { id: 2, symbol: '', allocationPercent: 50 },
      { id: 3, symbol: 'MSFT', allocationPercent: 0 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('AAPL');
  });

  it('ไม่มีแถวที่ใช้ได้เลย -> คืน array ว่าง (ไม่หารด้วยศูนย์)', () => {
    expect(normalizeAllocations([{ id: 1, symbol: '', allocationPercent: 0 }])).toEqual([]);
  });
});

describe('clampAllocationPercent', () => {
  it('บีบให้อยู่ในช่วง 0-100 และกัน NaN', () => {
    expect(clampAllocationPercent(150)).toBe(100);
    expect(clampAllocationPercent(-5)).toBe(0);
    expect(clampAllocationPercent(Number.NaN)).toBe(0);
    expect(clampAllocationPercent(null)).toBe(0);
    expect(clampAllocationPercent(33.333)).toBe(33.33);
  });
});

describe('balanceAllocations', () => {
  it('แบ่งเท่ากันแล้วรวมได้ 100 พอดี แม้หารไม่ลงตัว', () => {
    const result = balanceAllocations([
      { id: 1, symbol: 'AAPL', allocationPercent: 10 },
      { id: 2, symbol: 'MSFT', allocationPercent: 10 },
      { id: 3, symbol: 'NVDA', allocationPercent: 10 },
    ]);

    expect(result.reduce((sum, row) => sum + row.allocationPercent, 0)).toBeCloseTo(100, 10);
    // เศษปัดไปอยู่แถวสุดท้าย
    expect(result[0]!.allocationPercent).toBe(33.33);
    expect(result[2]!.allocationPercent).toBe(33.34);
  });

  it('แถวที่ยังไม่ได้เลือกหุ้นถูกตั้งเป็น 0 ไม่ไปกินสัดส่วน', () => {
    const result = balanceAllocations([
      { id: 1, symbol: 'AAPL', allocationPercent: 50 },
      { id: 2, symbol: '', allocationPercent: 50 },
    ]);

    expect(result[0]!.allocationPercent).toBe(100);
    expect(result[1]!.allocationPercent).toBe(0);
  });
});
