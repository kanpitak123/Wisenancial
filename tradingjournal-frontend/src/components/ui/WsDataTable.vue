<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import type { QTableColumn } from 'quasar';

type DenseMode = boolean | 'auto';

interface Props {
  rows: unknown[];
  columns: QTableColumn[];
  rowKey?: string;
  loading?: boolean;
  dense?: DenseMode;
}

const props = withDefaults(defineProps<Props>(), {
  rowKey: 'id',
  loading: false,
  dense: 'auto',
});

const attrs = useAttrs();

const resolvedDense = computed(() => {
  if (props.dense === 'auto') return true;
  return props.dense;
});
</script>

<template>
  <q-table
    v-bind="attrs"
    class="ws-table"
    flat
    :rows="rows"
    :columns="columns"
    :row-key="rowKey"
    :loading="loading"
    :dense="resolvedDense"
    :rows-per-page-options="[10, 25, 50]"
  >
    <template v-for="(_, slotName) of $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps" />
    </template>
  </q-table>
</template>

<style scoped>
.ws-table :deep(.q-table__container) {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(51, 65, 85, 0.9);
  background: rgba(19, 26, 34, 0.72);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}

.ws-table :deep(.q-table thead tr) {
  background: rgba(15, 23, 42, 0.55);
}

.ws-table :deep(.q-table th) {
  border-bottom: 1px solid rgba(51, 65, 85, 0.75);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.82);
}

.ws-table :deep(.q-table tbody td) {
  border-bottom: 1px solid rgba(51, 65, 85, 0.35);
}

.ws-table :deep(.q-table tbody tr:hover) {
  background: rgba(59, 130, 246, 0.07);
}

.ws-table :deep(.q-table__bottom) {
  border-top: 1px solid rgba(51, 65, 85, 0.75);
  background: rgba(15, 23, 42, 0.45);
}

.ws-table :deep(.q-btn--dense .q-icon) {
  opacity: 0.9;
}
</style>
