<template>
  <q-dialog
    v-model="settingsStore.isCommandPaletteOpen"
    position="top"
    maximized
    transition-show="slide-down"
    transition-hide="slide-up"
    @hide="resetSearch"
  >
    <q-card class="command-palette">
      <q-card-section class="q-pa-none">
        <div class="search-container">
          <q-icon name="search" class="search-icon" />
          <q-input
            v-model="searchQuery"
            placeholder="Type a command or search..."
            outlined
            dense
            dark
            class="search-input"
            ref="searchInput"
            @keyup.enter="executeSelectedAction"
            @keyup.up="navigateUp"
            @keyup.down="navigateDown"
            @keyup.escape="closeCommandPalette"
          />
        </div>
      </q-card-section>

      <q-card-section class="q-pa-none" v-if="filteredActions.length > 0">
        <q-list dark class="action-list">
          <q-item
            v-for="(action, index) in filteredActions"
            :key="action.id"
            clickable
            class="action-item"
            :class="{ 'action-item--selected': selectedIndex === index }"
            @click="executeAction(action)"
            @mouseover="selectedIndex = index"
          >
            <q-item-section avatar>
              <q-icon :name="action.icon" :color="action.color || 'primary'" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="action-title">{{ action.title }}</q-item-label>
              <q-item-label caption class="action-description">{{
                action.description
              }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-chip
                v-if="action.shortcut"
                size="sm"
                color="grey-7"
                text-color="white"
                class="action-shortcut"
              >
                {{ action.shortcut }}
              </q-chip>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-card-section class="q-pa-none" v-else-if="searchQuery">
        <div class="no-results">
          <q-icon name="search_off" size="48px" color="grey-6" />
          <div class="no-results-text">No commands found</div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSettingsStore } from 'stores/SettingsStore';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';
import { useWorkspace } from 'src/composables/useWorkspace';
import type { WorkspaceType } from 'src/types/workspace.types';

interface CommandAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  color?: string;
  shortcut?: string;
  action: () => void;
  category: string;
  /** จำกัดให้โผล่เฉพาะโหมดนี้ — ไม่ใส่ = โผล่ทุกโหมด */
  workspace?: WorkspaceType;
}

const router = useRouter();
const $q = useQuasar();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const languageStore = useLanguageStore();
const { canAccess } = useWorkspace();

const actions: CommandAction[] = [
  // Navigation
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Go to main dashboard',
    icon: 'dashboard',
    shortcut: 'Ctrl+D',
    action: () => void router.push('/Dashboard'),
    category: 'Navigation',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'View portfolio management',
    icon: 'account_balance',
    shortcut: 'Ctrl+P',
    action: () => void router.push('/Portfolio'),
    category: 'Navigation',
  },
  {
    id: 'journal',
    title: 'Journal',
    description: 'Open trading journal',
    icon: 'add_circle',
    shortcut: 'Ctrl+N',
    action: () => void router.push('/Journal'),
    category: 'Navigation',
    workspace: 'TRADER',
  },
  {
    id: 'stock-terminal',
    title: 'Stock Terminal',
    description: 'Browse, screen and analyse stocks',
    icon: 'candlestick_chart',
    action: () => void router.push('/Stocks'),
    category: 'Navigation',
    workspace: 'INVESTOR',
  },
  {
    id: 'monthly-movers',
    title: 'Monthly Movers',
    description: 'Biggest movers this month',
    icon: 'moving',
    action: () => void router.push('/MonthlyMovers'),
    category: 'Navigation',
    workspace: 'INVESTOR',
  },
  {
    id: 'market-pulse',
    title: 'Market Pulse',
    description: 'Positioning, sector heatmap and AI growth picks',
    icon: 'insights',
    action: () => void router.push('/Market'),
    category: 'Navigation',
    workspace: 'INVESTOR',
  },
  {
    id: 'leaderboard',
    title: 'Leaderboard',
    description: 'Rankings, missions and rewards',
    icon: 'emoji_events',
    action: () => void router.push('/Leaderboard'),
    category: 'Navigation',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'View trading analytics',
    icon: 'analytics',
    shortcut: 'Ctrl+A',
    action: () => void router.push('/Analytics'),
    category: 'Navigation',
  },
  {
    id: 'news',
    title: 'News',
    description: 'View market news',
    icon: 'newspaper',
    shortcut: 'Ctrl+M',
    action: () => void router.push('/News'),
    category: 'Navigation',
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    description: 'View tracked assets',
    icon: 'star',
    action: () => void router.push('/Watchlist'),
    category: 'Navigation',
  },
  {
    id: 'classroom',
    title: 'Classroom',
    description: 'Trading education',
    icon: 'school',
    shortcut: 'Ctrl+E',
    action: () => void router.push('/Classroom'),
    category: 'Navigation',
  },

  // Settings
  {
    id: 'privacy-mode',
    title: 'Toggle Privacy Mode',
    description: 'Hide sensitive financial data',
    icon: 'visibility_off',
    shortcut: 'Ctrl+Shift+P',
    action: () => {
      settingsStore.togglePrivacy();
      $q.notify({
        type: 'info',
        message: `Privacy Mode ${settingsStore.isPrivacyMode ? 'enabled' : 'disabled'}`,
        position: 'top',
      });
    },
    category: 'Settings',
  },
  {
    id: 'theme-toggle',
    title: 'Toggle Theme',
    description: 'Switch between light and dark mode',
    icon: 'brightness_6',
    shortcut: 'Ctrl+T',
    action: () => {
      $q.dark.toggle();
      $q.notify({
        type: 'info',
        message: `Switched to ${$q.dark.isActive ? 'dark' : 'light'} mode`,
        position: 'top',
      });
    },
    category: 'Settings',
  },
  {
    id: 'language-toggle',
    title: 'Toggle Language',
    description: 'Switch between English and Thai',
    icon: 'language',
    shortcut: 'Ctrl+L',
    action: () => {
      languageStore.toggleLanguage();
      $q.notify({
        type: 'info',
        message: languageStore.isThai ? 'เปลี่ยนเป็นภาษาไทยแล้ว' : 'Switched to English',
        position: 'top',
      });
    },
    category: 'Settings',
  },

  // User Actions
  {
    id: 'logout',
    title: 'Logout',
    description: 'Sign out of your account',
    icon: 'logout',
    shortcut: 'Ctrl+Q',
    color: 'negative',
    action: () => {
      // logout ยิง /auth/logout ให้ backend revoke refresh token ก่อน แล้วค่อยเด้งหน้า
      // ไม่ await เพราะไม่อยากให้ผู้ใช้ค้างรอเน็ต — clearSession ทำงานใน finally อยู่แล้ว
      void authStore.logout().finally(() => {
        void router.push('/Login');
      });
    },
    category: 'User',
  },

  // Quick Actions
  {
    id: 'refresh-data',
    title: 'Refresh Data',
    description: 'Refresh market data',
    icon: 'refresh',
    shortcut: 'F5',
    action: () => {
      window.location.reload();
    },
    category: 'Actions',
  },
];

const searchQuery = ref('');
const selectedIndex = ref(0);
const searchInput = ref();

// ตัดคำสั่งของอีกโหมดออกก่อน จะได้ไม่เจอ Journal ตอนอยู่โหมด Stock (แล้วโดน guard เตะกลับ)
const availableActions = computed(() => actions.filter((action) => canAccess(action.workspace)));

const filteredActions = computed(() => {
  if (!searchQuery.value) {
    return availableActions.value.slice(0, 8); // Show first 8 by default
  }

  const query = searchQuery.value.toLowerCase();
  return availableActions.value.filter(
    (action) =>
      action.title.toLowerCase().includes(query) ||
      action.description.toLowerCase().includes(query) ||
      action.category.toLowerCase().includes(query),
  );
});

const executeAction = (action: CommandAction) => {
  action.action();
  closeCommandPalette();
};

const executeSelectedAction = () => {
  const selectedAction = filteredActions.value[selectedIndex.value];
  if (selectedAction) {
    executeAction(selectedAction);
  }
};

const navigateUp = () => {
  selectedIndex.value =
    selectedIndex.value > 0 ? selectedIndex.value - 1 : filteredActions.value.length - 1;
};

const navigateDown = () => {
  selectedIndex.value =
    selectedIndex.value < filteredActions.value.length - 1 ? selectedIndex.value + 1 : 0;
};

const closeCommandPalette = () => {
  settingsStore.isCommandPaletteOpen = false;
};

const resetSearch = () => {
  searchQuery.value = '';
  selectedIndex.value = 0;
};

// Watch for command palette opening
watch(
  () => settingsStore.isCommandPaletteOpen,
  (isOpen) => {
    if (isOpen) {
      void nextTick(() => {
        searchInput.value?.focus();
      });
    }
  },
);

// Reset selected index when filtered actions change
watch(filteredActions, () => {
  selectedIndex.value = 0;
});
</script>

<style scoped>
.command-palette {
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 600px;
  margin: 20px auto;
  border-radius: 12px;
  overflow: hidden;
}

.search-container {
  display: flex;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.search-icon {
  margin-right: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
}

.search-input {
  flex: 1;
}

.search-input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.search-input :deep(.q-field__control:before) {
  border: none;
}

.search-input :deep(.q-field__native) {
  color: white;
  font-size: 16px;
}

.search-input :deep(.q-field__native::placeholder) {
  color: rgba(255, 255, 255, 0.5);
}

.action-list {
  padding: 0;
}

.action-item {
  padding: 12px 20px;
  margin: 4px 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.action-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.action-item--selected {
  background: rgba(255, 255, 255, 0.1);
  border-left: 3px solid primary;
}

.action-title {
  font-weight: 500;
  font-size: 14px;
  color: white;
}

.action-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 2px;
}

.action-shortcut {
  font-family: 'Courier New', monospace;
  font-size: 10px;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.6);
}

.no-results-text {
  margin-top: 16px;
  font-size: 16px;
}
</style>
