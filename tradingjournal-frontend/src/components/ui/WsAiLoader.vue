<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';

type Accent = 'primary' | 'negative' | 'warning';

interface Props {
  messages?: string[];
  accent?: Accent;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  accent: 'primary',
  compact: false,
});

const languageStore = useLanguageStore();
const phraseIndex = ref(0);

const defaultMessages = computed(() => {
  if (props.messages?.length) return props.messages;

  return languageStore.isThai
    ? [
        'กำลังวิเคราะห์ข้อมูลตลาด...',
        'กำลังประเมินปัจจัยความเสี่ยง...',
        'กำลังสังเคราะห์อินไซต์...',
        'กำลังจัดอันดับสัญญาณ...',
      ]
    : [
        'Analyzing market data...',
        'Evaluating risk factors...',
        'Synthesizing insights...',
        'Ranking signal strength...',
      ];
});

const currentMessage = computed(
  () => defaultMessages.value[phraseIndex.value % defaultMessages.value.length],
);

let cycleTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  cycleTimer = setInterval(() => {
    phraseIndex.value += 1;
  }, 2000);
});

onUnmounted(() => {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
});
</script>

<template>
  <div
    class="ws-ai-loader"
    :class="[
      `ws-ai-loader--${accent}`,
      { 'ws-ai-loader--compact': compact },
    ]"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div class="ws-ai-loader__visual">
      <div class="ws-ai-loader__ring" aria-hidden="true" />
      <div class="ws-ai-loader__core">
        <span class="ws-ai-loader__glow" aria-hidden="true" />
        <q-icon name="psychology" :size="compact ? '22px' : '28px'" class="ws-ai-loader__icon" />
      </div>
    </div>

    <Transition name="ws-ai-loader-text" mode="out-in">
      <p :key="currentMessage" class="ws-ai-loader__text">
        {{ currentMessage }}
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.ws-ai-loader {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 28px 20px;
  text-align: center;
}

.ws-ai-loader--compact {
  padding: 20px 16px;
  gap: 12px;
}

.ws-ai-loader__visual {
  position: relative;
  width: 88px;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ws-ai-loader--compact .ws-ai-loader__visual {
  width: 68px;
  height: 68px;
}

.ws-ai-loader__core {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(99, 102, 241, 0.35);
  z-index: 1;
}

.ws-ai-loader--compact .ws-ai-loader__core {
  width: 56px;
  height: 56px;
}

.ws-ai-loader__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent,
    rgba(99, 102, 241, 0.15),
    rgba(59, 130, 246, 0.85),
    rgba(139, 92, 246, 0.75),
    transparent
  );
  animation: ws-ai-loader-spin 3s linear infinite;
  pointer-events: none;
}

.ws-ai-loader__glow {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  animation: ws-ai-loader-pulse 2.4s ease-in-out infinite;
  pointer-events: none;
}

.ws-ai-loader--primary .ws-ai-loader__glow {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, transparent 70%);
}

.ws-ai-loader--negative .ws-ai-loader__glow {
  background: radial-gradient(circle, rgba(244, 63, 94, 0.32) 0%, transparent 70%);
}

.ws-ai-loader--warning .ws-ai-loader__glow {
  background: radial-gradient(circle, rgba(245, 158, 11, 0.32) 0%, transparent 70%);
}

.ws-ai-loader--primary .ws-ai-loader__core {
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 0 24px rgba(59, 130, 246, 0.2);
}

.ws-ai-loader--negative .ws-ai-loader__core {
  border-color: rgba(244, 63, 94, 0.45);
  box-shadow: 0 0 24px rgba(244, 63, 94, 0.18);
}

.ws-ai-loader--warning .ws-ai-loader__core {
  border-color: rgba(245, 158, 11, 0.45);
  box-shadow: 0 0 24px rgba(245, 158, 11, 0.18);
}

.ws-ai-loader--primary .ws-ai-loader__icon {
  color: #93c5fd;
  filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.55));
}

.ws-ai-loader--negative .ws-ai-loader__icon {
  color: #fda4af;
  filter: drop-shadow(0 0 10px rgba(244, 63, 94, 0.5));
}

.ws-ai-loader--warning .ws-ai-loader__icon {
  color: #fcd34d;
  filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.5));
}

.ws-ai-loader__icon {
  position: relative;
  z-index: 1;
}

.ws-ai-loader__text {
  margin: 0;
  max-width: 320px;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.45;
  color: #c7d2fe;
  letter-spacing: 0.01em;
}

.ws-ai-loader--negative .ws-ai-loader__text {
  color: #fecdd3;
}

.ws-ai-loader--warning .ws-ai-loader__text {
  color: #fde68a;
}

.ws-ai-loader--compact .ws-ai-loader__text {
  font-size: 0.82rem;
  max-width: 260px;
}

.ws-ai-loader-text-enter-active,
.ws-ai-loader-text-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.ws-ai-loader-text-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.ws-ai-loader-text-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@keyframes ws-ai-loader-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ws-ai-loader-pulse {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.94);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}
</style>
