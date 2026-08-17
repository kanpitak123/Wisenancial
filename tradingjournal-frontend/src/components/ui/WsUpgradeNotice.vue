<script setup lang="ts">
/**
 * การ์ด "ฟีเจอร์นี้ต้องอัปเกรด" — ใช้เมื่อ backend ตอบ 403 จาก PaidTierGuard
 *
 * เดิมแพทเทิร์นนี้เขียนไว้ใน CoachRoomPage ที่เดียว พอต้องใช้ที่ MonthlyMovers และ
 * แท็บ Performance ของ Analytics ด้วย เลยยกออกมาเป็น component กลาง จะได้ไม่มี
 * "หน้าว่างเงียบๆ" หลงเหลืออยู่ และข้อความ/ปุ่มไปแพ็กเกจอยู่ที่เดียวกันหมด
 */
import { computed } from 'vue';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';
import { useLanguageStore } from 'stores/LanguageStore';
import WsCard from './WsCard.vue';

interface Props {
  /** อธิบายว่าฟีเจอร์ไหนถูกล็อกและได้อะไรเมื่ออัปเกรด (ภาษาไทย) */
  messageTh: string;
  /** ข้อความเดียวกันเป็นภาษาอังกฤษ */
  messageEn: string;
  /** inline = ใช้แทรกในแท็บ/ส่วนย่อยของหน้า ขนาดกะทัดรัดกว่า */
  dense?: boolean;
  /**
   * เน้นให้เด่นกว่าปกติ — ใช้ตรงที่การ์ดนี้ไปแทนเนื้อหาหลักของส่วนนั้นทั้งก้อน
   * (เช่น Top Performers) ไม่ใช่แค่แถบเล็ก ๆ ต่อท้าย
   *
   * เป็น opt-in ที่ default = false จุดที่เรียกใช้อยู่เดิมจึงหน้าตาเหมือนเดิมทุกที่
   */
  prominent?: boolean;
}

const props = withDefaults(defineProps<Props>(), { dense: false, prominent: false });

const languageStore = useLanguageStore();

const title = computed(() =>
  languageStore.isThai ? 'ฟีเจอร์นี้ต้องอัปเกรด' : 'Upgrade required',
);

const message = computed(() => (languageStore.isThai ? props.messageTh : props.messageEn));

const ctaLabel = computed(() => (languageStore.isThai ? 'ดูแพ็กเกจ' : 'View plans'));
</script>

<template>
  <WsCard
    class="ws-upgrade"
    :class="{ 'ws-upgrade--dense': props.dense, 'ws-upgrade--prominent': props.prominent }"
    data-test="upgrade-notice"
  >
    <div class="ws-upgrade__body">
      <q-icon
        name="workspace_premium"
        :size="props.prominent ? '56px' : props.dense ? '32px' : '44px'"
        color="warning"
      />
      <h2 class="ws-upgrade__title">{{ title }}</h2>
      <p class="ws-upgrade__text">{{ message }}</p>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="workspace_premium"
        class="text-weight-bold"
        :size="props.prominent ? 'lg' : 'md'"
        data-test="upgrade-notice-cta"
        :label="ctaLabel"
        :to="UPGRADE_ROUTE"
      />
    </div>
  </WsCard>
</template>

<style scoped>
.ws-upgrade__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.ws-upgrade--dense .ws-upgrade__body {
  padding: 20px 16px;
  gap: 8px;
}

.ws-upgrade__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.ws-upgrade--dense .ws-upgrade__title {
  font-size: 1rem;
}

.ws-upgrade__text {
  margin: 0;
  max-width: 46ch;
  opacity: 0.75;
  line-height: 1.6;
}

/* ── variant "prominent" ────────────────────────────────────────────────
   ใช้ตอนการ์ดนี้ไปแทนเนื้อหาหลักทั้งส่วน ให้ดูเป็นข้อเสนอ ไม่ใช่ข้อความ error จาง ๆ
   ทั้งหมดอยู่ใต้คลาสนี้ จุดเรียกใช้เดิมที่ไม่ได้ส่ง prominent จึงไม่กระทบเลย */
.ws-upgrade--prominent {
  border-color: rgba(245, 158, 11, 0.55);
  background-image: linear-gradient(
    160deg,
    rgba(245, 158, 11, 0.14),
    rgba(245, 158, 11, 0.02) 55%
  );
}

.ws-upgrade--prominent .ws-upgrade__body {
  padding: 48px 24px;
  gap: 16px;
}

.ws-upgrade--prominent .ws-upgrade__title {
  font-size: 1.5rem;
  letter-spacing: -0.01em;
}

.ws-upgrade--prominent .ws-upgrade__text {
  font-size: 1rem;
  opacity: 0.9;
  max-width: 52ch;
}
</style>
