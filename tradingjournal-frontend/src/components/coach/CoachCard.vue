<script setup lang="ts">
import { computed } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard } from 'src/components/ui';
import { SPECIALTY_META, type Coach } from 'src/types/coach.types';

const props = defineProps<{ coach: Coach }>();
const emit = defineEmits<{ (e: 'book', coach: Coach): void }>();

const languageStore = useLanguageStore();

const initials = computed(() =>
  props.coach.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
);

const headline = computed(() =>
  languageStore.isThai ? props.coach.headline.th : props.coach.headline.en,
);

const nextSlotLabel = computed(() => {
  const slot = props.coach.availableSlots[0];
  if (!slot) return languageStore.isThai ? 'ไม่มีช่วงเวลาว่าง' : 'No slots';
  return new Date(slot).toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
});
</script>

<template>
  <WsCard tone="glass" class="coach-card">
    <div class="coach-card__top">
      <q-avatar size="56px" color="primary" text-color="white" class="coach-card__avatar">
        <img v-if="coach.avatarUrl" :src="coach.avatarUrl" :alt="coach.name" />
        <span v-else>{{ initials }}</span>
      </q-avatar>
      <div class="coach-card__id">
        <div class="coach-card__name-row">
          <span class="coach-card__name">{{ coach.name }}</span>
          <span class="coach-card__rating">
            <q-icon name="star" size="14px" color="amber" />
            {{ coach.rating.toFixed(1) }}
            <span class="coach-card__reviews">({{ coach.reviewCount }})</span>
          </span>
        </div>
        <p class="coach-card__headline">{{ headline }}</p>
      </div>
    </div>

    <div class="coach-card__specialties">
      <WsBadge
        v-for="s in coach.specialties"
        :key="s"
        kind="ai"
        color="primary"
        outline
        :value="languageStore.isThai ? SPECIALTY_META[s].th : SPECIALTY_META[s].en"
      />
    </div>

    <div class="coach-card__meta">
      <span>
        <q-icon name="work_history" size="14px" />
        {{ coach.yearsExperience }} {{ languageStore.isThai ? 'ปี' : 'yrs' }}
      </span>
      <span>
        <q-icon name="schedule" size="14px" />
        {{ nextSlotLabel }}
      </span>
      <span class="coach-card__rate">
        ฿{{ coach.hourlyRateThb.toLocaleString() }}/{{ languageStore.isThai ? 'ชม.' : 'hr' }}
      </span>
    </div>

    <q-btn
      unelevated
      no-caps
      color="primary"
      icon="event_available"
      class="coach-card__book"
      :disable="!coach.availableSlots.length"
      :label="languageStore.isThai ? 'จองเซสชัน' : 'Book a session'"
      @click="emit('book', coach)"
    />
  </WsCard>
</template>

<style scoped lang="scss">
.coach-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.coach-card__top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.coach-card__id {
  flex: 1;
  min-width: 0;
}

.coach-card__name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.coach-card__name {
  font-weight: 700;
  font-size: 16px;
  color: var(--text-primary);
}

.coach-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.coach-card__reviews {
  color: var(--text-secondary);
  font-weight: 400;
}

.coach-card__headline {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.coach-card__specialties {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.coach-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: var(--text-secondary);
  align-items: center;
}

.coach-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.coach-card__rate {
  margin-left: auto;
  font-weight: 700;
  color: var(--text-primary);
}

.coach-card__book {
  margin-top: auto;
  border-radius: 10px;
}
</style>
