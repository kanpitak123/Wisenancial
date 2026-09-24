<template>
  <div class="news-dual-impact-card" :class="{ 'card-expanded': isExpanded }">
    <!-- Header Summary Bar -->
    <div class="card-header" @click="toggleExpand">
      <div class="header-left">
        <!-- Market Stance Badge -->
        <span class="badge stance-badge" :class="stanceClass">
          <span class="badge-icon">{{ stanceIcon }}</span>
          <span class="badge-label">{{ analysis.market_stance }}</span>
        </span>

        <!-- Importance Badge -->
        <span class="badge importance-badge" :class="importanceClass">
          {{ analysis.importance }} IMPACT
        </span>

        <!-- Category Tag -->
        <span class="badge category-badge">
          {{ formatCategory(analysis.news_category) }}
        </span>
      </div>

      <div class="header-right">
        <!-- Neutrality & Confidence Indicators -->
        <div class="metric-indicator" :title="`Confidence: ${Math.round(analysis.confidence * 100)}%`">
          <span class="metric-label">Confidence:</span>
          <span class="metric-value">{{ Math.round(analysis.confidence * 100)}%</span>
        </div>

        <div class="metric-indicator" :title="`Neutrality: ${Math.round(analysis.neutrality_score * 100)}%`">
          <span class="metric-label">Neutrality:</span>
          <span class="metric-value">{{ Math.round(analysis.neutrality_score * 100)}%</span>
        </div>

        <span v-if="analysis.review_required" class="badge review-badge">
          Review Required
        </span>

        <button class="expand-btn" :aria-label="isExpanded ? 'Collapse analysis' : 'Expand analysis'">
          {{ isExpanded ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Expandable Detailed Impact Body -->
    <div v-show="isExpanded" class="card-body">
      <!-- Reasoning & Transmission Mechanism -->
      <div v-if="analysis.reasoning_steps?.transmission_mechanism" class="mechanism-banner">
        <div class="section-title">
          <span class="title-icon">⚙</span>
          <span>Economic Transmission Mechanism</span>
        </div>
        <p class="mechanism-text">{{ analysis.reasoning_steps.transmission_mechanism }}</p>
      </div>

      <!-- Dual Impact Symmetrical Columns -->
      <div class="dual-columns">
        <!-- Positive Impacts Column (Bull Case / Catalysts) -->
        <div class="impact-col positive-col">
          <div class="col-header positive-header">
            <span class="icon">▲</span>
            <h4>Positive Catalysts & Beneficiaries</h4>
            <span class="count-pill">{{ analysis.dual_impact_analysis.positive_impacts.length }}</span>
          </div>

          <div class="impact-list">
            <div
              v-for="(item, idx) in analysis.dual_impact_analysis.positive_impacts"
              :key="`pos-${idx}`"
              class="impact-item positive-item"
            >
              <div class="item-top">
                <span class="item-target">{{ item.target }}</span>
                <span class="asset-tag">{{ item.asset_class }}</span>
                <span class="timeframe-tag">{{ formatTimeframe(item.timeframe) }}</span>
              </div>
              <p class="item-mechanism">{{ item.mechanism }}</p>
            </div>
            <div v-if="analysis.dual_impact_analysis.positive_impacts.length === 0" class="empty-state">
              No material upside catalysts identified in source text.
            </div>
          </div>
        </div>

        <!-- Negative Impacts Column (Bear Case / Risks) -->
        <div class="impact-col negative-col">
          <div class="col-header negative-header">
            <span class="icon">▼</span>
            <h4>Negative Risks & Pressured Assets</h4>
            <span class="count-pill">{{ analysis.dual_impact_analysis.negative_impacts.length }}</span>
          </div>

          <div class="impact-list">
            <div
              v-for="(item, idx) in analysis.dual_impact_analysis.negative_impacts"
              :key="`neg-${idx}`"
              class="impact-item negative-item"
            >
              <div class="item-top">
                <span class="item-target">{{ item.target }}</span>
                <span class="asset-tag">{{ item.asset_class }}</span>
                <span class="timeframe-tag">{{ formatTimeframe(item.timeframe) }}</span>
              </div>
              <p class="item-mechanism">{{ item.mechanism }}</p>
            </div>
            <div v-if="analysis.dual_impact_analysis.negative_impacts.length === 0" class="empty-state">
              No material downside risks identified in source text.
            </div>
          </div>
        </div>
      </div>

      <!-- Key Catalysts & Uncertainties -->
      <div v-if="analysis.uncertainties && analysis.uncertainties.length > 0" class="uncertainties-section">
        <div class="section-title">
          <span class="title-icon">🔍</span>
          <span>Key Catalysts & Data Points to Monitor</span>
        </div>
        <ul class="uncertainties-list">
          <li v-for="(unc, idx) in analysis.uncertainties" :key="`unc-${idx}`">
            {{ unc }}
          </li>
        </ul>
      </div>

      <!-- Regulatory Compliance Disclaimer -->
      <div class="compliance-footer">
        <span class="shield-icon">🛡</span>
        <span class="disclaimer-text">{{ analysis.compliance_disclaimer }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { V5AnalysisResult } from './news-classifier.store';

const props = withDefaults(
  defineProps<{
    analysis: V5AnalysisResult;
    defaultExpanded?: boolean;
  }>(),
  {
    defaultExpanded: false,
  }
);

const isExpanded = ref(props.defaultExpanded);

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const stanceClass = computed(() => {
  switch (props.analysis.market_stance) {
    case 'BULLISH':
      return 'stance-bullish';
    case 'BEARISH':
      return 'stance-bearish';
    case 'MIXED':
      return 'stance-mixed';
    default:
      return 'stance-neutral';
  }
});

const stanceIcon = computed(() => {
  switch (props.analysis.market_stance) {
    case 'BULLISH':
      return '▲';
    case 'BEARISH':
      return '▼';
    case 'MIXED':
      return '◈';
    default:
      return '●';
  }
});

const importanceClass = computed(() => {
  switch (props.analysis.importance) {
    case 'HIGH':
      return 'importance-high';
    case 'MEDIUM':
      return 'importance-medium';
    default:
      return 'importance-low';
  }
});

const formatCategory = (category: string) => {
  if (!category) return 'GENERAL';
  return category.replace(/_/g, ' ');
};

const formatTimeframe = (timeframe: string) => {
  return timeframe === 'SHORT_TERM' ? '1–5 Days' : 'Medium-Term';
};
</script>

<style scoped>
.news-dual-impact-card {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #111827;
  border: 1px solid #1f2937;
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
  margin-bottom: 12px;
}

.news-dual-impact-card:hover {
  border-color: #374151;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #131d2e;
  cursor: pointer;
  user-select: none;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.stance-bullish {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.stance-bearish {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.stance-mixed {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.stance-neutral {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.importance-high {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.importance-medium {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.importance-low {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.category-badge {
  background: #1e293b;
  color: #94a3b8;
  font-size: 10px;
}

.metric-indicator {
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  gap: 3px;
}

.metric-value {
  color: #f3f4f6;
  font-weight: 600;
}

.review-badge {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.4);
}

.expand-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
}

/* Card Body */
.card-body {
  padding: 14px;
  border-top: 1px solid #1f2937;
  background: #0f172a;
}

.mechanism-banner {
  background: #1a2436;
  border-left: 3px solid #38bdf8;
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 14px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mechanism-text {
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.45;
  margin: 0;
}

/* Dual Symmetrical Columns */
.dual-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

@media (max-width: 768px) {
  .dual-columns {
    grid-template-columns: 1fr;
  }
}

.impact-col {
  border-radius: 8px;
  padding: 10px;
  background: #131c2d;
  border: 1px solid #1f2a3e;
}

.positive-col {
  border-top: 2px solid #10b981;
}

.negative-col {
  border-top: 2px solid #ef4444;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.col-header h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.positive-header {
  color: #10b981;
}

.negative-header {
  color: #ef4444;
}

.count-pill {
  background: #1e293b;
  color: #cbd5e1;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: auto;
}

.impact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.impact-item {
  background: #0b1120;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #1e293b;
}

.item-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.item-target {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
}

.asset-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #1e293b;
  color: #94a3b8;
  font-weight: 600;
}

.timeframe-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #0f172a;
  color: #64748b;
  margin-left: auto;
}

.item-mechanism {
  margin: 0;
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.4;
}

.empty-state {
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  padding: 6px;
}

/* Uncertainties */
.uncertainties-section {
  background: #131c2d;
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.uncertainties-section .section-title {
  color: #fbbf24;
}

.uncertainties-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
}

/* Compliance Footer */
.compliance-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #1e293b;
  font-size: 10px;
  color: #64748b;
}

.shield-icon {
  color: #10b981;
}
</style>
