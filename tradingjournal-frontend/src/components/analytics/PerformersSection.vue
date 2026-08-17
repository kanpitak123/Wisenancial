<script setup lang="ts">
/**
 * Top Performers / Underperformers — กริด 2 คอลัมน์ตามต้นฉบับ
 *
 * ข้อมูลมาจาก AnalyticsStore.loadAdvanced() -> store.performers ที่มีอยู่แล้ว
 * endpoint /analytics/portfolio/:id/performers ยัง gate ด้วย PaidTierGuard อยู่
 * แพ็กฟรีจึงต้องเห็นการ์ด "ต้องอัปเกรด" ไม่ใช่กริดว่างเงียบๆ
 */
import { computed } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import { WsCard, WsUpgradeNotice } from 'src/components/ui';
import type { PerformerItem } from 'src/types/analytics.types';

const languageStore = useLanguageStore();
const store = useAnalyticsStore();

const best = computed<PerformerItem[]>(() => store.performers?.best ?? []);
const worst = computed<PerformerItem[]>(() => store.performers?.worst ?? []);

const money = (value: number) =>
  `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const closedLabel = (item: PerformerItem) =>
  item.closedAt
    ? new Date(item.closedAt).toLocaleDateString(languageStore.isThai ? 'th-TH' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : languageStore.isThai
      ? 'ยังถืออยู่'
      : 'Still held';
</script>

<template>
  <!-- ส่วนนี้การ์ดอัปเกรดไปแทนกริดทั้งก้อน จึงใช้ variant prominent แทน dense
       (จุดอื่นที่ใช้ WsUpgradeNotice ยังเป็นขนาดเดิมทั้งหมด) -->
  <WsUpgradeNotice
    v-if="store.paidAccessDenied"
    prominent
    data-test="performers-upgrade"
    message-th="ปลดล็อกอันดับหุ้นที่ทำกำไรและขาดทุนสูงสุดของพอร์ตคุณ พร้อมผลตอบแทนรายตัว — เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
    message-en="Unlock your portfolio's best and worst performing stocks, with per-position returns — available on paid plans."
  />

  <div v-else class="performers-grid" data-test="performers-grid">
    <WsCard tone="glass" class="performer-card">
      <template #header>
        <div class="performer-head">
          <q-icon name="trending_up" color="positive" size="22px" />
          <div>
            <h3 class="performer-title">
              {{ languageStore.isThai ? 'ทำกำไรสูงสุด' : 'Top Performers' }}
            </h3>
            <p class="performer-subtitle">
              {{
                languageStore.isThai
                  ? 'หุ้นที่ให้ผลตอบแทนดีที่สุด'
                  : 'Stocks with the strongest returns'
              }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="best.length" class="performer-list">
        <div v-for="item in best" :key="item.symbol" class="performer-row" data-test="performer-best">
          <div class="performer-row__id">
            <span class="performer-row__symbol">{{ item.symbol.replace('.BK', '') }}</span>
            <span class="performer-row__date">{{ closedLabel(item) }}</span>
          </div>
          <div class="performer-row__metrics">
            <span class="performer-row__pnl text-positive">{{ money(item.pnl) }}</span>
            <span class="performer-row__pct text-positive">{{ percent(item.returnPercent) }}</span>
          </div>
        </div>
      </div>
      <p v-else class="performer-empty" data-test="performers-empty">
        {{ languageStore.isThai ? 'ยังไม่มีสถานะที่ทำกำไร' : 'No winning positions yet' }}
      </p>
    </WsCard>

    <WsCard tone="glass" class="performer-card">
      <template #header>
        <div class="performer-head">
          <q-icon name="trending_down" color="negative" size="22px" />
          <div>
            <h3 class="performer-title">
              {{ languageStore.isThai ? 'ควรติดตาม' : 'Needs Attention' }}
            </h3>
            <p class="performer-subtitle">
              {{
                languageStore.isThai
                  ? 'หุ้นที่ผลตอบแทนติดลบ'
                  : 'Stocks with negative returns'
              }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="worst.length" class="performer-list">
        <div
          v-for="item in worst"
          :key="item.symbol"
          class="performer-row"
          data-test="performer-worst"
        >
          <div class="performer-row__id">
            <span class="performer-row__symbol">{{ item.symbol.replace('.BK', '') }}</span>
            <span class="performer-row__date">{{ closedLabel(item) }}</span>
          </div>
          <div class="performer-row__metrics">
            <span class="performer-row__pnl text-negative">{{ money(item.pnl) }}</span>
            <span class="performer-row__pct text-negative">{{ percent(item.returnPercent) }}</span>
          </div>
        </div>
      </div>
      <p v-else class="performer-empty" data-test="performers-empty">
        {{ languageStore.isThai ? 'ยังไม่พบสถานะที่ขาดทุน' : 'No losing positions' }}
      </p>
    </WsCard>
  </div>
</template>

<style scoped>
.performers-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.performer-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.performer-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.performer-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.performer-list {
  display: flex;
  flex-direction: column;
}

.performer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.performer-row:last-child {
  border-bottom: none;
}

.performer-row__id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.performer-row__symbol {
  font-weight: 700;
  color: var(--text-primary);
}

.performer-row__date {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.performer-row__metrics {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.performer-row__pnl {
  font-weight: 700;
  font-size: 0.92rem;
}

.performer-row__pct {
  font-size: 0.75rem;
}

.performer-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .performers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
