<script setup lang="ts">
/**
 * อัปเกรดแพ็กเกจ
 *
 * เขียนใหม่จากหน้าเดิมของโปรเจกต์เก่า (ที่พึ่ง PricingPlans.vue + AiRecommendations ซึ่ง
 * ไม่มีใน Wisenancial) — ตอนนี้ต่อกับของที่มีอยู่จริง:
 *   - tier ปัจจุบันจาก UserStore.profile.subscription_tier
 *   - โควต้าพอร์ตต่อแพ็กจาก TIER_MAX_PORTFOLIOS / maxPortfoliosForTier() (ไม่ hardcode ซ้ำ)
 *   - โควต้าที่ใช้อยู่จริงจาก PortfolioStore (endpoint GET /portfolios/quota)
 *   - ปุ่มอัปเกรดผ่าน BillingStore.checkoutSubscription() -> payments.service.ts
 *
 * Stripe เด้งกลับมาที่ /Upgrade?success=true|canceled=true (payments.service.ts ฝั่ง backend)
 */
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { WsBadge, WsCard } from 'src/components/ui';
import {
  AVAILABLE_SUBSCRIPTION_TIERS,
  FREE_TIER_MAX_PORTFOLIOS,
  TIER_DISPLAY_NAMES,
  TIER_FEATURES,
  TIER_PRICE_THB,
  maxPortfoliosForTier,
  tierRank,
} from 'src/constants/billing.constants';
import { useBillingStore } from 'stores/BillingStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useUserStore } from 'stores/UserStore';
import type { SubscriptionTier } from 'src/types/billing.types';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const billingStore = useBillingStore();
const portfolioStore = usePortfolioStore();
const userStore = useUserStore();

// ── แพ็กปัจจุบัน ───────────────────────────────────────────────────────────────
const currentTier = computed<SubscriptionTier | null>(
  () => userStore.profile?.subscription_tier ?? null,
);

const currentTierName = computed(() =>
  currentTier.value ? TIER_DISPLAY_NAMES[currentTier.value] : 'ฟรี',
);

const currentTierLabel = computed(() =>
  currentTier.value ? `${currentTierName.value} (${currentTier.value})` : 'แพ็กเกจฟรี',
);

const currentMaxPortfolios = computed(() => maxPortfoliosForTier(currentTier.value));

/** ใช้ไปกี่พอร์ตแล้ว — มาจาก endpoint โควต้าเดียวกับหน้า Portfolio */
const usedPortfolios = computed(() => portfolioStore.quotaUsed);

// ── ตารางเปรียบเทียบ ──────────────────────────────────────────────────────────
interface PlanRow {
  tier: SubscriptionTier;
  name: string;
  priceThb: number;
  maxPortfolios: number;
  features: string[];
  isCurrent: boolean;
  isDowngrade: boolean;
  popular: boolean;
}

const plans = computed<PlanRow[]>(() =>
  AVAILABLE_SUBSCRIPTION_TIERS.map((tier) => ({
    tier,
    name: TIER_DISPLAY_NAMES[tier],
    priceThb: TIER_PRICE_THB[tier],
    maxPortfolios: maxPortfoliosForTier(tier),
    features: TIER_FEATURES[tier],
    isCurrent: currentTier.value === tier,
    isDowngrade: tierRank(tier) < tierRank(currentTier.value),
    popular: tier === 'PACK_279',
  })),
);

const isCheckingOut = (tier: SubscriptionTier) =>
  billingStore.checkingOutSubscriptionTier === tier;

const ctaLabel = (plan: PlanRow) => {
  if (plan.isCurrent) return 'แพ็กเกจปัจจุบัน';

  return plan.isDowngrade ? 'เปลี่ยนเป็นแพ็กนี้' : 'อัปเกรด';
};

// ── actions ───────────────────────────────────────────────────────────────────
const selectPlan = async (plan: PlanRow) => {
  if (plan.isCurrent) {
    return;
  }

  try {
    const checkoutUrl = await billingStore.checkoutSubscription(plan.tier);

    billingStore.openCheckout(checkoutUrl);
  } catch {
    $q.notify({
      type: 'negative',
      message: billingStore.error ?? 'ไม่สามารถเปิดหน้าชำระเงินได้ กรุณาลองใหม่อีกครั้ง',
      position: 'top',
      timeout: 4000,
    });
  }
};

const handleCheckoutReturn = async () => {
  if (route.query.success === 'true') {
    // โปรไฟล์ถือ tier ใหม่ ส่วนโควต้าเป็นของ backend — ดึงใหม่ทั้งคู่
    await Promise.all([
      userStore.fetchProfile().catch(() => null),
      portfolioStore.loadQuota(),
    ]);

    $q.notify({
      type: 'positive',
      message: 'ชำระเงินสำเร็จ! แพ็กเกจของคุณได้รับการอัปเดตแล้ว',
      position: 'top',
      timeout: 4000,
    });

    void router.replace({ path: route.path, query: {} });
    return;
  }

  if (route.query.canceled === 'true') {
    $q.notify({
      type: 'warning',
      message: 'ยกเลิกการชำระเงินแล้ว',
      position: 'top',
      timeout: 3500,
    });

    void router.replace({ path: route.path, query: {} });
  }
};

onMounted(async () => {
  if (!userStore.profile) {
    await userStore.fetchProfile().catch(() => null);
  }

  if (!portfolioStore.quota) {
    await portfolioStore.loadQuota();
  }

  await handleCheckoutReturn();
});
</script>

<template>
  <q-page class="upgrade-page q-pa-md q-pa-sm-lg">
    <header class="upgrade-hero">
      <p class="upgrade-eyebrow">Wisenancial Premium</p>
      <h1 class="upgrade-title" data-test="upgrade-title">เลือกแพ็กเกจที่เหมาะกับคุณ</h1>
      <p class="upgrade-subtitle">
        แพ็กเกจรายเดือน (฿) — จำนวนพอร์ตนับรวมทั้งโหมด Forex และ Stock แบ่งสัดส่วนเองได้
      </p>

      <WsCard tone="solid" class="current-card">
        <div class="current-row">
          <div>
            <div class="current-label">แพ็กเกจปัจจุบัน</div>
            <div class="current-value" data-test="current-tier">{{ currentTierLabel }}</div>
          </div>
          <div class="current-quota" data-test="current-quota">
            <div class="current-label">โควต้าพอร์ต</div>
            <div class="current-value">{{ usedPortfolios }} / {{ currentMaxPortfolios }}</div>
          </div>
        </div>

        <div v-if="!currentTier" class="free-note q-mt-sm" data-test="free-note">
          <q-icon name="info" size="16px" class="q-mr-xs" />
          แพ็กเกจฟรีสร้างได้ {{ FREE_TIER_MAX_PORTFOLIOS }} พอร์ต — อัปเกรดเพื่อเพิ่มจำนวนพอร์ต
        </div>
      </WsCard>
    </header>

    <div class="plans-grid" data-test="plans-grid">
      <WsCard
        v-for="plan in plans"
        :key="plan.tier"
        class="plan-card"
        :class="{
          'plan-card--popular': plan.popular,
          'plan-card--current': plan.isCurrent,
        }"
        :data-test="`plan-${plan.tier}`"
      >
        <template #header>
          <div class="plan-header">
            <div class="plan-header__top">
              <h2>{{ plan.name }}</h2>
              <WsBadge
                v-if="plan.isCurrent"
                kind="ai"
                color="positive"
                value="ใช้อยู่"
                label="ใช้อยู่"
              />
              <WsBadge
                v-else-if="plan.popular"
                kind="ai"
                color="warning"
                value="แนะนำ"
                label="แนะนำ"
              />
            </div>

            <p class="plan-price">
              <span class="plan-price__amount">฿{{ plan.priceThb.toLocaleString() }}</span>
              <span class="plan-price__period">/ เดือน</span>
            </p>

            <p class="plan-quota" :data-test="`quota-${plan.tier}`">
              <q-icon name="account_balance_wallet" size="18px" />
              สูงสุด {{ plan.maxPortfolios }} พอร์ต
            </p>
          </div>
        </template>

        <ul class="plan-features">
          <li v-for="feature in plan.features" :key="feature">
            <q-icon name="check_circle" size="16px" color="positive" class="q-mr-xs" />
            {{ feature }}
          </li>
        </ul>

        <template #footer>
          <q-btn
            unelevated
            no-caps
            class="full-width plan-cta"
            :color="plan.isCurrent ? 'grey-7' : plan.popular ? 'primary' : 'grey-8'"
            :label="ctaLabel(plan)"
            :disable="plan.isCurrent"
            :loading="isCheckingOut(plan.tier)"
            :data-test="`cta-${plan.tier}`"
            @click="selectPlan(plan)"
          />
        </template>
      </WsCard>
    </div>

    <!-- ตารางเปรียบเทียบโควต้าแบบย่อ ให้เทียบได้ในบรรทัดเดียว -->
    <WsCard class="compare-card q-mt-lg">
      <template #header>
        <div class="text-subtitle1 text-weight-bolder">เปรียบเทียบโควต้าพอร์ต</div>
      </template>

      <table class="compare-table" data-test="compare-table">
        <thead>
          <tr>
            <th>แพ็กเกจ</th>
            <th class="text-right">ราคา / เดือน</th>
            <th class="text-right">จำนวนพอร์ตสูงสุด</th>
          </tr>
        </thead>
        <tbody>
          <tr data-test="compare-row-FREE" :class="{ 'is-current': !currentTier }">
            <td>ฟรี</td>
            <td class="text-right">฿0</td>
            <td class="text-right">{{ FREE_TIER_MAX_PORTFOLIOS }}</td>
          </tr>
          <tr
            v-for="plan in plans"
            :key="plan.tier"
            :data-test="`compare-row-${plan.tier}`"
            :class="{ 'is-current': plan.isCurrent }"
          >
            <td>{{ plan.name }}</td>
            <td class="text-right">฿{{ plan.priceThb.toLocaleString() }}</td>
            <td class="text-right">{{ plan.maxPortfolios }}</td>
          </tr>
        </tbody>
      </table>
    </WsCard>
  </q-page>
</template>

<style scoped>
.upgrade-page {
  max-width: 1120px;
  margin: 0 auto;
}

.upgrade-hero {
  text-align: center;
  margin-bottom: 32px;
}

.upgrade-eyebrow {
  margin: 0 0 8px;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.65;
}

.upgrade-title {
  margin: 0 0 10px;
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 800;
  line-height: 1.3;
}

.upgrade-subtitle {
  margin: 0 auto 24px;
  max-width: 680px;
  font-size: 1rem;
  line-height: 1.5;
  opacity: 0.7;
}

.current-card {
  max-width: 520px;
  margin: 0 auto;
  text-align: left;
}

.current-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.current-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}

.current-value {
  font-size: 1.25rem;
  font-weight: 800;
  margin-top: 2px;
}

.current-quota {
  text-align: right;
}

.free-note {
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0.75;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  align-items: stretch;
}

.plan-card--popular {
  border: 1px solid rgba(59, 130, 246, 0.55);
  box-shadow:
    0 12px 40px rgba(59, 130, 246, 0.18),
    0 0 24px rgba(59, 130, 246, 0.12);
}

.plan-card--current {
  border: 1px solid rgba(34, 197, 94, 0.55);
}

.plan-header h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
}

.plan-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.plan-price {
  margin: 14px 0 0;
}

.plan-price__amount {
  font-size: 2rem;
  font-weight: 800;
}

.plan-price__period {
  font-size: 0.9rem;
  font-weight: 600;
  opacity: 0.6;
  margin-left: 4px;
}

.plan-quota {
  margin: 6px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #60a5fa;
}

.plan-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.9rem;
}

.plan-features li {
  display: flex;
  align-items: flex-start;
  line-height: 1.45;
}

.plan-cta {
  font-weight: 700;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}

.compare-table th,
.compare-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.compare-table th {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  opacity: 0.65;
}

.compare-table tbody tr.is-current {
  background: rgba(34, 197, 94, 0.1);
  font-weight: 700;
}
</style>
