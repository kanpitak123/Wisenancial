<template>
  <q-layout view="lHh Lpr lFf">
    <q-header class="custom-header" bordered>
      <q-toolbar style="height: 100%">
        <!-- โลโก้ + ป้ายโหมด ย้ายขึ้นมาจากหัว drawer เดิมที่ถูกถอดออกไปแล้ว
             เป็นจุดเดียวที่เหลือที่มองเห็นได้ทุกหน้าโดยไม่ต้องกดอะไรก่อน -->
        <router-link to="/Dashboard" class="brand-block" data-test="brand-home">
          <div class="icon-box flex flex-center">
            <img :src="wisenancialLogo" alt="Wisenancial" class="brand-logo-mark" />
          </div>
          <div class="brand-copy">
            <div class="text-subtitle1 text-weight-bolder text-main tracking-tight lh-1">
              Wisenancial
            </div>
            <div class="text-caption text-weight-bold workspace-tag">
              <q-icon :name="workspaceMeta.icon" size="12px" class="q-mr-xs" />
              {{ workspaceMeta.label }}
            </div>
          </div>
        </router-link>

        <q-toolbar-title class="text-weight-bolder tracking-tight" />

        <MockModeToggle class="q-mr-sm" />

        <WorkspaceSwitcher class="q-mr-sm" />

        <GlobalDateFilter class="q-mr-sm" />

        <AiQuotaBadge class="q-mr-sm" />

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
                v-close-popup
                clickable
                v-ripple
                to="/Settings"
                class="account-list-item"
                data-test="account-menu-settings"
              >
                <q-item-section avatar style="min-width: 32px">
                  <q-icon name="settings" size="18px" />
                </q-item-section>
                <q-item-section>Settings</q-item-section>
              </q-item>
              <q-item
                clickable
                v-ripple
                class="account-list-item text-negative"
                data-test="account-menu-logout"
                @click="handleLogout"
              >
                <q-item-section>Sign out</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- q-page-container กินเต็มความกว้างจอแล้ว (ไม่มี drawer มาเบียดซ้ายอีก)
         padding-bottom กันไม่ให้ dock ลอยไปทับปุ่มท้ายฟอร์มยาวๆ อย่างหน้า Record
         ค่าคำนวณจากความสูง dock (~58px) + ระยะลอย (18px) + หายใจอีกหน่อย -->
    <q-page-container class="page-container">
      <router-view />
    </q-page-container>

    <BottomNavBar
      @open-leaderboard="leaderboardDialogOpen = true"
      @open-missions="missionsDialogOpen = true"
    />

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
import wisenancialLogo from 'assets/wisenancial-logo-transparent.png';
import BottomNavBar from 'components/BottomNavBar.vue';
import AiQuotaBadge from 'components/AiQuotaBadge.vue';
import WorkspaceSwitcher from 'components/WorkspaceSwitcher.vue';
import MockModeToggle from 'components/MockModeToggle.vue';
import { useWorkspace } from 'src/composables/useWorkspace';
import { tradeService } from 'src/services/trade.service';
import type { LeaderboardUser } from 'src/types/trade.types';
import { useUserStore } from 'stores/UserStore';
import { useAuthStore } from 'stores/AuthStore';
import { useGamificationStore } from 'stores/GamificationStore';
import GlobalDateFilter from 'components/GlobalDateFilter.vue';
import MissionDialog from 'components/MissionDialog.vue';
import CommandPalette from 'components/CommandPalette.vue';
import PrivacyMode from 'components/PrivacyMode.vue';
import { useKeyboardShortcuts } from 'src/composables/useKeyboardShortcuts';

useKeyboardShortcuts();

const $q = useQuasar();
const userStore = useUserStore();
const authStore = useAuthStore();
const missionsStore = useGamificationStore();
const missionsDialogOpen = ref(false);

// เมนูย้ายไปอยู่บน BottomNavBar แล้ว (มันเรียก useWorkspace เองเพื่ออ่าน navLinks)
// ที่นี่เหลือใช้แค่ meta สำหรับป้ายโหมดบนหัวเว็บ กับ initializeActive ตอน boot
const { meta: workspaceMeta, initializeActive, activeType: workspaceType } = useWorkspace();

// ภารกิจถูกกรองตามโหมด (audience) เลยต้องดึงใหม่ทุกครั้งที่สลับ ไม่งั้นค้างของโหมดเดิม
watch(workspaceType, () => {
  void missionsStore.fetchMissions();
});

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

function toggleDarkMode() {
  $q.dark.toggle();
  localStorage.setItem('darkMode', $q.dark.isActive ? 'true' : 'false');
}

let loggingOut = false;

async function handleLogout() {
  if (loggingOut) return;
  loggingOut = true;

  // ยิง POST /auth/logout ให้ backend revoke refresh token + สั่งลบ cookie ก่อน
  // authStore.logout() ไม่ throw — ถ้ายิงไม่ถึง (ออฟไลน์/backend ล่ม/timeout) ก็ล้าง session ในเครื่องต่อได้เลย
  await authStore.logout();

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
  /* พื้น dock ล่าง — โปร่งเล็กน้อยเพราะตัว dock เปิด backdrop-filter blur ไว้
     ถ้าทึบ 100% จะไม่เห็นเนื้อหาเบลอๆ ไหลผ่านใต้แถบ แล้วดูเหมือนแถบตันธรรมดา */
  --bg-dock: rgba(255, 255, 255, 0.92);
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
  --bg-dock: rgba(30, 41, 59, 0.92);
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
.theme-toggle-btn {
  color: var(--text-muted);
  transition: color 0.2s ease;
}

.theme-toggle-btn:hover {
  color: var(--text-main);
  background-color: var(--item-hover);
}

/* ==========================================================
   Brand block (หัวเว็บ) — ย้ายมาจากหัว drawer เดิม
========================================================== */
.brand-block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  margin-right: 4px;
  border-radius: 10px;
  text-decoration: none;
  transition: background-color 0.2s ease;
}
.brand-block:hover {
  background-color: var(--item-hover);
}

/* จอแคบเหลือแค่โลโก้ — ชื่อกับป้ายโหมดตัดออกก่อน เพราะโลโก้คือทางกลับหน้าแรก */
@media (max-width: 599px) {
  .brand-copy {
    display: none;
  }
}

.icon-box {
  width: 34px;
  height: 34px;
  border-radius: 8px;
}
.brand-logo-mark {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.page-container {
  background-color: var(--bg-page);
  /* ไม่มี drawer มาเบียดซ้ายแล้ว — ล้าง padding-left ที่ Quasar ใส่ไว้ตอนมี drawer
     เผื่อกันค่าค้างหลัง layout คำนวณใหม่ไม่ทัน */
  padding-left: 0 !important;
  width: 100%;
}

/* เนื้อหาหน้าต้องมีที่ว่างก้นหน้าเสมอ ไม่งั้น dock ที่ลอยอยู่จะทับปุ่มท้ายฟอร์ม
   (เช่นปุ่มบันทึกของหน้า Record) — 58px คือความสูง dock, 18px คือระยะลอยจากขอบจอ */
.page-container > .q-page,
.page-container > * > .q-page {
  padding-bottom: 92px;
}
@media (max-width: 599px) {
  .page-container > .q-page,
  .page-container > * > .q-page {
    padding-bottom: 84px;
  }
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
.lh-1 {
  line-height: 1.15;
}

/* ป้ายโหมดปัจจุบัน (Forex / Stock) ใต้ชื่อแอพในหัว drawer */
.workspace-tag {
  display: flex;
  align-items: center;
  line-height: 1.1;
  margin-top: 2px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: linear-gradient(90deg, var(--accent-500) 0%, var(--accent-900) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.workspace-tag .q-icon {
  -webkit-text-fill-color: var(--accent-700);
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
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
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
