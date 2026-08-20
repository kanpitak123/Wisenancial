<script setup lang="ts">
/**
 * Leaderboard & Missions — พอร์ตมาจาก TradingJournal เดิม (pages/LeaderboardPage.vue)
 *
 * ไม่ได้สร้าง endpoint ใหม่เลย ทุกอย่างมีอยู่แล้วในโปรเจกต์นี้:
 *   GET  /gamification            -> store.fetchOverview()   (แต้ม/streak/อันดับ/ภารกิจ)
 *   GET  /gamification/leaderboard-> store.fetchLeaderboard()
 *   POST /gamification/missions/:id/claim -> store.claimMission()
 *   POST /gamification/redeem     -> store.redeemTokens()
 * ที่ขาดคือ "หน้า" ที่เรียกใช้ — GamificationStore/service/composable ถูกใช้แค่ใน
 * MissionDialog (ป๊อปอัปย่อจาก MainLayout) ส่วน fetchLeaderboard/redeemTokens ไม่มีใครเรียกเลย
 *
 * หน้านี้เป็น shared ทั้งสองโหมด — ภารกิจถูกกรองตาม portfolio_type ให้แล้วใน
 * GamificationStore.resolveQuery() ส่วนกระดานอันดับเป็นของทั้งระบบ ไม่แยกโหมด
 */
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useLanguageStore } from 'stores/LanguageStore';
import { useGamificationStore } from 'stores/GamificationStore';
import { useUserStore } from 'stores/UserStore';
import { WsBadge, WsCard } from 'src/components/ui';
import type { Mission, MissionZone } from 'src/types/gamification.types';

const $q = useQuasar();
const router = useRouter();
const languageStore = useLanguageStore();
const store = useGamificationStore();
const userStore = useUserStore();

const activeTab = ref<'leaderboard' | 'missions'>('leaderboard');
const claimingId = ref<number | null>(null);
const redeeming = ref(false);
const hallOfFame = ref<HTMLElement | null>(null);

interface ZoneConfig {
  key: MissionZone;
  icon: string;
  color: string;
  th: string;
  en: string;
}

const ZONE_CONFIG: readonly ZoneConfig[] = [
  { key: 'DAILY', icon: 'today', color: 'primary', th: 'ภารกิจรายวัน', en: 'Daily Missions' },
  {
    key: 'MONTHLY',
    icon: 'calendar_month',
    color: 'secondary',
    th: 'ภารกิจรายเดือน',
    en: 'Monthly Missions',
  },
  { key: 'INVITE', icon: 'group_add', color: 'accent', th: 'เชิญเพื่อน', en: 'Invite Friends' },
  {
    key: 'ACHIEVEMENT',
    icon: 'emoji_events',
    color: 'amber',
    th: 'ความสำเร็จ',
    en: 'Achievements',
  },
] as const;

/**
 * ภารกิจ zone แปลกๆ ที่ backend เพิ่มมาใหม่ต้องไม่หายไปจากหน้าเงียบๆ — โยนเข้า
 * ACHIEVEMENT เป็นถังรวมเหมือนของเดิม
 */
const groupedMissions = computed(() => {
  const grouped: Record<MissionZone, Mission[]> = {
    DAILY: [],
    MONTHLY: [],
    INVITE: [],
    ACHIEVEMENT: [],
  };

  for (const mission of store.missions) {
    (grouped[mission.zone] ?? grouped.ACHIEVEMENT).push(mission);
  }

  return grouped;
});

const zones = computed(() =>
  ZONE_CONFIG.map((zone) => {
    const missions = groupedMissions.value[zone.key];

    return {
      ...zone,
      missions,
      total: missions.length,
      // นับทั้ง COMPLETED และ CLAIMED — ทำเสร็จแล้วก็คือเสร็จ ไม่ว่าจะกดรับรางวัลหรือยัง
      done: missions.filter((m) => m.status === 'COMPLETED' || m.status === 'CLAIMED').length,
    };
  }).filter((zone) => zone.total > 0),
);

const currentUserId = computed(() => userStore.profile?.id ?? null);

const goToProfile = (username: string) => {
  void router.push(`/profile/${encodeURIComponent(username)}`);
};

const podium = computed(() => store.leaderboard.slice(0, 3));
const rest = computed(() => store.leaderboard.slice(3));

const RANK_TONE = ['gold', 'silver', 'bronze'] as const;

const rankTone = (rank: number) => RANK_TONE[rank - 1] ?? '';

const progressRatio = (mission: Mission) =>
  mission.target_count > 0 ? Math.min(mission.progress / mission.target_count, 1) : 0;

/** แต้มแลกเป็นโทเคน AI ได้กี่โทเคน — ปัดลง เพราะแลกครึ่งโทเคนไม่ได้ */
const redeemableTokens = computed(() =>
  store.pointsPerToken > 0 ? Math.floor(store.pointsBalance / store.pointsPerToken) : 0,
);

const load = async () => {
  // overview พาภารกิจมาด้วยอยู่แล้ว จึงไม่ต้องยิง fetchMissions ซ้ำ
  await Promise.all([
    store.fetchOverview().catch(() => undefined),
    store.fetchLeaderboard().catch(() => undefined),
  ]);
};

const claim = async (mission: Mission) => {
  claimingId.value = mission.id;

  try {
    const result = await store.claimMission(mission.id);

    $q.notify({
      type: 'positive',
      position: 'top',
      message: languageStore.isThai
        ? `รับรางวัลแล้ว +${result.points_received} แต้ม`
        : `Claimed +${result.points_received} points`,
    });
  } catch {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: store.error ?? (languageStore.isThai ? 'รับรางวัลไม่สำเร็จ' : 'Could not claim'),
    });
  } finally {
    claimingId.value = null;
  }
};

const redeem = async () => {
  if (redeemableTokens.value < 1) return;

  redeeming.value = true;

  try {
    const result = await store.redeemTokens(redeemableTokens.value);

    $q.notify({
      type: 'positive',
      position: 'top',
      message: languageStore.isThai
        ? `แลกสำเร็จ ได้ ${result.received_tokens} เครดิต AI`
        : `Redeemed ${result.received_tokens} AI credits`,
    });
  } catch {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: store.error ?? (languageStore.isThai ? 'แลกแต้มไม่สำเร็จ' : 'Could not redeem'),
    });
  } finally {
    redeeming.value = false;
  }
};

/**
 * บันทึกกระดานเกียรติยศเป็นรูป — ของเดิมมีปุ่มแชร์ไป IG/Facebook แต่ส่วนที่ทำจริง
 * คือ "แปลง DOM เป็นรูป" เท่านั้น (ไม่มี API ของแพลตฟอร์มเข้ามาเกี่ยว) ที่นี่จึงทำ
 * แค่ดาวน์โหลดรูป แล้วปล่อยให้ผู้ใช้เอาไปโพสต์เอง — ไม่ต้องพึ่ง endpoint ใหม่
 *
 * import แบบ dynamic เพื่อไม่ให้ html2canvas ถูกโหลดตอนเปิดหน้า (ใช้จริงแค่ตอนกดปุ่ม)
 */
const savingImage = ref(false);

const saveHallOfFame = async () => {
  if (!hallOfFame.value) return;

  savingImage.value = true;

  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(hallOfFame.value, { backgroundColor: null, scale: 2 });

    const link = document.createElement('a');
    link.download = 'wisenancial-hall-of-fame.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    $q.notify({
      type: 'negative',
      position: 'top',
      message: languageStore.isThai ? 'บันทึกรูปไม่สำเร็จ' : 'Could not save the image',
    });
  } finally {
    savingImage.value = false;
  }
};

onMounted(load);
</script>

<template>
  <q-page class="leaderboard-page q-pa-md q-pa-sm-lg">
    <header class="lb-header">
      <div>
        <WsBadge kind="ai" color="warning" value="REWARDS" outline class="q-mb-sm" />
        <h1 class="lb-title">
          {{ languageStore.isThai ? 'กระดานอันดับและภารกิจ' : 'Leaderboard & Missions' }}
        </h1>
        <p class="lb-subtitle">
          {{
            languageStore.isThai
              ? 'สะสมแต้มจากภารกิจ ไต่อันดับ แล้วแลกเป็นเครดิต AI'
              : 'Earn points from missions, climb the ranks, redeem for AI credits.'
          }}
        </p>
      </div>

      <div class="lb-stats">
        <div class="lb-stat" data-test="lb-stat-rank">
          <span class="lb-stat-label">{{ languageStore.isThai ? 'อันดับ' : 'Rank' }}</span>
          <span class="lb-stat-value">{{
            store.userRank === null ? '—' : `#${store.userRank}`
          }}</span>
        </div>
        <div class="lb-stat" data-test="lb-stat-points">
          <span class="lb-stat-label">{{ languageStore.isThai ? 'แต้ม' : 'Points' }}</span>
          <span class="lb-stat-value">{{ store.pointsBalance }}</span>
        </div>
        <div class="lb-stat" data-test="lb-stat-streak">
          <span class="lb-stat-label">{{ languageStore.isThai ? 'ต่อเนื่อง' : 'Streak' }}</span>
          <span class="lb-stat-value">
            <q-icon name="local_fire_department" size="15px" />{{ store.currentStreak }}
          </span>
        </div>
      </div>
    </header>

    <q-tabs
      v-model="activeTab"
      dense
      no-caps
      align="left"
      active-color="primary"
      indicator-color="primary"
      class="lb-tabs q-mb-md"
    >
      <q-tab name="leaderboard" icon="emoji_events" data-test="lb-tab-leaderboard">
        {{ languageStore.isThai ? 'กระดานอันดับ' : 'Leaderboard' }}
      </q-tab>
      <q-tab name="missions" icon="military_tech" data-test="lb-tab-missions">
        {{ languageStore.isThai ? 'ภารกิจ' : 'Missions' }}
        <span v-if="store.claimableMissions.length" class="lb-tab-dot" />
      </q-tab>
    </q-tabs>

    <!-- ══════════════ กระดานอันดับ ══════════════ -->
    <div v-show="activeTab === 'leaderboard'" data-test="lb-panel-leaderboard">
      <div v-if="store.isLoading && store.leaderboard.length === 0" class="lb-skeleton-list">
        <div v-for="n in 5" :key="n" class="lb-skeleton-row" />
      </div>

      <div v-else-if="store.leaderboard.length === 0" class="lb-empty" data-test="lb-empty">
        <q-icon name="emoji_events" size="40px" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-bolder">
          {{ languageStore.isThai ? 'ยังไม่มีใครบนกระดาน' : 'Nobody on the board yet' }}
        </div>
        <div class="text-body2 q-mt-xs">
          {{
            languageStore.isThai
              ? 'ทำภารกิจให้สำเร็จเพื่อเป็นคนแรกที่ติดอันดับ'
              : 'Complete a mission to be the first one ranked.'
          }}
        </div>
      </div>

      <template v-else>
        <div ref="hallOfFame" class="lb-hof" data-test="lb-hall-of-fame">
          <div class="lb-hof-head">
            <q-icon name="emoji_events" size="26px" class="lb-hof-trophy" />
            <div>
              <div class="lb-hof-title">
                {{ languageStore.isThai ? 'สุดยอดนักลงทุน' : 'Hall of Fame' }}
              </div>
              <div class="lb-hof-sub">
                {{ languageStore.isThai ? 'สามอันดับแรกของระบบ' : 'Top three overall' }}
              </div>
            </div>
          </div>

          <div class="lb-podium">
            <div
              v-for="entry in podium"
              :key="entry.id"
              class="lb-podium-card"
              :class="[rankTone(entry.rank), { 'is-me': entry.id === currentUserId }]"
              :data-test="`lb-podium-${entry.rank}`"
              @click="goToProfile(entry.username)"
            >
              <q-icon name="emoji_events" size="22px" class="lb-podium-icon" />
              <div class="lb-podium-rank">#{{ entry.rank }}</div>
              <div class="lb-podium-name">{{ entry.full_name || entry.username }}</div>
              <div class="lb-podium-points">{{ entry.points_balance }}</div>
              <div class="lb-podium-unit">
                {{ languageStore.isThai ? 'แต้ม' : 'points' }}
              </div>
            </div>
          </div>
        </div>

        <div class="lb-hof-actions">
          <q-btn
            flat
            dense
            no-caps
            icon="image"
            class="text-weight-bold"
            data-test="lb-save-image"
            :loading="savingImage"
            :label="languageStore.isThai ? 'บันทึกเป็นรูป' : 'Save as image'"
            @click="saveHallOfFame"
          />
        </div>

        <WsCard v-if="rest.length" class="lb-list-card">
          <template #header>
            <div class="lb-list-head">
              {{ languageStore.isThai ? 'อันดับถัดไป' : 'Standings' }}
            </div>
          </template>

          <ul class="lb-list">
            <li
              v-for="entry in rest"
              :key="entry.id"
              class="lb-row"
              :class="{ 'is-me': entry.id === currentUserId }"
              :data-test="`lb-row-${entry.rank}`"
              @click="goToProfile(entry.username)"
            >
              <span class="lb-row-rank">{{ entry.rank }}</span>
              <div class="lb-row-id">
                <span class="lb-row-name">{{ entry.full_name || entry.username }}</span>
                <span class="lb-row-username">@{{ entry.username }}</span>
              </div>
              <span class="lb-row-streak">
                <q-icon name="local_fire_department" size="12px" />{{ entry.current_streak }}
              </span>
              <span class="lb-row-points">{{ entry.points_balance }}</span>
            </li>
          </ul>
        </WsCard>
      </template>
    </div>

    <!-- ══════════════ ภารกิจ ══════════════ -->
    <div v-show="activeTab === 'missions'" data-test="lb-panel-missions">
      <div class="lb-redeem" data-test="lb-redeem">
        <div class="lb-redeem-copy">
          <div class="lb-redeem-title">
            {{ languageStore.isThai ? 'แลกแต้มเป็นเครดิต AI' : 'Redeem points for AI credits' }}
          </div>
          <div class="lb-redeem-sub">
            {{ store.pointsPerToken }}
            {{ languageStore.isThai ? 'แต้ม = 1 เครดิต' : 'points = 1 credit' }} ·
            {{ languageStore.isThai ? 'แลกได้ตอนนี้' : 'available now' }}
            {{ redeemableTokens }}
          </div>
        </div>
        <q-btn
          unelevated
          no-caps
          icon="swap_horiz"
          class="lb-redeem-btn text-white text-weight-bold"
          data-test="lb-redeem-btn"
          :disable="redeemableTokens < 1 || store.isSubmitting"
          :loading="redeeming"
          :label="languageStore.isThai ? 'แลกทั้งหมด' : 'Redeem all'"
          @click="redeem"
        />
      </div>

      <div v-if="store.isLoading && store.missions.length === 0" class="lb-skeleton-list">
        <div v-for="n in 4" :key="n" class="lb-skeleton-row" />
      </div>

      <div v-else-if="zones.length === 0" class="lb-empty" data-test="lb-missions-empty">
        <q-icon name="military_tech" size="40px" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-bolder">
          {{ languageStore.isThai ? 'ยังไม่มีภารกิจในโหมดนี้' : 'No missions for this mode' }}
        </div>
        <div class="text-body2 q-mt-xs">
          {{
            languageStore.isThai
              ? 'ลองสลับโหมดพอร์ต หรือกลับมาใหม่พรุ่งนี้'
              : 'Try switching portfolio mode, or check back tomorrow.'
          }}
        </div>
      </div>

      <div v-else class="lb-zones">
        <section
          v-for="zone in zones"
          :key="zone.key"
          class="lb-zone"
          :data-test="`lb-zone-${zone.key}`"
        >
          <div class="lb-zone-head">
            <q-icon :name="zone.icon" :color="zone.color" size="20px" />
            <span class="lb-zone-title">{{ languageStore.isThai ? zone.th : zone.en }}</span>
            <span class="lb-zone-count">{{ zone.done }}/{{ zone.total }}</span>
          </div>

          <div class="lb-mission-grid">
            <WsCard
              v-for="mission in zone.missions"
              :key="mission.id"
              class="lb-mission"
              :data-test="`lb-mission-${mission.id}`"
            >
              <div class="lb-mission-head">
                <div class="lb-mission-copy">
                  <div class="lb-mission-title">{{ mission.title }}</div>
                  <div v-if="mission.description" class="lb-mission-desc">
                    {{ mission.description }}
                  </div>
                </div>
                <span class="lb-mission-points">+{{ mission.points }}</span>
              </div>

              <q-linear-progress
                :value="progressRatio(mission)"
                size="8px"
                rounded
                color="primary"
                class="q-mt-sm"
              />
              <div class="lb-mission-progress">
                {{ mission.progress }} / {{ mission.target_count }}
              </div>

              <div class="lb-mission-actions">
                <q-btn
                  v-if="mission.status === 'CLAIMED'"
                  flat
                  dense
                  no-caps
                  disable
                  icon="check_circle"
                  class="lb-mission-btn text-weight-bold"
                  :data-test="`lb-claimed-${mission.id}`"
                  :label="languageStore.isThai ? 'รับรางวัลแล้ว' : 'Claimed'"
                />
                <q-btn
                  v-else-if="mission.can_claim"
                  unelevated
                  dense
                  no-caps
                  icon="redeem"
                  class="lb-mission-btn lb-mission-btn--claim text-white text-weight-bold"
                  :data-test="`lb-claim-${mission.id}`"
                  :loading="claimingId === mission.id"
                  :disable="store.isSubmitting"
                  :label="languageStore.isThai ? 'รับรางวัล' : 'Claim reward'"
                  @click="claim(mission)"
                />
                <span v-else class="lb-mission-pending">
                  {{ languageStore.isThai ? 'กำลังทำ' : 'In progress' }}
                </span>
              </div>
            </WsCard>
          </div>
        </section>
      </div>
    </div>
  </q-page>
</template>

<style scoped>
.leaderboard-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;

  --accent-100: #e7f4f2;
  --accent-500: #85b6b0;
  --accent-800: #336160;
  --accent-900: #1b3636;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .leaderboard-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --accent-100: rgba(133, 182, 176, 0.18);
}

.lb-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

.lb-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}

.lb-subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.lb-stats {
  display: flex;
  gap: 10px;
}

.lb-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 78px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.lb-stat-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.lb-stat-value {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 17px;
  font-weight: 800;
}

.lb-tabs {
  border-bottom: 1px solid var(--border-color);
}

/* จุดแดงบอกว่ามีภารกิจรอกดรับรางวัลอยู่ — ไม่ต้องเข้าไปดูเองทุกครั้ง */
.lb-tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c10015;
  margin-left: 6px;
}

/* ── Hall of Fame ── */
.lb-hof {
  padding: 20px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: linear-gradient(135deg, var(--accent-100), var(--bg-card));
}

.lb-hof-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.lb-hof-trophy {
  color: #d29c1f;
}

.lb-hof-title {
  font-size: 16px;
  font-weight: 800;
}

.lb-hof-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.lb-podium {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 599px) {
  .lb-podium {
    grid-template-columns: 1fr;
  }
}

.lb-podium-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 16px 12px;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--border-color);
  text-align: center;
}

.lb-podium-card.gold {
  border-top-color: #d29c1f;
}
.lb-podium-card.silver {
  border-top-color: #9aa5a5;
}
.lb-podium-card.bronze {
  border-top-color: #b06c3b;
}

.lb-podium-card.is-me {
  box-shadow: 0 0 0 2px var(--accent-500);
}

.lb-podium-icon {
  color: var(--text-muted);
}

.lb-podium-card.gold .lb-podium-icon {
  color: #d29c1f;
}
.lb-podium-card.silver .lb-podium-icon {
  color: #9aa5a5;
}
.lb-podium-card.bronze .lb-podium-icon {
  color: #b06c3b;
}

.lb-podium-rank {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
}

.lb-podium-name {
  font-size: 13.5px;
  font-weight: 700;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-podium-points {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 800;
  margin-top: 4px;
}

.lb-podium-unit {
  font-size: 10.5px;
  color: var(--text-muted);
}

.lb-hof-actions {
  display: flex;
  justify-content: flex-end;
  margin: 10px 0 16px;
}

/* ── Standings list ── */
.lb-list-head {
  font-size: 14px;
  font-weight: 800;
}

.lb-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 4px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.lb-row:hover {
  background: var(--bg-card-soft);
}

.lb-row:last-child {
  border-bottom: none;
}

.lb-row.is-me {
  background: var(--accent-100);
  border-radius: 10px;
  padding-left: 10px;
  padding-right: 10px;
}

.lb-row-rank {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text-muted);
  min-width: 26px;
}

.lb-row-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.lb-row-name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-row-username {
  font-size: 11px;
  color: var(--text-muted);
}

.lb-row-streak {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.lb-row-points {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 800;
  min-width: 56px;
  text-align: right;
}

/* ── Redeem ── */
.lb-redeem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 18px;
  border-radius: 14px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.lb-redeem-title {
  font-size: 14px;
  font-weight: 800;
}

.lb-redeem-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.lb-redeem-btn {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  border-radius: 10px;
  padding: 0 16px;
  height: 38px;
}

/* ── Missions ── */
.lb-zones {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.lb-zone-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.lb-zone-title {
  font-size: 14.5px;
  font-weight: 800;
}

.lb-zone-count {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-card-soft);
  color: var(--text-muted);
}

.lb-mission-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}

.lb-mission-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.lb-mission-copy {
  min-width: 0;
}

.lb-mission-title {
  font-size: 14px;
  font-weight: 700;
}

.lb-mission-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.5;
}

.lb-mission-points {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 800;
  color: #d29c1f;
  flex-shrink: 0;
}

.lb-mission-progress {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
}

.lb-mission-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  min-height: 40px;
}

.lb-mission-btn {
  border-radius: 9px;
  padding: 0 14px;
}

.lb-mission-btn--claim {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
}

.lb-mission-pending {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

/* ── shared states ── */
.lb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}

.lb-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lb-skeleton-row {
  height: 62px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    var(--bg-card-soft) 25%,
    var(--border-color) 50%,
    var(--bg-card-soft) 75%
  );
  background-size: 200% 100%;
  animation: lb-shimmer 1.4s ease-in-out infinite;
}

@keyframes lb-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
