<script setup lang="ts">
/**
 * โปรไฟล์สาธารณะ — พอร์ตมาจาก TradingJournal เดิม (pages/PublicProfilePage.vue)
 *
 * เฟสก่อนหน้าทำหน้านี้ไม่ได้เพราะ repo นี้ไม่มี endpoint — คอลัมน์ users.is_public_profile
 * กับ username @unique อยู่ใน schema มาตลอด แต่ users.controller มีแค่ me/updateMe/
 * removeAvatar รอบนี้เติม GET /users/profile/:username เข้าไปแล้ว หน้านี้จึงต่อของจริงได้
 *
 * สามสถานะก่อนถึงเนื้อหาต้องแยกกันให้ชัด (ตามต้นฉบับ): กำลังโหลด / ตั้งเป็นส่วนตัว (403) /
 * ไม่มีผู้ใช้นี้ (404) — ยุบรวมเป็น error ก้อนเดียวเมื่อไหร่ ผู้ใช้จะแยกไม่ออกว่า
 * "พิมพ์ชื่อผิด" กับ "เจ้าตัวปิดไว้" ต่างกันยังไง
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { useUserStore } from 'stores/UserStore';
import { userService, getUserErrorMessage } from 'src/services/user.service';
import { WsBadge, WsCard } from 'src/components/ui';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';
import type { PublicProfile } from 'src/types/user.types';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const languageStore = useLanguageStore();
const userStore = useUserStore();

type LoadState = 'loading' | 'ready' | 'private' | 'not-found' | 'error';

const state = ref<LoadState>('loading');
const profile = ref<PublicProfile | null>(null);
const errorMessage = ref('');
const savingPrivacy = ref(false);

const username = computed(() => String(route.params.username ?? ''));

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } }).response?.status;

const load = async () => {
  if (!username.value) {
    state.value = 'not-found';
    return;
  }

  state.value = 'loading';
  profile.value = null;

  try {
    profile.value = await userService.getPublicProfile(username.value);
    state.value = 'ready';
  } catch (error) {
    const status = statusOf(error);

    if (status === 404) {
      state.value = 'not-found';
      return;
    }

    if (status === 403) {
      state.value = 'private';
      return;
    }

    errorMessage.value = getUserErrorMessage(error, 'โหลดโปรไฟล์ไม่สำเร็จ');
    state.value = 'error';
  }
};

// เปลี่ยน :username ตรงๆ (เช่นกดจากลิสต์อันดับ) ต้องโหลดใหม่ ไม่ remount ทั้งหน้า
watch(username, load);

/**
 * สวิตช์เปิด/ปิดโปรไฟล์สาธารณะ — เฉพาะเจ้าของ
 *
 * ยิงผ่าน UserStore.updateProfile() ตัวเดิม (PATCH /users/me) เพื่อให้ profile ใน store
 * ถูก refetch ตามไปด้วย แล้วค่อยอัปเดตค่าบนหน้านี้จากผลจริงที่ได้กลับมา
 */
const togglePrivacy = async (value: boolean) => {
  if (!profile.value?.is_owner) return;

  savingPrivacy.value = true;

  try {
    await userStore.updateProfile({ is_public_profile: value });
    profile.value = { ...profile.value, is_public_profile: value };

    $q.notify({
      type: 'positive',
      position: 'top',
      message: value
        ? languageStore.isThai
          ? 'เปิดโปรไฟล์สาธารณะแล้ว'
          : 'Profile is now public'
        : languageStore.isThai
          ? 'ตั้งโปรไฟล์เป็นส่วนตัวแล้ว'
          : 'Profile is now private',
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: getUserErrorMessage(error, 'บันทึกการตั้งค่าไม่สำเร็จ'),
    });
  } finally {
    savingPrivacy.value = false;
  }
};

const goToAnalysis = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

const initials = computed(() => {
  const source = profile.value?.full_name || profile.value?.username || '?';

  return source.slice(0, 2).toUpperCase();
});

const memberSince = computed(() => {
  if (!profile.value?.member_since) return '';

  return new Date(profile.value.member_since).toLocaleDateString(
    languageStore.isThai ? 'th-TH' : 'en-GB',
    { month: 'short', year: 'numeric' },
  );
});

const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const stats = computed(() => {
  const data = profile.value;

  if (!data) return [];

  return [
    {
      key: 'assets',
      icon: 'account_balance_wallet',
      th: 'สินทรัพย์รวม',
      en: 'Total Assets',
      value: `$${money(data.total_asset_value)}`,
      tone: '',
    },
    {
      key: 'pnl',
      icon: data.total_pnl >= 0 ? 'trending_up' : 'trending_down',
      th: 'กำไร/ขาดทุนสะสม',
      en: 'Realised P&L',
      value: `${data.total_pnl >= 0 ? '+' : '-'}$${money(Math.abs(data.total_pnl))}`,
      tone: data.total_pnl >= 0 ? 'is-up' : 'is-down',
    },
    {
      key: 'portfolios',
      icon: 'folder',
      th: 'จำนวนพอร์ต',
      en: 'Portfolios',
      value: String(data.portfolio_count),
      tone: '',
    },
  ];
});

onMounted(load);
</script>

<template>
  <q-page class="profile-page q-pa-md q-pa-sm-lg">
    <!-- ── กำลังโหลด ── -->
    <div v-if="state === 'loading'" class="profile-state" data-test="profile-loading">
      <q-spinner-dots size="42px" color="primary" />
      <div class="profile-state-title q-mt-md">
        {{ languageStore.isThai ? 'กำลังโหลดโปรไฟล์…' : 'Loading profile…' }}
      </div>
    </div>

    <!-- ── ไม่มีผู้ใช้นี้ (404) ── -->
    <div v-else-if="state === 'not-found'" class="profile-state" data-test="profile-not-found">
      <q-icon name="person_off" size="48px" class="profile-state-icon" />
      <div class="profile-state-title">
        {{ languageStore.isThai ? 'ไม่พบผู้ใช้นี้' : 'User not found' }}
      </div>
      <div class="profile-state-sub">
        {{
          languageStore.isThai
            ? `ไม่มีบัญชีชื่อ "${username}" ในระบบ — ลองตรวจตัวสะกดอีกครั้ง`
            : `No account named “${username}” — double-check the spelling.`
        }}
      </div>
    </div>

    <!-- ── เจ้าตัวตั้งเป็นส่วนตัว (403) ── -->
    <div v-else-if="state === 'private'" class="profile-state" data-test="profile-private">
      <q-icon name="lock" size="48px" class="profile-state-icon" />
      <div class="profile-state-title">
        {{ languageStore.isThai ? 'โปรไฟล์นี้เป็นส่วนตัว' : 'This profile is private' }}
      </div>
      <div class="profile-state-sub">
        {{
          languageStore.isThai
            ? 'เจ้าของบัญชีเลือกไม่เปิดเผยข้อมูลพอร์ตต่อสาธารณะ'
            : 'This member has chosen not to share their portfolio publicly.'
        }}
      </div>
    </div>

    <!-- ── error อื่น ── -->
    <div v-else-if="state === 'error'" class="profile-state" data-test="profile-error">
      <q-icon name="error_outline" size="48px" class="profile-state-icon text-negative" />
      <div class="profile-state-title">
        {{ languageStore.isThai ? 'โหลดโปรไฟล์ไม่สำเร็จ' : 'Could not load this profile' }}
      </div>
      <div class="profile-state-sub">{{ errorMessage }}</div>
      <q-btn
        flat
        no-caps
        color="primary"
        icon="refresh"
        class="q-mt-sm text-weight-bold"
        data-test="profile-retry"
        :label="languageStore.isThai ? 'ลองใหม่' : 'Try again'"
        @click="load"
      />
    </div>

    <!-- ── เนื้อหาโปรไฟล์ ── -->
    <template v-else-if="profile">
      <div v-if="profile.is_owner" class="profile-owner-banner" data-test="profile-owner-banner">
        <q-icon name="visibility" size="17px" class="q-mr-xs" />
        {{
          languageStore.isThai
            ? 'นี่คือโปรไฟล์ของคุณเอง — คนอื่นจะเห็นหน้านี้เมื่อคุณเปิดเป็นสาธารณะ'
            : 'This is your own profile — others see this page when it is public.'
        }}
      </div>

      <WsCard class="profile-hero" data-test="profile-hero">
        <div class="profile-hero-body">
          <div class="profile-avatar">
            <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.username" />
            <span v-else>{{ initials }}</span>
          </div>

          <div class="profile-identity">
            <div class="profile-name">{{ profile.full_name }}</div>
            <div class="profile-username">@{{ profile.username }}</div>
            <p v-if="profile.bio" class="profile-bio">{{ profile.bio }}</p>

            <div class="profile-chips">
              <WsBadge
                v-if="profile.subscription_tier"
                kind="ai"
                color="warning"
                outline
                :value="profile.subscription_tier"
              />
              <span
                class="profile-visibility"
                :class="profile.is_public_profile ? 'is-public' : 'is-private'"
                data-test="profile-visibility"
              >
                <q-icon :name="profile.is_public_profile ? 'public' : 'lock'" size="12px" />
                {{
                  profile.is_public_profile
                    ? languageStore.isThai
                      ? 'สาธารณะ'
                      : 'Public'
                    : languageStore.isThai
                      ? 'ส่วนตัว'
                      : 'Private'
                }}
              </span>
              <span v-if="memberSince" class="profile-since">
                {{ languageStore.isThai ? 'สมาชิกตั้งแต่' : 'Member since' }} {{ memberSince }}
              </span>
              <span v-if="profile.current_streak > 0" class="profile-streak">
                <q-icon name="local_fire_department" size="13px" />{{ profile.current_streak }}
              </span>
            </div>
          </div>
        </div>
      </WsCard>

      <!-- การ์ดตั้งค่าความเป็นส่วนตัว — เฉพาะเจ้าของ -->
      <WsCard v-if="profile.is_owner" class="profile-privacy" data-test="profile-privacy">
        <div class="profile-privacy-row">
          <div>
            <div class="profile-privacy-title">
              {{ languageStore.isThai ? 'เปิดโปรไฟล์สาธารณะ' : 'Public profile' }}
            </div>
            <div class="profile-privacy-sub">
              {{
                languageStore.isThai
                  ? 'เปิดแล้วสมาชิกคนอื่นจะเห็นมูลค่าพอร์ตรวม กำไร/ขาดทุน และหุ้นที่ถืออยู่'
                  : 'When on, other members can see your total assets, P&L and current holdings.'
              }}
            </div>
          </div>
          <q-toggle
            :model-value="profile.is_public_profile"
            color="primary"
            :disable="savingPrivacy"
            data-test="profile-privacy-toggle"
            @update:model-value="togglePrivacy"
          />
        </div>
      </WsCard>

      <div class="profile-stats" data-test="profile-stats">
        <WsCard v-for="stat in stats" :key="stat.key" :data-test="`profile-stat-${stat.key}`">
          <div class="profile-stat">
            <q-icon :name="stat.icon" size="20px" class="profile-stat-icon" />
            <div class="profile-stat-label">
              {{ languageStore.isThai ? stat.th : stat.en }}
            </div>
            <div class="profile-stat-value" :class="stat.tone">{{ stat.value }}</div>
          </div>
        </WsCard>
      </div>

      <WsCard class="profile-holdings">
        <template #header>
          <div class="profile-holdings-head">
            <span>{{ languageStore.isThai ? 'หุ้นที่ถืออยู่' : 'Current holdings' }}</span>
            <span class="profile-holdings-count">{{ profile.held_stocks.length }}</span>
          </div>
        </template>

        <div
          v-if="profile.held_stocks.length === 0"
          class="profile-holdings-empty"
          data-test="profile-holdings-empty"
        >
          {{
            languageStore.isThai ? 'ยังไม่มีหุ้นที่ถืออยู่ในตอนนี้' : 'No open holdings right now.'
          }}
        </div>

        <div v-else class="profile-holdings-list" data-test="profile-holdings">
          <button
            v-for="symbol in profile.held_stocks"
            :key="symbol"
            type="button"
            class="profile-holding"
            :data-test="`profile-holding-${symbol}`"
            @click="goToAnalysis(symbol)"
          >
            <span
              class="profile-holding-avatar"
              :style="{ background: symbolAvatarColor(symbol) }"
              >{{ symbolAvatarInitials(symbol) }}</span
            >
            {{ symbol }}
          </button>
        </div>
      </WsCard>
    </template>
  </q-page>
</template>

<style scoped>
.profile-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;
  --positive: #178230;
  --negative: #c10015;

  --accent-100: #e7f4f2;
  --accent-500: #85b6b0;
  --accent-800: #336160;
  --accent-900: #1b3636;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  max-width: 900px;
  margin: 0 auto;
}

.body--dark .profile-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --positive: #4ade80;
  --negative: #f87171;
  --accent-100: rgba(133, 182, 176, 0.18);
}

/* ── สถานะก่อนถึงเนื้อหา (loading / 403 / 404 / error) ── */
.profile-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 16px;
  text-align: center;
  color: var(--text-muted);
}

.profile-state-icon {
  color: var(--text-muted);
  margin-bottom: 10px;
}

.profile-state-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--text-main);
}

.profile-state-sub {
  margin-top: 6px;
  font-size: 13px;
  max-width: 420px;
}

/* ── แบนเนอร์บอกว่าเป็นโปรไฟล์ตัวเอง ── */
.profile-owner-banner {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 12px;
  background: var(--accent-100);
  color: var(--accent-800);
}

.body--dark .profile-owner-banner {
  color: var(--text-main);
}

/* ── หัวโปรไฟล์ ── */
.profile-hero {
  margin-bottom: 16px;
}

.profile-hero-body {
  display: flex;
  align-items: center;
  gap: 18px;
}

.profile-avatar {
  width: 78px;
  height: 78px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-500), var(--accent-900));
  color: #fff;
  font-size: 26px;
  font-weight: 800;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-identity {
  min-width: 0;
}

.profile-name {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.profile-username {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 1px;
}

.profile-bio {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.profile-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.profile-visibility {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}

.profile-visibility.is-public {
  background: rgba(33, 186, 69, 0.14);
  color: var(--positive);
}

.profile-visibility.is-private {
  background: var(--bg-card-soft);
  color: var(--text-muted);
}

.profile-since,
.profile-streak {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

/* ── การ์ดตั้งค่าความเป็นส่วนตัว ── */
.profile-privacy {
  margin-bottom: 16px;
}

.profile-privacy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.profile-privacy-title {
  font-size: 14px;
  font-weight: 800;
}

.profile-privacy-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.5;
}

/* ── สถิติ ── */
.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

@media (max-width: 599px) {
  .profile-stats {
    grid-template-columns: 1fr;
  }
}

.profile-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile-stat-icon {
  color: var(--text-muted);
}

.profile-stat-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.profile-stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 19px;
  font-weight: 800;
}

.profile-stat-value.is-up {
  color: var(--positive);
}

.profile-stat-value.is-down {
  color: var(--negative);
}

/* ── หุ้นที่ถืออยู่ ── */
.profile-holdings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 800;
}

.profile-holdings-count {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-card-soft);
  color: var(--text-muted);
}

.profile-holdings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-holding {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12.5px;
  font-weight: 700;
  padding: 5px 12px 5px 6px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-soft);
  color: var(--text-main);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.profile-holding:hover {
  border-color: var(--accent-500);
  color: var(--accent-800);
}

.body--dark .profile-holding:hover {
  color: var(--accent-500);
}

/* ป้ายตัวย่อแทนโลโก้ — logo.clearbit.com โดน ad blocker บล็อกบ่อยจนเหลือช่องว่าง */
.profile-holding-avatar {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 9.5px;
  font-weight: 800;
}

.profile-holdings-empty {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
