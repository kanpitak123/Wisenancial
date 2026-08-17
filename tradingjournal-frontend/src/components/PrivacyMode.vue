<template>
  <div class="privacy-mode-overlay" v-if="settingsStore.isPrivacyMode">
    <div class="privacy-indicator">
      <q-icon name="visibility_off" class="q-mr-sm" />
      <span>Privacy Mode Active</span>
      <q-btn 
        flat 
        dense 
        round 
        icon="close" 
        @click="settingsStore.togglePrivacy"
        class="q-ml-auto"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from 'stores/SettingsStore';

const settingsStore = useSettingsStore();
</script>

<style scoped>
.privacy-mode-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20px;
  pointer-events: none;
}

.privacy-indicator {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 12px 20px;
  color: white;
  display: flex;
  align-items: center;
  pointer-events: auto;
  backdrop-filter: blur(10px);
}

.privacy-indicator .q-btn {
  color: white;
}

/* Privacy mode styles for sensitive data */
.privacy-mode .sensitive-data {
  filter: blur(8px);
  transition: filter 0.3s ease;
}

.privacy-mode .sensitive-number {
  background: currentColor;
  color: transparent;
  border-radius: 4px;
  padding: 2px 4px;
}

.privacy-mode .sensitive-text {
  background: currentColor;
  color: transparent;
  border-radius: 4px;
  padding: 2px 8px;
}
</style>
