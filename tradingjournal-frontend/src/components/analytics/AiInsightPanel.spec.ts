import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { AiInsightPanel } from './AiInsightPanel';

/**
 * Chart insight panel: the free rule-based Refresh, a separate priced AI button, and an
 * "AI" badge only on a real AI answer.
 */
const mountPanel = (props: Record<string, unknown> = {}) =>
  mount(AiInsightPanel, {
    props: { chartType: 'monthly_growth', cost: 5, ...props },
    global: { stubs: { WsAiDisclaimer: true } },
  });

const buttons = (wrapper: ReturnType<typeof mountPanel>) => wrapper.findAll('button');

describe('AiInsightPanel', () => {
  it('shows a free Refresh and a separate AI button that names its price', () => {
    const [refresh, ai] = buttons(mountPanel());

    expect(refresh?.text()).toBe('↻ Refresh');
    expect(refresh?.text()).not.toMatch(/credit/);
    expect(ai?.text()).toBe('✨ AI analysis · 5 credits');
  });

  it('Refresh emits refresh only; the AI button emits ai only (never the other)', async () => {
    const wrapper = mountPanel();
    const [refresh, ai] = buttons(wrapper);

    await refresh?.trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.emitted('ai')).toBeUndefined();

    await ai?.trigger('click');
    expect(wrapper.emitted('ai')).toHaveLength(1);
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('the AI button can be disabled (not enough credits) without disabling Refresh', () => {
    const [refresh, ai] = buttons(mountPanel({ aiDisabled: true }));

    expect(ai?.attributes('disabled')).toBeDefined();
    expect(refresh?.attributes('disabled')).toBeUndefined();
  });

  it('shows no price until the pricing has loaded', () => {
    const [, ai] = buttons(mountPanel({ cost: null }));

    expect(ai?.text()).toBe('✨ AI analysis');
  });

  it('loading state: both buttons are disabled and show progress', () => {
    const [refresh, ai] = buttons(mountPanel({ loading: true }));

    expect(refresh?.attributes('disabled')).toBeDefined();
    expect(ai?.attributes('disabled')).toBeDefined();
    expect(refresh?.text()).toBe('...');
    expect(ai?.text()).toBe('...');
  });

  it('marks an AI answer with an AI badge', () => {
    const wrapper = mountPanel({ source: 'LLM', lines: ['ok'] });

    expect(wrapper.find('[data-test="ai-insight-badge"]').text()).toBe('AI');
  });

  it.each(['RULE_BASED', ''])('no AI badge for a %s answer', (source) => {
    expect(mountPanel({ source }).find('[data-test="ai-insight-badge"]').exists()).toBe(false);
  });

  it('no AI badge while a new answer is loading', () => {
    expect(
      mountPanel({ source: 'LLM', loading: true }).find('[data-test="ai-insight-badge"]').exists(),
    ).toBe(false);
  });
});
