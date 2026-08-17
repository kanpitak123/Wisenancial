<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard, WsUpgradeNotice } from 'src/components/ui';
import CoachCard from 'src/components/coach/CoachCard.vue';
import { coachService } from 'src/services/coach.service';
import { isPaidTierError } from 'src/utils/paid-tier';
import {
  SPECIALTY_META,
  type Coach,
  type CoachSession,
  type CoachSpecialty,
} from 'src/types/coach.types';

const $q = useQuasar();
const languageStore = useLanguageStore();

const loading = ref(false);
const coaches = ref<Coach[]>([]);
const sessions = ref<CoachSession[]>([]);
const specialtyFilter = ref<CoachSpecialty | 'ALL'>('ALL');

// Booking dialog state
const bookingOpen = ref(false);
const bookingCoach = ref<Coach | null>(null);
const selectedSlot = ref<string | null>(null);
const topic = ref('');
const booking = ref(false);

const specialtyOptions = computed(() => [
  { label: languageStore.isThai ? 'ทั้งหมด' : 'All', value: 'ALL' as const },
  ...(Object.keys(SPECIALTY_META) as CoachSpecialty[]).map((s) => ({
    label: languageStore.isThai ? SPECIALTY_META[s].th : SPECIALTY_META[s].en,
    value: s,
  })),
]);

const filteredCoaches = computed(() => {
  if (specialtyFilter.value === 'ALL') return coaches.value;
  return coaches.value.filter((c) =>
    c.specialties.includes(specialtyFilter.value as CoachSpecialty),
  );
});

const upcomingSessions = computed(() => sessions.value.filter((s) => s.status === 'UPCOMING'));

const { safeLoad } = useSafeLoad();

/**
 * ทุก endpoint ของ /coaches ถูก gate ด้วย PaidTierGuard ที่ระดับ controller
 * ผู้ใช้แพ็กฟรีจะได้ 403 เสมอ — ต้องโชว์สถานะ "ต้องอัปเกรด" แทนปล่อย error ลง console
 */
const requiresUpgrade = ref(false);

const load = async () => {
  loading.value = true;
  requiresUpgrade.value = false;

  try {
    const [coachList, mySessions] = await Promise.all([
      coachService.listCoaches(),
      coachService.mySessions(),
    ]);

    coaches.value = coachList;
    sessions.value = mySessions;
  } catch (error) {
    if (isPaidTierError(error)) {
      requiresUpgrade.value = true;
      return;
    }

    // error อื่นๆ ให้ safeLoad จัดการแจ้งเตือนตามปกติ
    await safeLoad(() => {
      throw error;
    }, 'โหลดข้อมูลห้องโค้ชไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
};

const slotOptions = computed(() =>
  (bookingCoach.value?.availableSlots ?? []).map((slot) => ({
    label: new Date(slot).toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    value: slot,
  })),
);

const openBooking = (coach: Coach) => {
  bookingCoach.value = coach;
  selectedSlot.value = coach.availableSlots[0] ?? null;
  topic.value = '';
  bookingOpen.value = true;
};

const confirmBooking = async () => {
  if (!bookingCoach.value || !selectedSlot.value) return;
  booking.value = true;
  try {
    const session = await coachService.bookSession({
      coachId: bookingCoach.value.id,
      slot: selectedSlot.value,
      topic: topic.value.trim() || (languageStore.isThai ? 'ปรึกษาทั่วไป' : 'General coaching'),
    });
    sessions.value = [...sessions.value, session];
    bookingOpen.value = false;
    $q.notify({
      type: 'positive',
      message: languageStore.isThai ? 'จองเซสชันสำเร็จ' : 'Session booked',
    });
  } finally {
    booking.value = false;
  }
};

const cancelSession = async (session: CoachSession) => {
  await coachService.cancelSession(session.id);
  sessions.value = sessions.value.map((s) =>
    s.id === session.id ? { ...s, status: 'CANCELLED' } : s,
  );
  $q.notify({
    type: 'info',
    message: languageStore.isThai ? 'ยกเลิกเซสชันแล้ว' : 'Session cancelled',
  });
};

const formatSession = (s: CoachSession) =>
  new Date(s.scheduledAt).toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

onMounted(load);
</script>

<template>
  <q-page class="coach-page">
    <header class="coach-hero">
      <WsBadge kind="ai" color="primary" value="COACH ROOM" outline class="q-mb-sm" />
      <h1 class="coach-hero__title">
        {{ languageStore.isThai ? 'ห้องโค้ช' : 'Coach Room' }}
      </h1>
      <p class="coach-hero__subtitle">
        {{
          languageStore.isThai
            ? 'จองเซสชัน 1:1 กับเทรดเดอร์มืออาชีพเพื่อยกระดับการเทรดของคุณ'
            : 'Book 1:1 sessions with professional traders to level up your game.'
        }}
      </p>
    </header>

    <!-- แพ็กฟรี — backend ตอบ 403 จาก PaidTierGuard -->
    <WsUpgradeNotice
      v-if="requiresUpgrade"
      data-test="coach-upgrade"
      message-th="ห้องโค้ชเปิดให้เฉพาะสมาชิกแบบชำระเงิน อัปเกรดแพ็กเกจเพื่อจองเซสชัน 1:1 กับโค้ชมืออาชีพ"
      message-en="Coach Room is available on paid plans. Upgrade to book 1:1 sessions with professional traders."
    />

    <!-- My upcoming sessions -->
    <WsCard v-else-if="upcomingSessions.length" class="coach-sessions">
      <template #header>
        <div class="coach-section-label">
          <q-icon name="event" color="primary" class="q-mr-xs" />
          {{ languageStore.isThai ? 'เซสชันที่กำลังจะมาถึง' : 'My Upcoming Sessions' }}
        </div>
      </template>
      <div class="coach-session-list">
        <div v-for="s in upcomingSessions" :key="s.id" class="coach-session-row">
          <div>
            <span class="coach-session-coach">{{ s.coachName }}</span>
            <span class="coach-session-topic">{{ s.topic }}</span>
          </div>
          <div class="coach-session-time">{{ formatSession(s) }}</div>
          <q-btn
            flat
            dense
            no-caps
            color="negative"
            icon="cancel"
            :label="languageStore.isThai ? 'ยกเลิก' : 'Cancel'"
            @click="cancelSession(s)"
          />
        </div>
      </div>
    </WsCard>

    <!-- Specialty filter -->
    <div v-if="!requiresUpgrade" class="coach-filter">
      <q-select
        v-model="specialtyFilter"
        :options="specialtyOptions"
        option-value="value"
        option-label="label"
        emit-value
        map-options
        dense
        outlined
        dark
        class="coach-filter__select"
        :label="languageStore.isThai ? 'ความเชี่ยวชาญ' : 'Specialty'"
      />
    </div>

    <!-- Coaches grid -->
    <div v-if="loading && !requiresUpgrade" class="coach-grid">
      <div v-for="n in 3" :key="n" class="coach-skeleton" />
    </div>
    <div v-else-if="!requiresUpgrade" class="coach-grid">
      <CoachCard
        v-for="coach in filteredCoaches"
        :key="coach.id"
        :coach="coach"
        @book="openBooking"
      />
    </div>

    <!-- Booking dialog -->
    <q-dialog v-model="bookingOpen">
      <q-card class="coach-booking" dark>
        <q-card-section>
          <div class="text-h6">
            {{ languageStore.isThai ? 'จองเซสชันกับ' : 'Book with' }} {{ bookingCoach?.name }}
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="selectedSlot"
            :options="slotOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            outlined
            dark
            :label="languageStore.isThai ? 'เลือกช่วงเวลา' : 'Select time slot'"
          />
          <q-input
            v-model="topic"
            type="textarea"
            outlined
            dark
            autogrow
            :label="
              languageStore.isThai
                ? 'หัวข้อที่อยากปรึกษา (ไม่บังคับ)'
                : 'What do you want to cover? (optional)'
            "
          />
          <div v-if="bookingCoach" class="coach-booking__price">
            {{ languageStore.isThai ? 'ค่าบริการ' : 'Price' }}:
            <strong>฿{{ bookingCoach.hourlyRateThb.toLocaleString() }}</strong>
            / 60 {{ languageStore.isThai ? 'นาที' : 'min' }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps :label="languageStore.isThai ? 'ยกเลิก' : 'Cancel'" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            :loading="booking"
            :disable="!selectedSlot"
            :label="languageStore.isThai ? 'ยืนยันการจอง' : 'Confirm booking'"
            @click="confirmBooking"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.coach-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.coach-hero {
  margin-bottom: 24px;
}

.coach-hero__title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
}

.coach-hero__subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.coach-sessions {
  margin-bottom: 20px;
}

.coach-section-label {
  display: flex;
  align-items: center;
  font-weight: 700;
}

.coach-session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coach-session-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
}

.coach-session-coach {
  font-weight: 700;
  color: var(--text-primary);
  margin-right: 8px;
}

.coach-session-topic {
  color: var(--text-secondary);
  font-size: 13px;
}

.coach-session-time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-size: 13px;
}

.coach-filter {
  margin-bottom: 16px;
  max-width: 280px;
}

.coach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.coach-skeleton {
  height: 240px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.08) 25%,
    rgba(148, 163, 184, 0.18) 50%,
    rgba(148, 163, 184, 0.08) 75%
  );
  background-size: 200% 100%;
  animation: coach-shimmer 1.4s ease-in-out infinite;
}

.coach-booking {
  width: 460px;
  max-width: 90vw;
}

.coach-booking__price {
  color: var(--text-secondary);
  font-size: 14px;
}

@keyframes coach-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
