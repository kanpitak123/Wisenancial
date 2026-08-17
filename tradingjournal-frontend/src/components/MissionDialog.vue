<template>
  <q-dialog v-model="isOpen" backdrop-filter="blur(8px) saturate(1.3)">
    <q-card class="mission-dialog-card" style="width: 500px; max-width: 95vw">
      <div class="broker-dialog-header">
        <div>
          <div class="broker-dialog-title flex items-center">
            <q-icon name="military_tech" color="warning" size="24px" class="q-mr-sm" />
            Missions & Challenges
          </div>
          <div class="broker-dialog-subtitle">Complete tasks to earn points</div>
        </div>
        <q-btn flat round dense icon="close" class="broker-close-btn" v-close-popup />
      </div>

      <q-scroll-area style="height: 60vh; min-height: 400px">
        <div v-if="missionStore.isLoading" class="flex flex-center q-py-xl">
          <q-spinner-dots color="primary" size="40px" />
        </div>

        <div v-else class="q-pa-md">
          <div v-for="m in missionStore.missions" :key="m.id" class="mission-card q-mb-md">
            <div class="row no-wrap items-start">
              <div class="col">
                <div class="row items-center q-mb-xs">
                  <div class="text-weight-bold text-main" style="font-size: 15px">
                    {{ m.title }}
                  </div>
                  <q-badge
                    color="orange-2"
                    text-color="orange-10"
                    class="q-ml-sm text-weight-bold"
                    label="Daily"
                  />
                </div>
                <div class="text-caption text-muted q-mb-md">{{ m.description }}</div>

                <div class="row items-center justify-between no-wrap">
                  <div class="col q-mr-md">
                    <q-linear-progress
                      :value="Math.min(m.progress / m.target_count, 1)"
                      color="primary"
                      track-color="grey-3"
                      rounded
                      size="8px"
                    />
                    <div class="text-caption text-muted q-mt-xs text-weight-medium">
                      Progress: {{ m.progress }} / {{ m.target_count }}
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="text-weight-bold text-orange-9" style="font-size: 16px">
                      +{{ m.points }}
                    </div>
                    <div
                      class="text-caption text-muted text-weight-bold"
                      style="font-size: 10px; letter-spacing: 1px"
                    >
                      POINTS
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="q-mt-md border-top q-pt-sm flex justify-end">
              <q-btn
                v-if="m.status === 'CLAIMED'"
                label="Claimed Successfully"
                color="grey-5"
                text-color="grey-7"
                unelevated
                disable
                dense
                class="q-px-md text-weight-bold"
                icon="check_circle"
              />
              <q-btn
                v-else-if="m.can_claim"
                label="Claim Reward"
                color="positive"
                unelevated
                dense
                class="q-px-md text-weight-bold animate-pop"
                icon="redeem"
                @click="handleClaim(m.id)"
              />
              <q-btn
                v-else
                label="In Progress"
                color="primary"
                flat
                dense
                disable
                class="q-px-md text-weight-bold"
                icon="hourglass_empty"
              />
            </div>
          </div>

          <div v-if="missionStore.missions.length === 0" class="text-center q-py-xl text-muted">
            <q-icon name="explore" size="40px" class="q-mb-sm opacity-50" />
            <div>No active challenges for today. Check back later!</div>
          </div>
        </div>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGamificationStore } from 'stores/GamificationStore';
import { useQuasar } from 'quasar';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(['update:modelValue']);
const $q = useQuasar();
const missionStore = useGamificationStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

async function handleClaim(missionId: number) {
  $q.loading.show({ message: 'Claiming your reward...' });

  try {
    await missionStore.claimMission(missionId);
    $q.notify({
      type: 'positive',
      message: 'Claimed Successfully! Points added to your balance.',
      icon: 'stars',
      position: 'top',
    });
  } catch {
    $q.notify({
      type: 'negative',
      message: missionStore.error || 'Failed to claim reward.',
      position: 'top',
    });
  } finally {
    $q.loading.hide();
  }
}
</script>

<style scoped>
/* Base Styles (Light Mode) */
.mission-dialog-card {
  border-radius: 20px !important;
  /* Use system card background or default white */
  background: var(--q-card-background, #ffffff);
}

.mission-card {
  /* Use softer container color or light grey */
  background: var(--q-neutral-light, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 16px;
  transition: all 0.2s ease;
}

.mission-card:hover {
  border-color: var(--q-primary);
  transform: translateY(-2px);
}

.text-main {
  color: var(--text-main, #1e293b);
}

.text-muted {
  color: var(--text-muted, #64748b);
}

.border-top {
  border-top: 1px dashed var(--border-color, #e2e8f0);
}

.animate-pop {
  animation: pop 1.6s ease-in-out infinite;
}

@keyframes pop {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

/* Dark Mode Overrides */
.body--dark .mission-dialog-card {
  background: var(--bg-dialog, #1a2540);
}

.body--dark .mission-card {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

.body--dark .text-main {
  color: #f1f5f9 !important;
}

.body--dark .text-muted {
  color: #94a3b8 !important;
}

.body--dark .border-top {
  border-top: 1px dashed rgba(255, 255, 255, 0.1) !important;
}
</style>
