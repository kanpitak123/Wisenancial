import { onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from 'stores/SettingsStore';

export function useKeyboardShortcuts() {
  const settingsStore = useSettingsStore();

  const handleKeyDown = (event: KeyboardEvent) => {
    // Command Palette: Ctrl+K or Cmd+K (Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      settingsStore.toggleCommandPalette();
    }
    
    // Privacy Mode: Ctrl+Shift+P or Cmd+Shift+P (Mac)
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
      event.preventDefault();
      settingsStore.togglePrivacy();
    }
    
    // Additional shortcuts can be added here
  };

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
}
