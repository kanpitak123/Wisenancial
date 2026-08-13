<template>
  <div class="global-date-filter">
    <q-btn
      outline
      color="primary"
      icon="calendar_month"
      :label="filterStore.displayLabel"
      class="q-px-md date-btn"
      no-caps
    >
      <q-popup-proxy cover transition-show="scale" transition-hide="scale">
        <q-card>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2 text-grey-8">เลือกช่วงเวลาที่ต้องการดูสถิติ</div>
          </q-card-section>

          <q-card-section>
            <q-date v-model="filterStore.dateRange" range mask="YYYY/MM/DD" color="primary" flat />
          </q-card-section>

          <q-card-actions align="right" class="text-primary">
            <q-btn flat label="ปิด" v-close-popup />
          </q-card-actions>
        </q-card>
      </q-popup-proxy>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { useGlobalFilterStore } from 'stores/GlobalFilterStore';

const filterStore = useGlobalFilterStore();
</script>

<style scoped>
.date-btn {
  border-radius: 8px;
  background: var(--bg-card-soft, #ffffff);
}
</style>
