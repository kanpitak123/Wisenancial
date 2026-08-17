<script setup lang="ts">
import { computed, useSlots } from 'vue';

type Tone = 'glass' | 'solid';

interface Props {
  tone?: Tone;
  padded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'glass',
  padded: true,
});

const slots = useSlots();

const hasHeader = computed(() => Boolean(slots.header));
const hasFooter = computed(() => Boolean(slots.footer));
</script>

<template>
  <q-card
    class="ws-card"
    :class="[
      props.tone === 'glass' ? 'ws-card--glass' : 'ws-card--solid',
      props.padded ? 'ws-card--padded' : 'ws-card--flush',
    ]"
    flat
  >
    <q-card-section v-if="hasHeader" class="ws-card__header">
      <slot name="header" />
    </q-card-section>

    <q-card-section class="ws-card__body" :class="{ 'ws-card__body--noHeader': !hasHeader }">
      <slot />
    </q-card-section>

    <q-card-section v-if="hasFooter" class="ws-card__footer">
      <slot name="footer" />
    </q-card-section>
  </q-card>
</template>

<style scoped>
/* Light theme is the default; `.body--dark` (set by Quasar's dark mode)
   swaps the surface + border for the original dark treatment. */
.ws-card {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.95);
  color: var(--text-primary);
}

.ws-card--glass {
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: 0 10px 34px rgba(16, 24, 40, 0.08);
}

.ws-card--solid {
  background: #ffffff;
  box-shadow: 0 10px 34px rgba(16, 24, 40, 0.06);
}

.body--dark .ws-card {
  border-color: rgba(51, 65, 85, 0.9);
}

.body--dark .ws-card--glass {
  background: rgba(19, 26, 34, 0.72);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35);
}

.body--dark .ws-card--solid {
  background: rgba(30, 41, 59, 0.92);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.28);
}

.ws-card--padded :deep(.q-card__section) {
  padding: 16px;
}

.ws-card--flush :deep(.q-card__section) {
  padding: 0;
}

.ws-card__header {
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.ws-card__footer {
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.body--dark .ws-card__header {
  border-bottom-color: rgba(51, 65, 85, 0.55);
}

.body--dark .ws-card__footer {
  border-top-color: rgba(51, 65, 85, 0.55);
}

.ws-card__body--noHeader {
  border-top: 1px solid transparent;
}
</style>
