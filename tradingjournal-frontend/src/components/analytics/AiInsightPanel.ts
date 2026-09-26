import { defineComponent, h } from 'vue';
import { WsAiDisclaimer } from 'src/components/ui';
import { aiCostSuffix } from 'src/utils/ai-cost';

/**
 * Auto Insights panel for one chart: a free rule-based Refresh and a separate, priced AI button.
 * Extracted from AnalyticsPage so it can be tested; behaviour is unchanged.
 */
export const AiInsightPanel = defineComponent({
  name: 'AiInsightPanel',
  props: {
    chartType: { type: String, required: true },
    insight: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    /** flat credits of one insight (AiStore.costOf('chart_insight')); null until loaded */
    cost: { type: Number as () => number | null, default: null },
    /** the AI button is disabled (e.g. not enough credits) */
    aiDisabled: { type: Boolean, default: false },
    /** where the shown insight came from: 'LLM' gets an AI badge, 'RULE_BASED' does not */
    source: { type: String, default: '' },
    lines: { type: Array as () => string[], default: () => [] },
  },
  emits: ['refresh', 'ai'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          class: 'ai-panel h-full flex column',
          style: 'min-height: 300px',
        },
        [
          // Header
          h('div', { class: 'ai-panel-header row items-center justify-between q-mb-md' }, [
            h('div', { class: 'row items-center q-gutter-xs' }, [
              h('div', { class: 'ai-icon-box' }, [
                h(
                  'span',
                  { class: 'material-icons', style: 'font-size:16px;color:#fff' },
                  'auto_awesome',
                ),
              ]),
              h('span', { class: 'text-subtitle2 text-weight-bolder ai-title' }, 'Auto Insights'),
              // only a real AI answer is marked; the free rule-based insight is not
              props.source === 'LLM' && !props.loading
                ? h(
                    'span',
                    {
                      class: 'ai-source-badge',
                      'data-test': 'ai-insight-badge',
                      style:
                        'font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(124,58,237,.18);color:#a78bfa;letter-spacing:.04em',
                    },
                    'AI',
                  )
                : null,
            ]),
            h('div', { class: 'row items-center q-gutter-xs' }, [
              // free, rule-based: the default
              h(
                'button',
                {
                  class: 'ai-refresh-btn',
                  disabled: props.loading,
                  onClick: () => emit('refresh'),
                },
                props.loading ? '...' : '↻ Refresh',
              ),
              // AI: charged, so it is a separate button that names its price
              h(
                'button',
                {
                  class: 'ai-refresh-btn',
                  'data-test': 'ai-insight-run',
                  disabled: props.loading || props.aiDisabled,
                  onClick: () => emit('ai'),
                },
                props.loading ? '...' : `✨ AI analysis${aiCostSuffix(props.cost, false)}`,
              ),
            ]),
          ]),
          // แถบเตือนว่าไม่ใช่คำแนะนำการลงทุน — อยู่เหนือเนื้อผลวิเคราะห์เสมอ
          // (ตัวนี้ครอบคลุมทั้ง 4 จุดที่ใช้ AiInsightPanel ในหน้านี้)
          h(WsAiDisclaimer, { dense: true }),
          // Content
          props.loading
            ? h('div', { class: 'flex flex-center column flex-grow q-py-lg' }, [
                h('div', { class: 'ai-spinner q-mb-sm' }),
                h('div', { class: 'text-caption ai-muted' }, 'Analyzing your data…'),
              ])
            : props.lines.length
              ? h(
                  'div',
                  { class: 'ai-lines flex-grow' },
                  props.lines.map((line, i) =>
                    h('div', { key: i, class: 'ai-line' }, [
                      h('div', { class: 'ai-line-dot' }),
                      h('div', { class: 'ai-line-text' }, line),
                    ]),
                  ),
                )
              : h('div', { class: 'flex flex-center column flex-grow q-py-lg' }, [
                  h('span', { class: 'material-icons ai-empty-icon' }, 'insights'),
                  h('div', { class: 'text-caption ai-muted q-mt-sm' }, 'Click Refresh to analyze'),
                ]),
        ],
      );
  },
});
