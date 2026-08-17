import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  WORKSPACE_HOME_ROUTE,
  WORKSPACE_META,
  WORKSPACE_MESSAGES,
  WORKSPACE_NAV_LINKS,
  WORKSPACE_ORDER,
} from 'src/constants/workspace.constants';
import { useAnalyticsStore } from 'src/stores/AnalyticsStore';
import { useGoalStore } from 'src/stores/GoalStore';
import { useInvestorStore } from 'src/stores/InvestorStore';
import { usePortfolioStore } from 'src/stores/PortfolioStore';
import { useTraderStore } from 'src/stores/TraderStore';
import { useWatchlistStore } from 'src/stores/WatchlistStore';
import type { WorkspaceType } from 'src/types/workspace.types';

/**
 * ตัวควบคุมการสลับโหมด Forex (TRADER) <-> Stock (INVESTOR)
 *
 * โหมดที่ active คือ PortfolioStore.activeType ตัวเดียว (persist ลง localStorage แล้ว)
 * ที่นี่ไม่เก็บ state ซ้ำ — แค่ห่อให้เรียกใช้จาก component ได้สะดวก
 */
export function useWorkspace() {
  const portfolioStore = usePortfolioStore();
  const traderStore = useTraderStore();
  const investorStore = useInvestorStore();
  const analyticsStore = useAnalyticsStore();
  const goalStore = useGoalStore();
  const watchlistStore = useWatchlistStore();
  const router = useRouter();
  const route = useRoute();

  // สถานะทั้งสองอยู่ใน store ไม่ใช่ ref ท้องถิ่น — useWorkspace() ถูกเรียกหลายที่
  // (MainLayout ตอน boot กับปุ่ม WorkspaceSwitcher) ถ้าแยกกันจะกันการสลับซ้อนกันไม่ได้
  //
  // switching = สำหรับโชว์ busy บน UI (นับรวม boot ด้วย)
  // ส่วนตัวที่ใช้ "บล็อก" การสลับคือ isSwitchingWorkspace อย่างเดียว — ถ้าเอา boot มาบล็อกด้วย
  // การกดสลับระหว่างเปิดแอพจะเงียบหาย ซึ่งคือบั๊กที่กำลังแก้อยู่พอดี
  const switching = computed(
    () => portfolioStore.isSwitchingWorkspace || portfolioStore.isInitializingWorkspace,
  );
  const error = ref<string | null>(null);

  const activeType = computed<WorkspaceType>(() => portfolioStore.activeType);
  const meta = computed(() => WORKSPACE_META[activeType.value]);
  const navLinks = computed(() => WORKSPACE_NAV_LINKS[activeType.value]);

  const options = computed(() =>
    WORKSPACE_ORDER.map((type) => ({
      type,
      ...WORKSPACE_META[type],
      active: type === activeType.value,
    })),
  );

  /** โหมดถัดไปแบบวนลูป — ใช้กับปุ่มกดสลับไปมา */
  const nextType = computed<WorkspaceType>(() => {
    const index = WORKSPACE_ORDER.indexOf(activeType.value);
    return WORKSPACE_ORDER[(index + 1) % WORKSPACE_ORDER.length] as WorkspaceType;
  });

  function initializeWorkspace(type: WorkspaceType) {
    return type === 'TRADER' ? traderStore.initialize() : investorStore.initialize();
  }

  /**
   * ล้างข้อมูลของโหมดที่กำลังจะออก ก่อนโหลดโหมดใหม่
   *
   * ถ้าไม่ล้าง ข้อมูลจะค้างใน store แล้วโผล่ข้ามโหมด — เช่น JournalStore.trades ของ Forex
   * ยังอยู่ตอนสลับไป Stock เพราะ InvestorStore.initialize() ล้างแค่ store ฝั่งตัวเอง
   *
   * AnalyticsStore / GoalStore / WatchlistStore ไม่ได้เป็นของโหมดใดโหมดหนึ่ง แต่ผูกกับ
   * พอร์ตที่ active อยู่ เลยต้องล้างด้วยทุกครั้งที่สลับ ไม่งั้นจะเห็นข้อมูลพอร์ตเดิมค้างจอ
   */
  function clearWorkspace(type: WorkspaceType) {
    if (type === 'TRADER') {
      traderStore.reset();
    } else {
      investorStore.reset();
    }

    analyticsStore.clear();
    goalStore.clear();
    watchlistStore.clear();
  }

  /** หน้านี้เปิดได้ในโหมดที่ระบุหรือไม่ (ไม่มี meta.workspace = เปิดได้ทุกโหมด) */
  function canAccess(workspace: WorkspaceType | undefined, type = activeType.value) {
    return workspace === undefined || workspace === type;
  }

  async function switchTo(type: WorkspaceType) {
    // เช็คเฉพาะการสลับที่ผู้ใช้กด — boot ที่ค้างอยู่ต้องไม่บล็อก (generation token กันความปลอดภัยแล้ว)
    if (type === activeType.value || portfolioStore.isSwitchingWorkspace) {
      return false;
    }

    const previousType = activeType.value;

    portfolioStore.setSwitchingWorkspace(true);
    error.value = null;

    try {
      // ต้องล้างก่อน initialize เสมอ ไม่งั้น RecordStore ที่โหมดใหม่เพิ่งโหลดจะโดนล้างตาม
      // (reset() ในนี้ยังบวก generation ทำให้ initialize ของโหมดเดิมที่ค้างอยู่กลายเป็นล้าสมัย)
      clearWorkspace(previousType);

      // สลับโหมดทันทีตรงนี้ ไม่รอ initialize — เมนู sidebar กับ router guard จะได้เปลี่ยนตามเสมอ
      // แม้ initialize จะช้า ล้มเหลว หรือไปเจอรอบที่ค้างอยู่
      portfolioStore.setActiveType(type);

      await initializeWorkspace(type);

      // อยู่หน้าที่โหมดใหม่เข้าไม่ได้ -> เด้งกลับ Dashboard ซึ่งใช้ได้ทั้งสองโหมด
      if (!canAccess(route.meta.workspace, type)) {
        await router.push(WORKSPACE_HOME_ROUTE);
      }

      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : WORKSPACE_MESSAGES.switchFailed;
      throw e;
    } finally {
      portfolioStore.setSwitchingWorkspace(false);
    }
  }

  function toggle() {
    return switchTo(nextType.value);
  }

  /**
   * โหลดข้อมูลของโหมดที่ค้างอยู่ตอนเปิดแอพ/รีเฟรช
   *
   * ตั้งธง switching ด้วย เพื่อให้ปุ่มสลับรู้ว่ามี init ค้างอยู่และไม่ยิงซ้อนเข้ามา
   */
  async function initializeActive() {
    portfolioStore.setInitializingWorkspace(true);

    try {
      return await initializeWorkspace(activeType.value);
    } finally {
      portfolioStore.setInitializingWorkspace(false);
    }
  }

  return {
    activeType,
    meta,
    navLinks,
    options,
    nextType,
    switching,
    error: computed(() => error.value),
    isTrader: computed(() => activeType.value === 'TRADER'),
    isInvestor: computed(() => activeType.value === 'INVESTOR'),
    canAccess,
    switchTo,
    toggle,
    initializeActive,
  };
}
