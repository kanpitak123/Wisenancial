<script setup lang="ts">
import { computed } from 'vue';

type WsBadgeKind = 'ai' | 'thai';

interface Props {
  kind: WsBadgeKind;
  value: string | number;
  outline?: boolean;
  color?: string;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  outline: false,
});

const resolved = computed(() => {
  if (props.color) {
    return { color: props.color, text: props.label ?? String(props.value) };
  }

  if (props.kind === 'ai') {
    const v = String(props.value).toUpperCase();
    if (v === 'RECOMMENDED') return { color: 'positive', text: props.label ?? 'Recommended' };
    if (v === 'AVOID') return { color: 'negative', text: props.label ?? 'Avoid' };
    if (v === 'VOLATILE_UP') return { color: 'warning', text: props.label ?? 'Volatile Up' };
    if (v === 'VOLATILE_DOWN') return { color: 'deep-orange', text: props.label ?? 'Volatile Down' };
    return { color: 'grey-7', text: props.label ?? 'Normal' };
  }

  const s = String(props.value).toUpperCase();
  if (s === 'C') return { color: 'negative', text: props.label ?? 'C' };
  if (s === 'CB') return { color: 'warning', text: props.label ?? 'CB' };
  if (s === 'CS') return { color: 'amber', text: props.label ?? 'CS' };
  if (s === 'CC') return { color: 'info', text: props.label ?? 'CC' };
  return { color: 'grey-7', text: props.label ?? String(props.value) };
});

const badgeClasses = computed(() => ({
  'ws-badge': true,
  'ws-badge--outline': props.outline,
}));
</script>

<template>
  <q-badge
    :color="resolved.color"
    :outline="outline"
    class="ws-badge"
    :class="badgeClasses"
  >
    {{ resolved.text }}
  </q-badge>
</template>

<style scoped>
.ws-badge {
  font-weight: 800;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ws-badge--outline {
  background: transparent !important;
  border-color: currentColor;
}
</style>
