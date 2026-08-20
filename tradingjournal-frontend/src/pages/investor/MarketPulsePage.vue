<script setup lang="ts">
/**
 * Market Pulse — ยุบ /Heatmap กับ /Discover เดิมมาเป็นหน้าเดียว
 *
 * เหตุผลที่รวม: แยกกันแล้วแต่ละหน้ามีของชิ้นเดียวจริงๆ (treemap ก้อนนึง / กริดการ์ด AI
 * ก้อนนึง) เปิดมาแล้วดูโล่ง ทั้งที่เป็นเรื่อง "ดูตลาดก่อนตัดสินใจ" เหมือนกัน
 *
 * โครง: แถบอารมณ์ตลาดปักไว้บนสุด (เห็นตลอด เป็น context ให้ทั้งสองแท็บ) แล้วข้างล่าง
 * แยกเป็นแท็บ Heatmap / AI Picks เพราะสองอันนี้ "ล็อกคนละแบบ" — เอามาต่อกันดื้อๆ
 * ผู้ใช้แพ็กฟรีจะเจอการ์ดกันสองใบซ้อนกันบนหน้าเดียว
 *   - Heatmap + อารมณ์ตลาด → PaidTierGuard (403 = ต้องอัปเกรด)
 *   - AI Picks → ไม่ติดแพ็กเกจ แต่คิดเครดิต AI ต่อครั้ง
 *
 * ของใหม่ที่เพิ่มเข้ามา: GET /market-insights/sentiment ซึ่งหลังบ้านทำเสร็จไว้นานแล้ว
 * แต่ไม่เคยมีหน้าไหนเรียกใช้เลย (orphan) — หยิบมาแค่ overall + longShortRatios
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAiStore } from 'stores/AiStore';
import { WsAiLoader, WsBadge, WsCard, WsUpgradeNotice } from 'src/components/ui';
import { heatmapService } from 'src/services/heatmap.service';
import { sentimentService } from 'src/services/sentiment.service';
import { isPaidTierError } from 'src/utils/paid-tier';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';
import type { HeatmapMarket, HeatmapResponse, HeatmapTile } from 'src/types/heatmap.types';
import type { SentimentResponse } from 'src/types/sentiment.types';

const router = useRouter();
const languageStore = useLanguageStore();
const aiStore = useAiStore();
const { safeLoad } = useSafeLoad();

type PulseTab = 'heatmap' | 'picks';

const tab = ref<PulseTab>('heatmap');
const market = ref<HeatmapMarket>('GLOBAL');

const loading = ref(false);
const data = ref<HeatmapResponse | null>(null);
const sentiment = ref<SentimentResponse | null>(null);
const requiresUpgrade = ref(false);

// โหลดรายชื่อโมเดล + ยอดเครดิตไว้ก่อน ทั้งคู่ไม่คิดเครดิต
onMounted(() => {
  void aiStore.fetchModels().catch(() => undefined);
  void load();
});

const marketOptions = computed(() => [
  { label: languageStore.isThai ? 'โลก' : 'Global', value: 'GLOBAL' as HeatmapMarket },
  { label: languageStore.isThai ? 'ไทย (SET)' : 'Thai (SET)', value: 'TH' as HeatmapMarket },
]);

const tabOptions = computed(() => [
  {
    name: 'heatmap' as PulseTab,
    icon: 'grid_view',
    label: languageStore.isThai ? 'แผนที่ความร้อน' : 'Heatmap',
  },
  {
    name: 'picks' as PulseTab,
    icon: 'auto_awesome',
    label: languageStore.isThai ? 'หุ้นที่ AI คัด' : 'AI Picks',
  },
]);

/**
 * heatmap กับ sentiment อยู่บนคอนโทรลเลอร์เดียวกัน ติด PaidTierGuard ตัวเดียวกัน จึง
 * โหลดคู่กันและใช้ธง requiresUpgrade ร่วมกัน — ถ้าแยกธงจะได้การ์ด "ต้องอัปเกรด" สองใบ
 * ที่พูดเรื่องเดียวกันบนหน้าเดียว
 *
 * ใช้ allSettled ไม่ใช่ all เพราะถ้า sentiment ล่มตัวเดียวก็ไม่ควรทำให้ treemap
 * (ของหลักของแท็บนี้) หายไปด้วย
 */
const load = async () => {
  loading.value = true;
  requiresUpgrade.value = false;

  const [heatmapResult, sentimentResult] = await Promise.allSettled([
    heatmapService.getHeatmap({ market: market.value }),
    sentimentService.getSentiment({ market: market.value }),
  ]);

  loading.value = false;

  if (heatmapResult.status === 'fulfilled') {
    data.value = heatmapResult.value;
  }

  sentiment.value = sentimentResult.status === 'fulfilled' ? sentimentResult.value : null;

  if (heatmapResult.status === 'rejected') {
    data.value = null;

    if (isPaidTierError(heatmapResult.reason)) {
      requiresUpgrade.value = true;
      return;
    }

    const { reason } = heatmapResult;

    await safeLoad(() => {
      throw reason;
    }, 'โหลดแผนที่ความร้อนตลาดไม่สำเร็จ');
  }
};

const onMarketChange = (value: HeatmapMarket) => {
  market.value = value;
  void load();
};

// เส้นทางในโปรเจกต์นี้ไม่มี prefix /app เหมือนของเดิม
const goToAnalysis = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

/**
 * แปลง % เปลี่ยนแปลงเป็นสีพื้นของช่อง — ตัดที่ ±3% เพราะเกินจากนั้นสีอิ่มตัวจนแยก
 * ไม่ออกอยู่ดี และหุ้นเด้งแรงตัวเดียวไม่ควรทำให้ทั้งกริดที่เหลือดูจืดไปหมด
 */
const tileColor = (change: number): string => {
  const capped = Math.max(-3, Math.min(3, change));
  const alpha = (0.18 + (Math.abs(capped) / 3) * 0.55).toFixed(2);

  return capped >= 0 ? `rgba(23, 130, 48, ${alpha})` : `rgba(193, 0, 21, ${alpha})`;
};

/** flex-grow ตามน้ำหนักหุ้น ช่องหุ้นใหญ่จะกว้างกว่า (treemap แบบ flexbox ล้วน) */
const tileFlex = (tile: HeatmapTile): number => Math.max(1, tile.weight);

const changeClass = (change: number) => (change >= 0 ? 'is-up' : 'is-down');

const formatPct = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

const asOfLabel = computed(() => {
  const iso = data.value?.asOf ?? sentiment.value?.asOf;

  if (!iso) return '';

  return new Date(iso).toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
});

const sectors = computed(() => data.value?.sectors ?? []);

/** ฝั่งที่คนถือมากกว่า — ใช้เลือกข้อความสรุปหนึ่งบรรทัดใต้แถบ */
const crowdLean = computed(() => {
  const long = sentiment.value?.overall.longPercent ?? 0;

  if (long >= 60) return 'long';
  if (long <= 40) return 'short';

  return 'balanced';
});

/** เรียงหุ้นที่เอียงไปฝั่งใดฝั่งหนึ่งแรงสุดขึ้นก่อน — ตัวที่ 50/50 ไม่มีอะไรให้เล่า */
/**
 * ป้าย % บนแถบ long/short ต้องรวมกันได้ 100 เสมอ
 *
 * ปัดแยกกันทีละฝั่งไม่ได้ — ข้อมูลจริงที่หลังบ้านส่งมาลงท้ายด้วย .5 บ่อยมาก
 * (เช่น long 56.5 / short 43.5) แล้ว toFixed(0) ปัดขึ้นทั้งคู่เป็น 57 กับ 44
 * ผู้ใช้เห็นสองตัวนี้ติดกันบนแถบเดียว บวกแล้วได้ 101% ซึ่งสะดุดตาทันที
 *
 * จึงปัดฝั่ง long อย่างเดียวแล้วให้ฝั่ง short เป็นส่วนที่เหลือ ส่วนความกว้างของแถบ
 * ยังใช้ค่าดิบไม่ปัด — ความยาวที่วาดออกมาจึงยังตรงกับข้อมูลจริง
 */
const longShortLabels = (longPercent: number) => {
  const long = Math.round(longPercent);

  return { long, short: 100 - long };
};

const overallLabels = computed(() => longShortLabels(sentiment.value?.overall.longPercent ?? 0));

const sortedRatios = computed(() =>
  [...(sentiment.value?.longShortRatios ?? [])].sort(
    (a, b) => Math.abs(b.longPercent - 50) - Math.abs(a.longPercent - 50),
  ),
);

const recommendations = computed(() => aiStore.growthRecommendations);

const canGenerate = computed(() => aiStore.canAfford && !aiStore.loadingRecommendations);

/** ทำไมปุ่มถึงกดไม่ได้ — ปุ่ม disable เฉยๆ โดยไม่บอกอะไรคือสิ่งที่ผู้ใช้เดาไม่ถูก */
const disabledReason = computed(() => {
  if (aiStore.loadingRecommendations) return '';

  if (!aiStore.canAfford) {
    return languageStore.isThai
      ? `เครดิต AI ไม่พอ (มี ${aiStore.credits} ต้องมีอย่างน้อย ${aiStore.minBalance}) — เติมเครดิตก่อนใช้งาน`
      : `Not enough AI credits (${aiStore.credits} of ${aiStore.minBalance} required). Top up to continue.`;
  }

  return '';
});

const generate = async () => {
  try {
    await aiStore.loadGrowthRecommendations();
  } catch {
    // AiStore.handleError ตั้ง error/insufficientCredits ให้แล้ว เทมเพลตอ่านจากตรงนั้น
  }
};

/**
 * 4 หัวข้อเหตุผลของแบบเดิม — จัดเป็นหมวดพร้อมไอคอนแทนพารากราฟยาว
 * key ต้องตรงกับ StockRecommendation['reasoning'] ใน types/ai.types.ts
 */
const REASON_META = [
  { key: 'growth', icon: 'trending_up', color: 'positive', th: 'การเติบโต', en: 'Growth' },
  {
    key: 'profit',
    icon: 'attach_money',
    color: 'warning',
    th: 'ความสามารถทำกำไร',
    en: 'Profitability',
  },
  { key: 'customerBase', icon: 'people', color: 'info', th: 'ฐานลูกค้า', en: 'Customer Base' },
  { key: 'liquidity', icon: 'water_drop', color: 'primary', th: 'สภาพคล่อง', en: 'Liquidity' },
] as const;
</script>

<template>
  <q-page class="pulse-page q-pa-md q-pa-sm-lg">
    <header class="pulse-header">
      <div>
        <WsBadge kind="ai" color="primary" value="MARKET PULSE" outline class="q-mb-sm" />
        <h1 class="pulse-title">
          {{ languageStore.isThai ? 'ชีพจรตลาด' : 'Market Pulse' }}
        </h1>
        <p class="pulse-subtitle">
          {{
            languageStore.isThai
              ? 'อารมณ์ตลาด แผนที่ความร้อนรายกลุ่ม และหุ้นเติบโตที่ AI คัดให้ ในที่เดียว'
              : 'Market positioning, the sector heatmap and AI growth picks — all in one place.'
          }}
          <span v-if="asOfLabel" class="pulse-asof">· {{ asOfLabel }}</span>
        </p>
      </div>
      <q-btn-toggle
        :model-value="market"
        toggle-color="primary"
        unelevated
        no-caps
        class="pulse-market-toggle"
        :options="marketOptions"
        @update:model-value="onMarketChange"
      />
    </header>

    <!-- ── แถบอารมณ์ตลาด — ปักบนสุด เป็น context ให้ทั้งสองแท็บ ──────────────────
         ติด PaidTierGuard เหมือน heatmap: แพ็กฟรีจะไม่เห็นแถบนี้เลย ไม่ได้เงียบหาย
         เพราะการ์ด "ต้องอัปเกรด" ในแท็บ Heatmap อธิบายให้อยู่แล้ว การโชว์ซ้ำสองที่
         บนหน้าเดียวไม่ได้ช่วยอะไร -->
    <WsCard v-if="sentiment" class="pulse-sentiment" data-test="market-sentiment">
      <div class="pulse-sentiment-head">
        <span class="pulse-sentiment-label">
          {{ languageStore.isThai ? 'อารมณ์ตลาดตอนนี้' : 'Market positioning' }}
        </span>
        <span class="pulse-sentiment-lean" :data-lean="crowdLean">
          {{
            crowdLean === 'long'
              ? languageStore.isThai
                ? 'ตลาดเอียงฝั่งซื้อ'
                : 'Crowd leans long'
              : crowdLean === 'short'
                ? languageStore.isThai
                  ? 'ตลาดเอียงฝั่งขาย'
                  : 'Crowd leans short'
                : languageStore.isThai
                  ? 'ตลาดค่อนข้างสมดุล'
                  : 'Fairly balanced'
          }}
        </span>
      </div>

      <div class="pulse-ls-bar" data-test="sentiment-overall-bar">
        <div
          class="pulse-ls-long"
          :style="{ width: `${sentiment.overall.longPercent}%` }"
          data-test="sentiment-overall-long"
        >
          <span v-if="sentiment.overall.longPercent >= 18"
            >{{ languageStore.isThai ? 'ซื้อ' : 'Long' }}
            {{ overallLabels.long }}%</span
          >
        </div>
        <div class="pulse-ls-short" :style="{ width: `${sentiment.overall.shortPercent}%` }">
          <span v-if="sentiment.overall.shortPercent >= 18"
            >{{ languageStore.isThai ? 'ขาย' : 'Short' }}
            {{ overallLabels.short }}%</span
          >
        </div>
      </div>

      <!-- long/short รายตัว — เรียงตัวที่เอียงแรงสุดขึ้นก่อน -->
      <div v-if="sortedRatios.length > 0" class="pulse-ratio-grid">
        <div
          v-for="ratio in sortedRatios"
          :key="ratio.symbol"
          class="pulse-ratio"
          :data-test="`sentiment-ratio-${ratio.symbol}`"
        >
          <div class="pulse-ratio-head">
            <span class="pulse-ratio-symbol">{{ ratio.symbol.replace('.BK', '') }}</span>
            <span class="pulse-ratio-pct" :class="ratio.longPercent >= 50 ? 'is-up' : 'is-down'">
              {{ ratio.longPercent.toFixed(0) }}%
            </span>
            <q-tooltip>
              {{ ratio.name }} · {{ languageStore.isThai ? 'ซื้อ' : 'Long' }}
              {{ longShortLabels(ratio.longPercent).long }}% /
              {{ languageStore.isThai ? 'ขาย' : 'Short' }}
              {{ longShortLabels(ratio.longPercent).short }}%
            </q-tooltip>
          </div>
          <div class="pulse-ratio-bar">
            <div class="pulse-ratio-fill" :style="{ width: `${ratio.longPercent}%` }" />
          </div>
        </div>
      </div>
    </WsCard>

    <!-- ── แท็บ ─────────────────────────────────────────────────────────────── -->
    <q-tabs
      v-model="tab"
      no-caps
      dense
      align="left"
      class="pulse-tabs"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab
        v-for="option in tabOptions"
        :key="option.name"
        :name="option.name"
        :icon="option.icon"
        :label="option.label"
        :data-test="`market-tab-${option.name}`"
      />
    </q-tabs>

    <!-- ไม่ใส่ animated โดยตั้งใจ: ระหว่าง transition ของ Quasar พาเนลเก่ากับพาเนลใหม่
         อยู่ใน DOM พร้อมกัน ซึ่งแปลว่ามีช่วงที่ผู้ใช้เห็นของสองแท็บซ้อนกัน -->
    <q-tab-panels v-model="tab" class="pulse-panels">
      <!-- ── แท็บ 1: แผนที่ความร้อน ─────────────────────────────────────────── -->
      <q-tab-panel name="heatmap" class="q-pa-none q-pt-md">
        <WsUpgradeNotice
          v-if="requiresUpgrade"
          data-test="heatmap-upgrade"
          message-th="แผนที่ความร้อนตลาดและอารมณ์ตลาดใช้ข้อมูลตลาดแบบเจาะลึก เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
          message-en="The market heatmap and positioning data are premium features available on paid plans."
        />

        <template v-else>
          <div v-if="loading" class="pulse-sectors" data-test="heatmap-loading">
            <div v-for="n in 4" :key="n" class="pulse-skeleton" />
          </div>

          <div v-else-if="sectors.length === 0" class="pulse-empty" data-test="heatmap-empty">
            <q-icon name="grid_view" size="40px" class="q-mb-sm" />
            <div class="text-subtitle1 text-weight-bolder">
              {{ languageStore.isThai ? 'ยังไม่มีข้อมูลแผนที่ตลาด' : 'No heatmap data yet' }}
            </div>
            <div class="text-body2 q-mt-xs">
              {{
                languageStore.isThai
                  ? 'ลองสลับตลาดหรือกลับมาใหม่อีกครั้งภายหลัง'
                  : 'Try switching markets or check back later.'
              }}
            </div>
          </div>

          <div v-else class="pulse-sectors" data-test="heatmap-grid">
            <WsCard v-for="sector in sectors" :key="sector.sector" class="pulse-sector">
              <template #header>
                <div class="pulse-sector-header">
                  <span class="pulse-sector-name">{{ sector.sector }}</span>
                  <span class="pulse-sector-change" :class="changeClass(sector.avgChangePercent)">
                    {{ formatPct(sector.avgChangePercent) }}
                  </span>
                </div>
              </template>

              <div class="pulse-tiles">
                <button
                  v-for="tile in sector.tiles"
                  :key="tile.symbol"
                  type="button"
                  class="pulse-tile"
                  :data-test="`heatmap-tile-${tile.symbol}`"
                  :style="{
                    backgroundColor: tileColor(tile.changePercent),
                    flexGrow: tileFlex(tile),
                  }"
                  @click="goToAnalysis(tile.symbol)"
                >
                  <span class="pulse-tile-symbol">{{ tile.symbol.replace('.BK', '') }}</span>
                  <span class="pulse-tile-change">{{ formatPct(tile.changePercent, 1) }}</span>
                  <q-tooltip>{{ tile.name }} · {{ formatPct(tile.changePercent) }}</q-tooltip>
                </button>
              </div>
            </WsCard>
          </div>

          <div v-if="!loading && sectors.length > 0" class="pulse-legend">
            <span class="pulse-legend-item">
              <span class="pulse-legend-swatch" :style="{ backgroundColor: tileColor(-3) }" />
              -3%
            </span>
            <span class="pulse-legend-item">
              <span class="pulse-legend-swatch" :style="{ backgroundColor: tileColor(0) }" />
              0%
            </span>
            <span class="pulse-legend-item">
              <span class="pulse-legend-swatch" :style="{ backgroundColor: tileColor(3) }" />
              +3%
            </span>
          </div>
        </template>
      </q-tab-panel>

      <!-- ── แท็บ 2: หุ้นที่ AI คัด ──────────────────────────────────────────── -->
      <q-tab-panel name="picks" class="q-pa-none q-pt-md">
        <div class="pulse-picks-bar">
          <p class="pulse-picks-lead">
            {{
              languageStore.isThai
                ? 'ให้ AI สแกนหาหุ้นเติบโต พร้อมเหตุผลแยกเป็นหมวด'
                : 'Let AI scan for growth stocks and explain each pick by category.'
            }}
          </p>
          <div class="pulse-picks-actions">
            <span class="pulse-credits" data-test="discover-credits">
              <q-icon name="bolt" size="15px" />
              {{ aiStore.credits }}
              <q-tooltip>
                {{ languageStore.isThai ? 'เครดิต AI คงเหลือ' : 'AI credits remaining' }}
              </q-tooltip>
            </span>
            <q-btn
              unelevated
              no-caps
              icon="auto_awesome"
              class="pulse-generate text-white text-weight-bold"
              data-test="discover-generate"
              :disable="!canGenerate"
              :loading="aiStore.loadingRecommendations"
              :label="
                recommendations.length
                  ? languageStore.isThai
                    ? 'สแกนใหม่'
                    : 'Rescan'
                  : languageStore.isThai
                    ? 'ให้ AI สแกนหุ้น'
                    : 'Scan with AI'
              "
              @click="generate"
            />
          </div>
        </div>

        <div v-if="disabledReason" class="pulse-hint" data-test="discover-hint">
          <q-icon name="info" size="16px" class="q-mr-xs" />
          {{ disabledReason }}
        </div>

        <!-- กำลังสแกน -->
        <div v-if="aiStore.loadingRecommendations" class="pulse-state" data-test="discover-loading">
          <WsAiLoader />
          <div class="text-subtitle1 text-weight-bolder q-mt-md">
            {{ languageStore.isThai ? 'AI กำลังสแกนตลาดโลก…' : 'AI is scanning global markets…' }}
          </div>
          <div class="text-body2 text-muted q-mt-xs">
            {{
              languageStore.isThai
                ? 'กำลังวิเคราะห์หุ้นจำนวนมากเพื่อหาศักยภาพการเติบโต'
                : 'Analysing thousands of stocks for growth potential.'
            }}
          </div>
        </div>

        <!-- เครดิตไม่พอ (ตั้งโดย AiStore หลังยิงแล้วโดนปฏิเสธ) -->
        <div
          v-else-if="aiStore.insufficientCredits"
          class="pulse-state"
          data-test="discover-credits-empty"
        >
          <q-icon name="bolt" size="40px" class="q-mb-sm text-warning" />
          <div class="text-subtitle1 text-weight-bolder">
            {{ languageStore.isThai ? 'เครดิต AI ไม่พอ' : 'Not enough AI credits' }}
          </div>
          <q-btn
            flat
            no-caps
            color="primary"
            class="q-mt-sm text-weight-bold"
            data-test="discover-topup"
            :label="languageStore.isThai ? 'เติมเครดิต' : 'Top up credits'"
            to="/AiCredits"
          />
        </div>

        <!-- error อื่นๆ -->
        <div v-else-if="aiStore.error" class="pulse-state" data-test="discover-error">
          <q-icon name="error_outline" size="40px" class="q-mb-sm text-negative" />
          <div class="text-subtitle1 text-weight-bolder">
            {{ languageStore.isThai ? 'โหลดคำแนะนำไม่สำเร็จ' : 'Unable to load recommendations' }}
          </div>
          <div class="text-body2 text-muted q-mt-xs">{{ aiStore.error }}</div>
          <q-btn
            flat
            no-caps
            color="primary"
            icon="refresh"
            class="q-mt-sm text-weight-bold"
            data-test="discover-retry"
            :label="languageStore.isThai ? 'ลองใหม่' : 'Try again'"
            @click="generate"
          />
        </div>

        <!-- ยังไม่เคยสแกน -->
        <div
          v-else-if="recommendations.length === 0"
          class="pulse-state"
          data-test="discover-empty"
        >
          <q-icon name="auto_awesome" size="40px" class="q-mb-sm" />
          <div class="text-subtitle1 text-weight-bolder">
            {{ languageStore.isThai ? 'ยังไม่ได้สแกน' : 'Nothing scanned yet' }}
          </div>
          <div class="text-body2 text-muted q-mt-xs">
            {{
              languageStore.isThai
                ? 'กด "ให้ AI สแกนหุ้น" เพื่อดูหุ้นเติบโตที่ AI คัดให้'
                : 'Hit “Scan with AI” to see the growth stocks AI picks out.'
            }}
          </div>
        </div>

        <div v-else class="pulse-picks-grid" data-test="discover-grid">
          <WsCard
            v-for="rec in recommendations"
            :key="rec.symbol"
            class="pulse-pick-card"
            :data-test="`discover-card-${rec.symbol}`"
          >
            <template #header>
              <div class="pulse-pick-head">
                <div class="pulse-pick-id">
                  <!-- ป้ายตัวย่อแทนโลโก้ — logo.clearbit.com โดน ad blocker บล็อกบ่อย
                       ถ้าไม่มีตัวสำรองจะเหลือช่องว่างเปล่า -->
                  <span
                    class="pulse-avatar"
                    :style="{ background: symbolAvatarColor(rec.symbol) }"
                    >{{ symbolAvatarInitials(rec.symbol) }}</span
                  >
                  <div class="pulse-pick-text">
                    <div class="pulse-pick-symbol">{{ rec.symbol }}</div>
                    <div class="pulse-pick-name">{{ rec.name }}</div>
                  </div>
                </div>
                <q-badge class="pulse-pick-sector" :label="rec.sector" />
              </div>
            </template>

            <div class="pulse-reasons">
              <div v-for="meta in REASON_META" :key="meta.key" class="pulse-reason">
                <div class="pulse-reason-head">
                  <q-icon :name="meta.icon" :color="meta.color" size="18px" />
                  <span>{{ languageStore.isThai ? meta.th : meta.en }}</span>
                </div>
                <p class="pulse-reason-text">{{ rec.reasoning[meta.key] }}</p>
              </div>
            </div>

            <div class="pulse-summary">
              <div class="pulse-summary-label">
                {{ languageStore.isThai ? 'สรุปโดย AI' : 'AI Summary' }}
              </div>
              <p class="pulse-summary-text">{{ rec.aiSummary }}</p>
            </div>
          </WsCard>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<style scoped>
/* palette teal/sage ชุดกลางเดียวกับหน้าอื่นที่ทำใน Phase 3 — ตัวช่อง heatmap กับแถบ
   long/short ยังเป็นเขียว/แดงตามความหมายของข้อมูล ไม่ใช่สีแบรนด์ */
.pulse-page {
  --bg-page: #f6f9f9;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;
  --positive: #178230;
  --negative: #c10015;

  --accent-100: #e7f4f2;
  --accent-500: #85b6b0;
  --accent-800: #336160;
  --accent-900: #1b3636;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .pulse-page {
  --bg-page: #151819;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --positive: #4ade80;
  --negative: #f87171;
  --accent-100: rgba(133, 182, 176, 0.18);
}

.pulse-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

.pulse-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}

.pulse-subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  max-width: 62ch;
}

.pulse-asof {
  font-weight: 600;
  color: var(--text-main);
}

/* ── แถบอารมณ์ตลาด ─────────────────────────────────────────────────────── */
.pulse-sentiment {
  margin-bottom: 20px;
}

.pulse-sentiment-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.pulse-sentiment-label {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.pulse-sentiment-lean {
  font-size: 12.5px;
  font-weight: 700;
}

.pulse-sentiment-lean[data-lean='long'] {
  color: var(--positive);
}

.pulse-sentiment-lean[data-lean='short'] {
  color: var(--negative);
}

.pulse-sentiment-lean[data-lean='balanced'] {
  color: var(--text-muted);
}

/* แถบเดียวแบ่งซ้าย-ขวา อ่านสัดส่วนได้ทันทีโดยไม่ต้องเทียบตัวเลขสองตัว */
.pulse-ls-bar {
  display: flex;
  height: 26px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-card-soft);
}

.pulse-ls-long,
.pulse-ls-short {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  transition: width 0.4s ease;
}

.pulse-ls-long {
  background: var(--positive);
}

.pulse-ls-short {
  background: var(--negative);
}

.pulse-ratio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.pulse-ratio-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.pulse-ratio-symbol {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
}

.pulse-ratio-pct {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 700;
}

.pulse-ratio-pct.is-up {
  color: var(--positive);
}

.pulse-ratio-pct.is-down {
  color: var(--negative);
}

/* พื้นแดง + แถบเขียวทับ = อ่าน long/short ได้จากแท่งเดียว ไม่ต้องมีสองแท่ง */
.pulse-ratio-bar {
  height: 5px;
  margin-top: 5px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--negative);
}

.pulse-ratio-fill {
  height: 100%;
  background: var(--positive);
  transition: width 0.4s ease;
}

/* ── แท็บ ───────────────────────────────────────────────────────────────── */
.pulse-tabs {
  border-bottom: 1px solid var(--border-color);
  color: var(--text-muted);
}

.pulse-panels {
  background: transparent;
}

/* ── แท็บแผนที่ความร้อน ─────────────────────────────────────────────────── */
.pulse-sectors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.pulse-sector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
}

.pulse-sector-name {
  font-size: 15px;
  color: var(--text-main);
}

.pulse-sector-change {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.pulse-sector-change.is-up {
  color: var(--positive);
}

.pulse-sector-change.is-down {
  color: var(--negative);
}

.pulse-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* flex-basis:0 + flex-grow ตามน้ำหนัก = treemap แบบ flexbox ล้วน ไม่ต้องพึ่งไลบรารีกราฟ */
.pulse-tile {
  flex-basis: 0;
  min-width: 72px;
  min-height: 64px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #fff;
  font-weight: 700;
  transition:
    transform 0.12s ease,
    filter 0.12s ease;
}

.pulse-tile:hover {
  transform: scale(1.04);
  filter: brightness(1.1);
}

.pulse-tile-symbol {
  font-size: 13px;
}

.pulse-tile-change {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  opacity: 0.95;
}

.pulse-legend {
  display: flex;
  gap: 18px;
  justify-content: center;
  margin-top: 24px;
  color: var(--text-muted);
  font-size: 12px;
}

.pulse-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pulse-legend-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.pulse-skeleton {
  height: 180px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    var(--bg-card-soft) 25%,
    var(--border-color) 50%,
    var(--bg-card-soft) 75%
  );
  background-size: 200% 100%;
  animation: pulse-shimmer 1.4s ease-in-out infinite;
}

@keyframes pulse-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ── แท็บ AI Picks ──────────────────────────────────────────────────────── */
.pulse-picks-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.pulse-picks-lead {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.pulse-picks-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pulse-credits {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--accent-100);
  color: var(--accent-800);
}

.body--dark .pulse-credits {
  color: var(--text-main);
}

.pulse-generate {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  border-radius: 11px;
  padding: 0 18px;
  height: 40px;
}

.pulse-hint {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  border-radius: 10px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.pulse-picks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}

.pulse-pick-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.pulse-pick-id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pulse-pick-text {
  min-width: 0;
}

.pulse-avatar {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.pulse-pick-symbol {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--accent-800);
}

.body--dark .pulse-pick-symbol {
  color: var(--text-main);
}

.pulse-pick-name {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.pulse-pick-sector {
  background: var(--accent-100) !important;
  color: var(--accent-800) !important;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 10.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.body--dark .pulse-pick-sector {
  color: var(--text-main) !important;
}

/* เหตุผล 4 หมวดวางเป็น 2x2 — อ่านง่ายกว่าพารากราฟยาวก้อนเดียวแบบต้นฉบับ */
.pulse-reasons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (max-width: 599px) {
  .pulse-reasons {
    grid-template-columns: 1fr;
  }
}

.pulse-reason-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
}

.pulse-reason-text {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.pulse-summary {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.pulse-summary-label {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-800);
}

.body--dark .pulse-summary-label {
  color: var(--text-muted);
}

.pulse-summary-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-main);
}

/* ── ว่าง/ผิดพลาด — ใช้ผิวเดียวกันทั้งสองแท็บ ────────────────────────────── */
.pulse-empty,
.pulse-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}
</style>
