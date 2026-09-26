import { describe, expect, it } from 'vitest';
import { aiCostSuffix, aiNotEnoughCreditsMessage } from './ai-cost';

describe('aiCostSuffix', () => {
  it('shows the flat price after the label, in the UI language', () => {
    expect(aiCostSuffix(20, false)).toBe(' · 20 credits');
    expect(aiCostSuffix(20, true)).toBe(' · 20 เครดิต');
    expect(aiCostSuffix(1, false)).toBe(' · 1 credit');
  });

  it('shows nothing until the price is known', () => {
    expect(aiCostSuffix(null, false)).toBe('');
    expect(aiCostSuffix(null, true)).toBe('');
  });
});

describe('aiNotEnoughCreditsMessage', () => {
  it('states the balance and the price of the feature', () => {
    expect(aiNotEnoughCreditsMessage(7, 20, false)).toContain('7 of 20');
    expect(aiNotEnoughCreditsMessage(7, 20, true)).toContain('ต้องใช้ 20');
  });
});
