import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const isPrivacyMode = ref(false);
  const isCommandPaletteOpen = ref(false);

  const togglePrivacy = () => {
    isPrivacyMode.value = !isPrivacyMode.value;
  };

  const toggleCommandPalette = () => {
    isCommandPaletteOpen.value = !isCommandPaletteOpen.value;
  };

  return {
    isPrivacyMode,
    isCommandPaletteOpen,
    togglePrivacy,
    toggleCommandPalette,
  };
});
