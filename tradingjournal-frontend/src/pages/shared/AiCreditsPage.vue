<script setup lang="ts">
/**
 * เติมเครดิต AI
 *
 * ยกโครงหน้ามาจากโปรเจกต์เก่า แต่ต่อกับ store/service ปัจจุบันของ Wisenancial:
 *   - BillingStore.fetchPackages() / checkoutCredits() (ของเดิมเรียก billingStore.checkout())
 *   - AiStore.credits (ของเดิมอ่าน authStore.user.ai_credits ซึ่งตอนนี้เป็น ai_token_balance)
 *   - CreditPackage ใช้ priceThb + tokens (ของเดิมใช้ price + credits)
 *
 * Stripe เด้งกลับมาที่ /AiCredits?success=true|canceled=true (billing.service.ts ฝั่ง backend)
 */
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { WsBadge, WsCard } from 'src/components/ui';
import { useAiStore } from 'stores/AiStore';
import { useBillingStore } from 'stores/BillingStore';
import type { CreditPackage } from 'src/types/billing.types';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const aiStore = useAiStore();
const billingStore = useBillingStore();

const balance = computed(() => aiStore.credits);

const packages = computed(() => billingStore.packages);

const isCheckingOut = (pkg: CreditPackage) => billingStore.checkingOutCreditPackageId === pkg.id;

const isOtherCheckingOut = (pkg: CreditPackage) =>
  billingStore.checkingOutCreditPackageId !== null && billingStore.checkingOutCreditPackageId !== pkg.id;

/** จัดการ query ที่ Stripe แนบกลับมาหลังจ่ายเงิน */
const handleCheckoutReturn = async () => {
  if (route.query.success === 'true') {
    await billingStore.handleCreditCheckoutReturn(true);

    $q.notify({
      type: 'positive',
      message: 'เติมเครดิตสำเร็จ! เครดิตถูกเพิ่มเข้าบัญชีแล้ว',
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

const buyPackage = async (pkg: CreditPackage) => {
  try {
    const checkoutUrl = await billingStore.checkoutCredits(pkg.id);

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

onMounted(async () => {
  // ของเดิมบังคับ $q.dark.set(true) — ตัดออก หน้านี้ต้องเคารพธีมที่ผู้ใช้เลือกเหมือนหน้าอื่น
  await Promise.all([
    billingStore.fetchPackages().catch(() => null),
    aiStore.refreshCredits().catch(() => null),
  ]);

  await handleCheckoutReturn();
});
</script>

<template>
  <q-page class="credits-page q-pa-md q-pa-sm-lg">
    <header class="credits-hero">
      <p class="credits-eyebrow">Wisenancial AI</p>
      <h1 class="credits-title" data-test="credits-title">เติมเครดิต AI</h1>
      <p class="credits-subtitle">
        ซื้อเครดิตเพิ่มเพื่อใช้งานฟีเจอร์ AI — เครดิตไม่มีวันหมดอายุ
      </p>

      <WsCard tone="solid" class="balance-card">
        <div class="balance-row">
          <div class="balance-label">
            <q-icon name="bolt" color="amber" size="20px" />
            เครดิตคงเหลือ
          </div>
          <div class="balance-value" data-test="credit-balance">
            {{ balance.toLocaleString() }}
            <span class="balance-unit">เครดิต</span>
          </div>
        </div>
      </WsCard>
    </header>

    <div v-if="billingStore.isLoadingPackages" class="credits-loading" data-test="credits-loading">
      <q-spinner color="primary" size="32px" />
    </div>

    <div
      v-else-if="packages.length === 0"
      class="credits-empty"
      data-test="credits-empty"
    >
      <q-icon name="sell" size="40px" class="q-mb-sm" />
      <div class="text-subtitle1 text-weight-bolder">ยังไม่มีแพ็กเกจให้เลือกตอนนี้</div>
      <div class="text-body2 q-mt-xs">กรุณาลองใหม่อีกครั้งภายหลัง</div>
    </div>

    <div v-else class="packages-grid" data-test="packages-grid">
      <WsCard
        v-for="pkg in packages"
        :key="pkg.id"
        class="package-card"
        :class="{ 'package-card--popular': pkg.popular }"
        :data-test="`package-${pkg.id}`"
      >
        <template #header>
          <div class="package-header">
            <div class="package-header__top">
              <h2>{{ pkg.name }}</h2>
              <WsBadge v-if="pkg.popular" kind="ai" color="warning" value="คุ้มที่สุด" />
            </div>
            <p class="package-price">
              <span class="package-price__amount">฿{{ pkg.priceThb.toLocaleString() }}</span>
            </p>
            <p class="package-credits">
              <q-icon name="bolt" color="amber" size="18px" />
              {{ pkg.tokens.toLocaleString() }} เครดิต
            </p>
          </div>
        </template>

        <template #footer>
          <q-btn
            unelevated
            no-caps
            class="full-width buy-cta"
            icon="shopping_cart"
            label="ซื้อเลย"
            :color="pkg.popular ? 'primary' : 'grey-8'"
            :loading="isCheckingOut(pkg)"
            :disable="isOtherCheckingOut(pkg)"
            :data-test="`buy-${pkg.id}`"
            @click="buyPackage(pkg)"
          />
        </template>
      </WsCard>
    </div>
  </q-page>
</template>

<style scoped>
.credits-page {
  max-width: 1120px;
  margin: 0 auto;
}

.credits-hero {
  text-align: center;
  margin-bottom: 32px;
}

.credits-eyebrow {
  margin: 0 0 8px;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.65;
}

.credits-title {
  margin: 0 0 10px;
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 800;
  line-height: 1.3;
}

.credits-subtitle {
  margin: 0 auto 24px;
  max-width: 640px;
  font-size: 1rem;
  line-height: 1.5;
  opacity: 0.7;
}

.balance-card {
  max-width: 360px;
  margin: 0 auto;
}

.balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.balance-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.balance-value {
  font-size: 1.5rem;
  font-weight: 800;
}

.balance-unit {
  font-size: 0.85rem;
  font-weight: 500;
  opacity: 0.65;
}

.credits-loading,
.credits-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  opacity: 0.7;
  text-align: center;
}

.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  align-items: stretch;
}

.package-card--popular {
  border: 1px solid rgba(59, 130, 246, 0.55);
  box-shadow:
    0 12px 40px rgba(59, 130, 246, 0.18),
    0 0 24px rgba(59, 130, 246, 0.12);
}

.package-header h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
}

.package-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.package-price {
  margin: 14px 0 0;
}

.package-price__amount {
  font-size: 2rem;
  font-weight: 800;
}

.package-credits {
  margin: 6px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #60a5fa;
}

.buy-cta {
  font-weight: 700;
}
</style>
