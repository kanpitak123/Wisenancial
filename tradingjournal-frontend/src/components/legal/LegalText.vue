<template>
  <span class="legal-text">
    <template v-for="(segment, index) in segments" :key="index">
      <strong v-if="segment.type === 'bold'">{{ segment.text }}</strong>
      <mark v-else-if="segment.type === 'placeholder'" class="legal-placeholder" data-test="legal-placeholder">{{
        segment.text
      }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { tokenizeLegalText } from 'src/utils/legal-markup';

/**
 * ข้อความของเอกสารกฎหมาย: **ตัวหนา** และ [ตัวยึด] ที่ยังรอคำตอบจริง
 * ตัวยึดถูกไฮไลต์ให้เห็นชัดโดยตั้งใจ — เอกสารนี้ยังเป็นฉบับร่าง ห้ามให้ใครอ่านผ่านตาแล้วเข้าใจว่าจบแล้ว
 */
const props = defineProps<{ text: string }>();

const segments = computed(() => tokenizeLegalText(props.text));
</script>

<style scoped>
.legal-placeholder {
  background: rgba(245, 158, 11, 0.22);
  color: inherit;
  border-radius: 4px;
  padding: 0 4px;
  border: 1px dashed rgba(245, 158, 11, 0.7);
}
</style>
