<template>
  <q-layout view="lHh Lpr lFf">
    <q-header class="custom-header" bordered>
      <q-toolbar style="height: 100%">
        <q-btn
          v-show="$q.screen.lt.md"
          flat
          dense
          round
          :icon="leftDrawerOpen ? 'close' : 'menu'"
          class="menu-btn mobile-menu-btn"
          @click="leftDrawerOpen = !leftDrawerOpen"
        />

        <q-toolbar-title class="text-weight-bolder tracking-tight" />

        <MockModeToggle class="q-mr-sm" />

        <WorkspaceSwitcher class="q-mr-sm" />

        <GlobalDateFilter class="q-mr-sm" />

        <q-btn
          flat
          dense
          round
          class="theme-toggle-btn"
          :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
          @click="toggleDarkMode"
        >
          <q-tooltip class="bg-grey-9 text-white shadow-4">
            {{ $q.dark.isActive ? 'Switch to Light Mode' : 'Switch to Dark Mode' }}
          </q-tooltip>
        </q-btn>

        <q-btn flat dense round class="account-btn q-ml-xs">
          <q-avatar size="30px" class="account-avatar">
            <span class="text-weight-bold" style="font-size: 11px">
              {{ userStore.initials }}
            </span>
          </q-avatar>
          <q-tooltip class="bg-grey-9 text-white shadow-4">Account</q-tooltip>

          <q-menu anchor="bottom right" self="top right" class="account-menu" :offset="[0, 6]">
            <div class="q-px-md q-pt-md q-pb-sm">
              <div class="row items-center q-gutter-xs q-mb-xs">
                <div class="text-subtitle2 text-weight-bolder account-text-main">
                  {{ userStore.displayName }}
                </div>
                <q-badge
                  :color="userStore.planColor"
                  :label="userStore.planName"
                  style="font-size: 9px; padding: 2px 7px; border-radius: 20px; font-weight: 700"
                />
              </div>
              <div class="text-caption account-text-muted">
                {{ userStore.profile?.email ?? '—' }}
              </div>
            </div>

            <q-separator class="account-separator" />

            <q-list class="q-py-xs account-list" style="min-width: 220px">
              <q-item
                clickable
                v-ripple
                class="account-list-item text-negative"
                @click="handleLogout"
              >
                <q-item-section>Sign out</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      class="custom-drawer"
      :width="210"
      :mini="!$q.screen.lt.md && miniState"
      :mini-width="70"
    >
      <div class="column full-height">
        <div class="drawer-header row items-center justify-between q-px-md">
          <div class="row items-center">
            <div
              class="icon-box flex flex-center"
              :class="miniState ? 'cursor-pointer' : ''"
              @mouseenter="miniState && (logoHover = true)"
              @mouseleave="logoHover = false"
              @click="miniState && handleLogoClick()"
            >
              <q-icon
                :name="miniState && logoHover ? 'menu_open' : 'candlestick_chart'"
                color="primary"
                size="20px"
              />
              <q-tooltip v-if="miniState">Expand sidebar</q-tooltip>
            </div>

            <div v-show="!miniState" class="q-ml-sm">
              <div class="text-subtitle1 text-weight-bolder text-main tracking-tight lh-1">
                Trading Journal
              </div>
              <div class="text-caption text-weight-bold workspace-tag">
                <q-icon :name="workspaceMeta.icon" size="12px" class="q-mr-xs" />
                {{ workspaceMeta.label }}
              </div>
            </div>
          </div>

          <q-btn
            v-show="!miniState"
            flat
            dense
            round
            icon="chevron_left"
            class="menu-btn"
            @click="$q.screen.lt.md ? (leftDrawerOpen = false) : toggleMini()"
          >
            <q-tooltip>{{ $q.screen.lt.md ? 'Close' : 'Collapse sidebar' }}</q-tooltip>
          </q-btn>
        </div>

        <div class="col-grow q-py-md">
          <q-list class="q-px-sm sidebar-list">
            <EssentialLink v-for="link in linksList" :key="link.title" v-bind="link">
              <q-tooltip
                v-if="miniState"
                anchor="center right"
                self="center left"
                class="bg-black text-white"
              >
                {{ link.title }}
              </q-tooltip>
            </EssentialLink>
          </q-list>
        </div>

        <div class="sidebar-bottom q-px-sm q-pb-md">
          <div class="row justify-center q-gutter-xs">
            <q-btn
              flat
              round
              size="sm"
              class="bottom-icon-btn"
              @click="leaderboardDialogOpen = true"
            >
              <q-icon name="leaderboard" size="20px" />
              <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9 text-white">
                Global Leaderboard
              </q-tooltip>
            </q-btn>

            <q-btn flat round size="sm" class="bottom-icon-btn" @click="missionsDialogOpen = true">
              <q-icon name="military_tech" size="22px" />
              <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9 text-white">
                Missions & Challenges
              </q-tooltip>
            </q-btn>

            <q-btn flat round size="sm" class="bottom-icon-btn" to="/chat">
              <q-icon name="chat" size="20px" />
              <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9 text-white">
                Live Chat
              </q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </q-drawer>

    <q-page-container class="page-container">
      <router-view />
    </q-page-container>

    <q-dialog v-model="leaderboardDialogOpen" backdrop-filter="blur(8px) saturate(1.3)">
      <q-card class="broker-dialog" style="width: 500px; max-width: 95vw">
        <div class="broker-dialog-header">
          <div>
            <div class="broker-dialog-title flex items-center">
              <q-icon name="emoji_events" color="warning" size="20px" class="q-mr-xs" />
              Global Leaderboard
            </div>
            <div class="broker-dialog-subtitle">Top 100 Traders by Net Profit</div>
          </div>
          <q-btn flat round dense icon="close" class="broker-close-btn" v-close-popup />
        </div>

        <div
          class="row items-center q-px-md q-pt-md q-pb-xs text-caption text-weight-bold text-muted text-uppercase"
          style="letter-spacing: 0.5px"
        >
          <div class="col-2 text-center">Rank</div>
          <div class="col-5">Trader</div>
          <div class="col-5 text-right">Balance Info</div>
        </div>

        <q-separator class="q-mx-md opacity-50" />

        <q-scroll-area style="height: 50vh; min-height: 350px">
          <div v-if="loadingLeaderboard" class="flex flex-center q-py-xl full-height">
            <q-spinner-dots color="primary" size="40px" />
          </div>

          <div v-else-if="leaderboardList.length === 0" class="text-center text-muted q-py-xl">
            <q-icon name="analytics" size="40px" class="q-mb-sm opacity-50" />
            <div>No leaderboard data available</div>
          </div>

          <q-list v-else class="q-pa-sm">
            <q-item
              v-for="user in leaderboardList"
              :key="user.rank"
              class="leaderboard-item q-mb-xs rounded-borders"
            >
              <q-item-section avatar style="min-width: 50px" class="flex-center">
                <div class="rank-badge" :class="'rank-' + user.rank">
                  {{ user.rank }}
                </div>
              </q-item-section>

              <q-item-section>
                <div class="row items-center no-wrap">
                  <q-avatar size="28px" class="account-avatar q-mr-sm shadow-1">
                    <span class="text-weight-bold" style="font-size: 10px">{{
                      user.initials
                    }}</span>
                  </q-avatar>
                  <div>
                    <q-item-label class="text-weight-bold text-main" style="font-size: 13px">
                      {{ user.username }}
                    </q-item-label>
                    <q-item-label v-if="user.winRate" caption style="font-size: 10px">
                      Win Rate: {{ user.winRate }}%
                    </q-item-label>
                  </div>
                </div>
              </q-item-section>

              <q-item-section side>
                <div class="text-right">
                  <div class="text-caption text-muted" style="font-size: 10px">
                    Initial: ${{
                      user.initial.toLocaleString('en-US', { minimumFractionDigits: 2 })
                    }}
                  </div>
                  <div class="text-weight-bolder text-positive" style="font-size: 13px">
                    Net: ${{ user.net.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </div>
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-scroll-area>
      </q-card>
    </q-dialog>
    <MissionDialog v-model="missionsDialogOpen" />

    <CommandPalette />
    <PrivacyMode />
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import EssentialLink from 'components/EssentialLink.vue';
import WorkspaceSwitcher from 'components/WorkspaceSwitcher.vue';
import MockModeToggle from 'components/MockModeToggle.vue';
import { useWorkspace } from 'src/composables/useWorkspace';
import { tradeService } from 'src/services/trade.service';
import type { LeaderboardUser } from 'src/types/trade.types';
import { useUserStore } from 'stores/UserStore';
import { useGamificationStore } from 'stores/GamificationStore';
import GlobalDateFilter from 'components/GlobalDateFilter.vue';
import MissionDialog from 'components/MissionDialog.vue';
import CommandPalette from 'components/CommandPalette.vue';
import PrivacyMode from 'components/PrivacyMode.vue';
import { useKeyboardShortcuts } from 'src/composables/useKeyboardShortcuts';

useKeyboardShortcuts();

const $q = useQuasar();
const userStore = useUserStore();
const missionsStore = useGamificationStore();
const missionsDialogOpen = ref(false);

// เมนูมาจาก WORKSPACE_NAV_LINKS ตามโหมดที่ active (Forex = TRADER, Stock = INVESTOR)
// แก้รายการเมนูที่ src/constants/workspace.constants.ts ที่เดียว
const {
  navLinks: linksList,
  meta: workspaceMeta,
  initializeActive,
  activeType: workspaceType,
} = useWorkspace();

// ภารกิจถูกกรองตามโหมด (audience) เลยต้องดึงใหม่ทุกครั้งที่สลับ ไม่งั้นค้างของโหมดเดิม
watch(workspaceType, () => {
  void missionsStore.fetchMissions();
});

function handleLogoClick() {
  if (miniState.value) {
    miniState.value = false;
  }
}
const leftDrawerOpen = ref(true);
const miniState = ref(false);
const logoHover = ref(false);

const leaderboardDialogOpen = ref(false);

// State สำหรับข้อมูล Leaderboard จริงจาก API
const leaderboardList = ref<Omit<LeaderboardUser, 'totalPnl'>[]>([]);
const loadingLeaderboard = ref(false);

// ฟังก์ชันดึงข้อมูลจาก API ฝั่ง Backend จริง
async function loadLeaderboardData() {
  loadingLeaderboard.value = true;
  try {
    // ใช้ tradeService (instance กลาง) แทน fetch ที่ hardcode URL ไว้
    // จะได้แนบ token / จัดการ 401 / รองรับ mock mode เหมือนที่อื่น
    const data = await tradeService.leaderboard();

    leaderboardList.value = [...data]
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0))
      .slice(0, 100)
      .map((item, index) => {
        const name = item.username || 'Anonymous';
        return {
          rank: index + 1,
          username: name,
          initials: name.substring(0, 2).toUpperCase(),
          initial: Number(item.initial_balance || 0),
          net: Number(item.current_balance || 0),
          winRate: item.win_rate ?? null,
        };
      });
  } catch (error) {
    console.error('Failed to load leaderboard database:', error);
  } finally {
    loadingLeaderboard.value = false;
  }
}

// เฝ้าติดตามการเปิด Dialog เมื่อผู้ใช้งานกดเปิด -> ให้ยิงดึงข้อมูลแบบ Real-time ทันที
watch(leaderboardDialogOpen, (isOpen) => {
  if (isOpen) {
    void loadLeaderboardData();
  }
});

function toggleMini() {
  miniState.value = !miniState.value;
}

function toggleDarkMode() {
  $q.dark.toggle();
  localStorage.setItem('darkMode', $q.dark.isActive ? 'true' : 'false');
}

function handleLogout() {
  const savedDarkMode = localStorage.getItem('darkMode');
  localStorage.clear();
  if (savedDarkMode !== null) {
    localStorage.setItem('darkMode', savedDarkMode);
  }
  $q.notify({
    type: 'positive',
    message: 'Logged out successfully',
    position: 'top',
    timeout: 1500,
  });
  setTimeout(() => {
    window.location.href = '/Login';
  }, 300);
}

onMounted(() => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  $q.dark.set(isDark);
  void userStore.fetchProfile();
  void missionsStore.fetchMissions();

  // โหลดพอร์ต/ข้อมูลของโหมดที่ค้างอยู่ใน localStorage หลังรีเฟรช
  void initializeActive().catch((error: unknown) => {
    console.error('Workspace initialize failed:', error);
  });
});
</script>

<style>
/* ==========================================================
   CSS Variables (ปรับให้ตรงกับหน้า Dashboard & Analytics 100%)
========================================================== */
.q-layout {
  --bg-header: #ffffff;
  --bg-drawer: #ffffff; /* พื้นหลัง Sidebar สีเดียวกับการ์ด */
  --bg-page: #f8fafc; /* พื้นหลังของหน้าจอ */
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --item-hover: #f1f5f9;

  background-color: var(--bg-page);
  transition: all 0.3s ease;
}

.body--dark .q-layout {
  --bg-header: #1e293b;
  --bg-drawer: #1e293b;
  --bg-page: #0f172a;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --item-hover: #334155;
}

/* ==========================================================
   Header Styles
========================================================== */
.custom-header {
  background-color: transparent !important;
  color: var(--text-main) !important;
  border-bottom: 1px solid var(--border-color) !important;
  height: 52px; /* ลดลงจาก 64px */
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.custom-header .q-toolbar {
  padding: 0 16px;
}
.menu-btn,
.theme-toggle-btn {
  color: var(--text-muted);
  transition: color 0.2s ease;
}

.menu-btn:hover,
.theme-toggle-btn:hover {
  color: var(--text-main);
  background-color: var(--item-hover);
}

/* ==========================================================
   Drawer (Sidebar) Styles
========================================================== */
.custom-drawer {
  background-color: var(--bg-drawer) !important;
  border-right: 1px solid var(--border-color) !important;
}
.q-drawer--mini .menu-btn {
  position: absolute;
  right: 6px;
}
/* ส่วนหัว Sidebar ที่สูงเท่ากับ Header เป๊ะๆ */
.drawer-header {
  height: 52px; /* ลดลงจาก 64px ให้เท่ากับ Header */
  border-bottom: 1px solid var(--border-color);
  background-color: transparent;
  padding-left: 12px; /* ลดระยะขอบซ้าย */
  padding-right: 4px;
}

.q-drawer--mini .drawer-header {
  justify-content: center !important;
}
.icon-box {
  background-color: rgba(59, 130, 246, 0.15);
  width: 34px;
  height: 34px;
  border-radius: 8px;
}

.page-container {
  background-color: var(--bg-page);
}

.custom-separator {
  background-color: var(--border-color);
  opacity: 0.8;
}

/* Typography Utilities */
.text-main {
  color: var(--text-main) !important;
}
.text-muted {
  color: var(--text-muted) !important;
}
.tracking-tight {
  letter-spacing: -0.02em;
}

/* ==========================================================
   Menu Items Customization
========================================================== */
.sidebar-list .q-item {
  border-radius: 10px !important;
  margin-bottom: 4px;
  min-height: 40px !important;
  padding: 8px 12px; /* ลด Padding ซ้าย-ขวาลง */
  font-size: 13px; /* ลดขนาด Font ลงเล็กน้อยจากมาตรฐาน */
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.sidebar-list .q-item:hover {
  background-color: var(--item-hover);
  color: var(--text-main);
}

.sidebar-list .q-item.q-router-link--exact-active {
  background-color: rgba(59, 130, 246, 0.12); /* สีฟ้าอ่อนๆ */
  color: var(--q-primary);
  font-weight: 700;
}

/* ==========================================================
   Account Button & Menu
========================================================== */
.account-btn {
  color: var(--text-muted);
  transition: color 0.2s ease;
}
.account-btn:hover {
  background-color: var(--item-hover);
}

.account-avatar {
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: #ffffff;
}

/* q-menu card */
.account-menu {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow:
    0 8px 30px -5px rgba(0, 0, 0, 0.12),
    0 2px 8px -2px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.body--dark .account-menu {
  background: #1a2540;
  border-color: #2a3a58;
  box-shadow: 0 8px 30px -5px rgba(0, 0, 0, 0.5);
}

.account-text-main {
  color: var(--text-main);
}
.account-text-muted {
  color: var(--text-muted);
}
.account-separator {
  background-color: var(--border-color);
}

/* List items inside menu */
.account-list {
  padding: 4px 6px;
}
.account-list-item {
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  min-height: 38px;
  padding: 0 10px;
  color: var(--q-negative);
  transition: background-color 0.15s ease;
}
.account-list-item:hover {
  background-color: rgba(239, 68, 68, 0.08) !important;
}

/* ==========================================================
   Sidebar Bottom Actions
========================================================== */
.sidebar-bottom {
  flex-shrink: 0;
}

.sidebar-bottom-item {
  border-radius: 10px !important;
  min-height: 40px !important;
  padding: 8px 12px;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.sidebar-bottom-item:hover {
  background-color: var(--item-hover);
  color: var(--text-main);
}

.sidebar-bottom-icon {
  min-width: 28px !important;
  padding-right: 0 !important;
}

.sidebar-bottom-label {
  font-size: 13px;
  font-weight: 500;
}

.bottom-icon-btn {
  color: var(--text-muted);
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}
.bottom-icon-btn:hover {
  color: var(--text-main);
  background-color: var(--item-hover);
}

/* mini-mode: centre the icon */
.q-drawer--mini .sidebar-bottom-item {
  justify-content: center;
  padding: 8px 0;
}

/* ==========================================================
   Broker & Leaderboard Dialog shared styles
========================================================== */
.broker-dialog {
  width: 380px;
  max-width: 94vw;
  border-radius: 20px !important;
  overflow: hidden;

  /* Light mode */
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow:
    0 20px 40px -8px rgba(15, 23, 42, 0.14),
    0 0 0 1px rgba(15, 23, 42, 0.05);
}

.body--dark .broker-dialog {
  background: #151e32;
  border-color: #23314b;
  box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.5);
}

/* Header */
.broker-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 22px 16px;
  border-bottom: 1px solid var(--border-color);
}

.broker-dialog-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.01em;
}

.broker-dialog-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.broker-close-btn {
  color: var(--text-muted);
  margin-top: -4px;
}

.broker-close-btn:hover {
  background-color: var(--item-hover) !important;
  color: var(--text-main);
}

/* List */
.broker-list {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Each item */
.broker-item,
.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 10px;
  border-radius: 14px;
  text-decoration: none;
  transition: background 0.18s ease;
  border: 1px solid transparent;
}

a.broker-item {
  cursor: pointer;
}

.broker-item:hover,
.leaderboard-item:hover {
  background: var(--item-hover);
  border-color: var(--border-color);
}

.body--dark .broker-item:hover,
.body--dark .leaderboard-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

/* ==========================================================
   Leaderboard Specific Styles
========================================================== */
.rank-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-card-soft, #f1f5f9);
  color: var(--text-muted);
  font-weight: 800;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
}

.body--dark .rank-badge {
  background: rgba(255, 255, 255, 0.05);
}

/* เหรียญทอง อันดับ 1 */
.rank-1 {
  background: linear-gradient(135deg, #fef08a 0%, #eab308 100%);
  color: #713f12 !important;
  box-shadow: 0 2px 8px rgba(234, 179, 8, 0.4);
}
/* เหรียญเงิน อันดับ 2 */
.rank-2 {
  background: linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%);
  color: #334155 !important;
  box-shadow: 0 2px 8px rgba(148, 163, 184, 0.4);
}
/* เหรียญทองแดง อันดับ 3 */
.rank-3 {
  background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
  color: #7c2d12 !important;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
}

/* Logo wrap — fixed square */
.broker-logo-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  position: relative;
}

.broker-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 6px;
}

/* Fallback text when img fails to load */
.broker-logo-fallback {
  position: absolute;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-main);
  display: none;
}

/* Show fallback only when img is hidden */
.broker-logo-wrap:has(img[style*='display: none']) .broker-logo-fallback {
  display: block;
}

/* Individual logo bg tints */
.broker-logo-xm {
  background: #f0f7ff;
}
.broker-logo-exness {
  background: #f0fff7;
}
.broker-logo-iux {
  background: #faf5ff;
}

.body--dark .broker-logo-xm {
  background: rgba(59, 130, 246, 0.12);
}
.body--dark .broker-logo-exness {
  background: rgba(34, 197, 94, 0.12);
}
.body--dark .broker-logo-iux {
  background: rgba(168, 85, 247, 0.12);
}

/* Info text */
.broker-info {
  flex: 1;
  min-width: 0;
}

.broker-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.01em;
}

.broker-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Arrow */
.broker-arrow {
  color: var(--text-muted);
  opacity: 0.5;
  flex-shrink: 0;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.broker-item:hover .broker-arrow {
  opacity: 1;
  transform: translateX(2px);
}

/* Footer note */
.broker-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 22px 18px;
  font-size: 10.5px;
  color: var(--text-muted);
  opacity: 0.7;
}
</style>
