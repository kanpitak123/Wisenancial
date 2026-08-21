<template>
  <nav class="bottom-nav" data-test="bottom-nav" :aria-label="'Main navigation'">
    <div class="bottom-nav-dock">
      <!-- แถบหลัก — เลื่อนซ้ายขวาได้ถ้าจอแคบจนใส่ไม่ครบ ปุ่ม More จะปักอยู่นอกแถบนี้เสมอ
           จะได้ไม่มีทางที่ผู้ใช้เลื่อนจนหาเมนูที่เหลือไม่เจอ -->
      <div class="bottom-nav-track" data-test="bottom-nav-track">
        <template v-for="link in primaryLinks" :key="link.title">
          <button
            v-if="link.paid && !userStore.isPaidUser"
            type="button"
            class="bottom-nav-item bottom-nav-item--locked"
            data-test="bottom-nav-item"
            :data-locked="'true'"
            @click="goUpgrade"
          >
            <span class="bottom-nav-icon-wrap">
              <q-icon :name="link.icon" size="21px" />
              <q-icon name="lock" size="11px" class="bottom-nav-lock" />
            </span>
            <span class="bottom-nav-label">{{ link.title }}</span>
            <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9 text-white">
              {{ upgradeHint }}
            </q-tooltip>
          </button>

          <router-link
            v-else
            :to="link.link"
            class="bottom-nav-item"
            data-test="bottom-nav-item"
            active-class="bottom-nav-item--active"
          >
            <span class="bottom-nav-icon-wrap">
              <q-icon :name="link.icon" size="21px" />
            </span>
            <span class="bottom-nav-label">{{ link.title }}</span>
          </router-link>
        </template>
      </div>

      <div class="bottom-nav-divider" />

      <button
        type="button"
        class="bottom-nav-item bottom-nav-more"
        data-test="bottom-nav-more"
        :class="{ 'bottom-nav-item--active': moreOpen }"
      >
        <span class="bottom-nav-icon-wrap">
          <q-icon name="more_horiz" size="21px" />
        </span>
        <span class="bottom-nav-label">More</span>

        <q-menu
          v-model="moreOpen"
          anchor="top middle"
          self="bottom middle"
          :offset="[0, 14]"
          class="bottom-nav-sheet"
        >
          <div class="bottom-nav-sheet-inner" data-test="bottom-nav-sheet">
            <div class="bottom-nav-sheet-title">{{ workspaceMeta.label }} · All pages</div>

            <div class="bottom-nav-grid">
              <template v-for="link in overflowLinks" :key="link.title">
                <button
                  v-if="link.paid && !userStore.isPaidUser"
                  type="button"
                  class="bottom-nav-grid-item bottom-nav-grid-item--locked"
                  data-test="bottom-nav-sheet-item"
                  :data-locked="'true'"
                  @click="goUpgrade"
                >
                  <span class="bottom-nav-icon-wrap">
                    <q-icon :name="link.icon" size="20px" />
                    <q-icon name="lock" size="11px" class="bottom-nav-lock" />
                  </span>
                  <span class="bottom-nav-grid-label">{{ link.title }}</span>
                </button>

                <router-link
                  v-else
                  :to="link.link"
                  class="bottom-nav-grid-item"
                  data-test="bottom-nav-sheet-item"
                  active-class="bottom-nav-grid-item--active"
                  @click="moreOpen = false"
                >
                  <span class="bottom-nav-icon-wrap">
                    <q-icon :name="link.icon" size="20px" />
                  </span>
                  <span class="bottom-nav-grid-label">{{ link.title }}</span>
                </router-link>
              </template>
            </div>

            <q-separator class="bottom-nav-sheet-sep" />

            <!-- สองอันนี้เป็น dialog ไม่ใช่หน้า — เดิมอยู่เป็นปุ่มไอคอนก้น sidebar
                 ย้ายมาไว้ท้ายชีตนี้ เพราะเป็นที่เดียวที่เหลือที่ยังกดถึงได้ -->
            <div class="bottom-nav-grid">
              <button
                type="button"
                class="bottom-nav-grid-item"
                data-test="bottom-nav-leaderboard"
                @click="emitDialog('leaderboard')"
              >
                <span class="bottom-nav-icon-wrap">
                  <q-icon name="leaderboard" size="20px" />
                </span>
                <span class="bottom-nav-grid-label">Global Leaderboard</span>
              </button>

              <button
                type="button"
                class="bottom-nav-grid-item"
                data-test="bottom-nav-missions"
                @click="emitDialog('missions')"
              >
                <span class="bottom-nav-icon-wrap">
                  <q-icon name="military_tech" size="20px" />
                </span>
                <span class="bottom-nav-grid-label">Missions</span>
              </button>
            </div>
          </div>
        </q-menu>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
/**
 * แถบเมนูลอยด้านล่าง — แทน q-drawer ซ้ายเดิมทั้งหมด
 *
 * ทำไมถึงเป็น "หลัก + More" ไม่ใช่เลื่อนซ้ายขวาอย่างเดียว:
 * เมนูมี 13-15 รายการต่อโหมด ถ้าเอาไปกองใน track ที่เลื่อนได้อย่างเดียว รายการที่ 7
 * เป็นต้นไปจะมองไม่เห็นจนกว่าจะเลื่อนเจอ ซึ่งแย่กว่าเดิมสำหรับ "การหาเมนู" — dock
 * จึงโชว์ตัวที่เข้าบ่อย 6 ตัว (WorkspaceNavLink.primary) แล้วยัดที่เหลือลงชีต More
 * ที่เห็นครบในหน้าจอเดียว ส่วน track ยังเลื่อนได้ไว้เผื่อจอแคบมากจน 6 ตัวไม่พอดี
 *
 * เมนูมาจาก WORKSPACE_NAV_LINKS ชุดเดิมที่ sidebar เคยใช้ ไม่ได้ก๊อปรายการมาไว้ที่นี่
 * สลับโหมดแล้วจึงเปลี่ยนตามเองเหมือนเดิม
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkspace } from 'src/composables/useWorkspace';
import { useUserStore } from 'stores/UserStore';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';
import { useLanguageStore } from 'stores/LanguageStore';

const emit = defineEmits<{
  (e: 'open-leaderboard'): void;
  (e: 'open-missions'): void;
}>();

const router = useRouter();
const userStore = useUserStore();
const languageStore = useLanguageStore();
const { navLinks, meta: workspaceMeta } = useWorkspace();

const moreOpen = ref(false);

const primaryLinks = computed(() => navLinks.value.filter((link) => link.primary));
const overflowLinks = computed(() => navLinks.value.filter((link) => !link.primary));

const upgradeHint = computed(() =>
  languageStore.isThai ? 'ต้องอัปเกรดแพ็กเกจก่อน' : 'Upgrade to unlock',
);

function goUpgrade() {
  moreOpen.value = false;
  void router.push(UPGRADE_ROUTE);
}

function emitDialog(which: 'leaderboard' | 'missions') {
  moreOpen.value = false;
  // แยกสองบรรทัด ไม่ใช่ ternary ใน emit() — overload ของ defineEmits รับได้ทีละ literal
  // ส่ง union เข้าไปตรงๆ จะไม่ตรงกับ overload ไหนเลย
  if (which === 'leaderboard') emit('open-leaderboard');
  else emit('open-missions');
}
</script>

<style scoped>
/* ==========================================================
   Floating dock
   ปักกลางจอแนวนอนด้วย left:50% + translateX(-50%) แทน left/right:0
   เพราะตัว dock ต้องกว้างเท่าเนื้อหา (pill) ไม่ใช่เต็มความกว้างจอ
========================================================== */
.bottom-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 18px;
  z-index: 2000;
  max-width: calc(100vw - 24px);
  pointer-events: none;
}

.bottom-nav-dock {
  pointer-events: auto;
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 6px;
  border-radius: 20px;
  background: var(--bg-dock, rgba(255, 255, 255, 0.92));
  border: 1px solid var(--border-color);
  /* เงาสองชั้น: ชั้นฟุ้งไกลให้ความรู้สึกลอย + ชั้นใกล้ให้ขอบคม */
  box-shadow:
    0 12px 34px -8px rgba(15, 42, 40, 0.26),
    0 2px 8px -2px rgba(15, 42, 40, 0.12);
  backdrop-filter: blur(14px) saturate(1.4);
  max-width: 100%;
}

.body--dark .bottom-nav-dock {
  box-shadow:
    0 12px 34px -8px rgba(0, 0, 0, 0.6),
    0 2px 8px -2px rgba(0, 0, 0, 0.4);
}

.bottom-nav-track {
  display: flex;
  align-items: stretch;
  gap: 2px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.bottom-nav-track::-webkit-scrollbar {
  display: none;
}

.bottom-nav-divider {
  width: 1px;
  margin: 6px 4px;
  background: var(--border-color);
  flex: 0 0 auto;
}

/* ==========================================================
   Dock item
========================================================== */
.bottom-nav-item {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 62px;
  padding: 7px 10px 6px;
  border: 0;
  border-radius: 15px;
  background: transparent;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.bottom-nav-item:hover {
  background-color: var(--item-hover);
  color: var(--text-main);
}

/* ไล่สี accent ชุดเดียวกับที่ sidebar เดิมใช้กับรายการที่ active
   (และเป็นชุดเดียวกับ .account-avatar ใน MainLayout) */
.bottom-nav-item--active {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  color: #ffffff;
  font-weight: 700;
}
.bottom-nav-item--active:hover {
  color: #ffffff;
}

.bottom-nav-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.bottom-nav-label {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.1;
  white-space: nowrap;
  max-width: 74px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================
   Locked (free tier)
========================================================== */
.bottom-nav-item--locked,
.bottom-nav-grid-item--locked {
  opacity: 0.45;
}
.bottom-nav-item--locked:hover,
.bottom-nav-grid-item--locked:hover {
  opacity: 0.62;
}

.bottom-nav-lock {
  position: absolute;
  right: -6px;
  bottom: -3px;
  color: var(--text-muted);
}

/* ==========================================================
   "More" sheet
========================================================== */
.bottom-nav-sheet-inner {
  padding: 12px;
  min-width: 268px;
  max-width: min(420px, calc(100vw - 32px));
}

.bottom-nav-sheet-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0 4px 8px;
}

.bottom-nav-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.bottom-nav-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  padding: 11px 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.bottom-nav-grid-item:hover {
  background-color: var(--item-hover);
  color: var(--text-main);
}

.bottom-nav-grid-item--active {
  /* ในชีตใช้ accent แบบโปร่ง ไม่ใช่ไล่สีทึบเหมือนบน dock — ปุ่มในกริดอยู่ชิดกัน
     ถ้าใช้สีทึบจะเด่นจนแย่งสายตาไปจากที่ผู้ใช้กำลังจะเลือก */
  background-color: rgba(133, 182, 176, 0.18);
  color: var(--q-primary);
  font-weight: 700;
}

.bottom-nav-grid-label {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.bottom-nav-sheet-sep {
  margin: 8px 0;
  background-color: var(--border-color);
}

/* ==========================================================
   จอแคบ — บีบปุ่มลงแต่ยังโชว์ป้ายกำกับอยู่ ไม่ตัดเหลือแต่ไอคอน
   เพราะไอคอนล้วนทำให้ทายเมนูผิดง่ายกว่ามาก
========================================================== */
@media (max-width: 599px) {
  .bottom-nav {
    bottom: 12px;
    max-width: calc(100vw - 16px);
  }
  .bottom-nav-item {
    min-width: 54px;
    padding: 6px 7px 5px;
  }
  .bottom-nav-label {
    font-size: 9px;
    max-width: 58px;
  }
  .bottom-nav-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<style>
/* q-menu ถูก teleport ออกไปนอก component — สไตล์ตัวการ์ดจึงอยู่ใน scoped ไม่ได้
   (เนื้อในการ์ดยังใช้ scoped ได้ปกติ เพราะ render จาก component นี้) */
.bottom-nav-sheet {
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow:
    0 14px 38px -10px rgba(15, 42, 40, 0.3),
    0 2px 8px -2px rgba(15, 42, 40, 0.12);
}
.body--dark .bottom-nav-sheet {
  box-shadow: 0 14px 38px -10px rgba(0, 0, 0, 0.65);
}
</style>
