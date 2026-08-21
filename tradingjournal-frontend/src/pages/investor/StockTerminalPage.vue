<script setup lang="ts">
/**
 * Stock Terminal — รวม /StockExplorer กับ /StockAnalysis เดิมไว้เป็นหน้าเดียว
 *
 * ซ้าย  = แถบสำรวจหุ้น (ค้นหา/ฟิลเตอร์/ตาราง) ย่อ-ขยายได้
 * ขวา   = เทอร์มินัลวิเคราะห์ตัวเดิมทั้งก้อน (metric strip + แท็บกราฟ/สรุป/การเงิน/สถิติ/ตลาด)
 *
 * คลิกแถวในตารางแล้วฝั่งขวาเปลี่ยนหุ้นทันทีโดยไม่ remount ทั้งหน้า — เพราะ /stock/:symbol
 * ชี้มาที่ route record เดียวกัน vue-router จึงแค่เปลี่ยน params ให้ ตัว watcher ของ
 * StockAnalysisPage ก็ยิงโหลดข้อมูลหุ้นตัวใหม่เอง
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLanguageStore } from 'stores/LanguageStore';
import StockExplorerRail from 'components/stocks/StockExplorerRail.vue';
import PopularStocksPanel from 'components/stocks/PopularStocksPanel.vue';
import StockAnalysisPage from './StockAnalysisPage.vue';

const route = useRoute();
const router = useRouter();
const languageStore = useLanguageStore();

const RAIL_STORAGE_KEY = 'wisenancial.stockTerminal.railCollapsed';
const RAIL_MODE_STORAGE_KEY = 'wisenancial.stockTerminal.railMode';

const railCollapsed = ref(false);

/**
 * โหมดของแผงซ้าย — สำรวจหุ้น / หุ้นไทยยอดนิยม / หุ้นสหรัฐยอดนิยม
 *
 * เดิมแผงซ้ายมีแต่ตัวสำรวจ ส่วน "หุ้นยอดนิยม" ไปกองอยู่ในแท็บ Market ของฝั่งขวา
 * (StockAnalysisPage) ซึ่งอยู่คนละที่กับตอนที่คนกำลังจะ "เลือกหุ้น" — ย้ายมารวมกัน
 * ที่แผงเลือกหุ้นแผงเดียว แล้วให้ปุ่มสามตัวบนหัวแผงเป็นตัวสลับ
 */
const RAIL_MODES = ['EXPLORE', 'TH', 'US'] as const;
type RailMode = (typeof RAIL_MODES)[number];

const railMode = ref<RailMode>('EXPLORE');

const modeButtons = computed(() => [
  {
    value: 'EXPLORE' as RailMode,
    icon: 'travel_explore',
    label: languageStore.isThai ? 'สำรวจหุ้น' : 'Explore',
  },
  {
    value: 'TH' as RailMode,
    icon: 'flag',
    label: languageStore.isThai ? 'หุ้นไทย' : 'Thai',
  },
  {
    value: 'US' as RailMode,
    icon: 'public',
    label: languageStore.isThai ? 'หุ้นสหรัฐ' : 'US',
  },
]);

const setRailMode = (mode: RailMode) => {
  railMode.value = mode;

  // กดปุ่มโหมดตอนแผงย่ออยู่ = ตั้งใจจะดูของในแผง — กางให้เลย ไม่ต้องกดสองที
  if (railCollapsed.value) railCollapsed.value = false;
};

/** symbol จาก URL เป็นแหล่งความจริงเดียว — deep link /stock/:symbol จึงทำงานเหมือนเดิม */
const activeSymbol = computed<string | null>(() => {
  const raw = route.params.symbol;
  const symbol = Array.isArray(raw) ? raw[0] : raw;

  return symbol ? String(symbol).toUpperCase() : null;
});

const selectSymbol = (symbol: string) => {
  const next = symbol.toUpperCase();

  if (next === activeSymbol.value) return;

  void router.push(`/stock/${next}`);
};

/**
 * เข้าหน้านี้แบบไม่มี symbol (/Stocks หรือมาจากลิงก์เก่า) — หยิบหุ้นตัวแรกในตาราง
 * ให้อัตโนมัติ ใช้ replace ไม่ใช่ push เพื่อไม่ให้ปุ่ม back ของเบราว์เซอร์ค้างอยู่ที่หน้าว่าง
 */
const onRailLoaded = (symbols: string[]) => {
  if (activeSymbol.value || symbols.length === 0) return;

  void router.replace(`/stock/${symbols[0]!.toUpperCase()}`);
};

const toggleRail = () => {
  railCollapsed.value = !railCollapsed.value;
};

watch(railCollapsed, (collapsed) => {
  localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? '1' : '0');
});

watch(railMode, (mode) => {
  localStorage.setItem(RAIL_MODE_STORAGE_KEY, mode);
});

onMounted(() => {
  railCollapsed.value = localStorage.getItem(RAIL_STORAGE_KEY) === '1';

  // เช็คว่าค่าที่เก็บไว้ยังเป็นโหมดที่มีอยู่จริง — ถ้าเคยลบโหมดออกในอนาคต
  // ค่าที่ค้างใน localStorage ของเครื่องผู้ใช้จะได้ไม่ทำให้แผงว่างเปล่า
  const saved = localStorage.getItem(RAIL_MODE_STORAGE_KEY);
  if (saved && (RAIL_MODES as readonly string[]).includes(saved)) {
    railMode.value = saved as RailMode;
  }
});
</script>

<template>
  <q-page class="stock-terminal-page" data-test="stock-terminal-page">
    <aside
      class="terminal-rail"
      :class="{ 'terminal-rail--collapsed': railCollapsed }"
      data-test="terminal-rail"
    >
      <div class="rail-head">
        <!-- แถบปุ่มสามโหมด — ย่อแผงแล้วเหลือแต่ไอคอนเรียงลง เพื่อให้ยังสลับโหมดได้
             โดยไม่ต้องกางแผงก่อน (กดแล้วมันกางให้เองผ่าน setRailMode) -->
        <div
          v-if="!railCollapsed"
          class="rail-modes"
          role="tablist"
          data-test="rail-mode-bar"
        >
          <button
            v-for="mode in modeButtons"
            :key="mode.value"
            type="button"
            role="tab"
            class="rail-mode"
            :class="{ 'rail-mode--active': railMode === mode.value }"
            :aria-selected="railMode === mode.value"
            :data-test="`rail-mode-${mode.value}`"
            @click="setRailMode(mode.value)"
          >
            <q-icon :name="mode.icon" size="15px" />
            <span>{{ mode.label }}</span>
          </button>
        </div>
        <q-btn
          flat
          dense
          round
          size="sm"
          :icon="railCollapsed ? 'chevron_right' : 'chevron_left'"
          data-test="rail-toggle"
          :aria-label="
            railCollapsed
              ? languageStore.isThai
                ? 'ขยายแถบสำรวจหุ้น'
                : 'Expand explorer'
              : languageStore.isThai
                ? 'ย่อแถบสำรวจหุ้น'
                : 'Collapse explorer'
          "
          @click="toggleRail"
        >
          <q-tooltip>
            {{
              railCollapsed
                ? languageStore.isThai
                  ? 'ขยายแถบสำรวจหุ้น'
                  : 'Expand explorer'
                : languageStore.isThai
                  ? 'ย่อแถบสำรวจหุ้น'
                  : 'Collapse explorer'
            }}
          </q-tooltip>
        </q-btn>
      </div>

      <!-- v-show ไม่ใช่ v-if: ย่อแล้วขยายกลับต้องไม่ต้องโหลดตารางใหม่ทั้งชุด
           และสลับโหมดไป-มาต้องไม่ทำให้ตัวสำรวจลืมหน้า/ตัวกรองที่ตั้งไว้ -->
      <StockExplorerRail
        v-show="!railCollapsed && railMode === 'EXPLORE'"
        :selected-symbol="activeSymbol"
        @select="selectSymbol"
        @loaded="onRailLoaded"
      />

      <!-- ตรงกันข้ามกับตัวสำรวจ: สองแผงนี้ใช้ v-if เพราะข้อมูลเป็นราคาสด
           กลับมาดูอีกทีควรได้ราคาใหม่ ไม่ใช่ราคาค้างจากเมื่อสิบนาทีที่แล้ว -->
      <PopularStocksPanel
        v-if="!railCollapsed && railMode !== 'EXPLORE'"
        :key="railMode"
        :market="railMode"
        :selected-symbol="activeSymbol"
        @select="selectSymbol"
      />
    </aside>

    <section class="terminal-body" data-test="terminal-body">
      <StockAnalysisPage v-if="activeSymbol" @browse-all="railCollapsed = false" />

      <div v-else class="terminal-empty" data-test="terminal-empty">
        <q-icon name="query_stats" size="48px" />
        <p class="terminal-empty__title">
          {{ languageStore.isThai ? 'ยังไม่ได้เลือกหุ้น' : 'No stock selected' }}
        </p>
        <p class="terminal-empty__hint">
          {{
            languageStore.isThai
              ? 'เลือกหุ้นจากตารางด้านซ้ายเพื่อดูกราฟและบทวิเคราะห์'
              : 'Pick a stock from the table on the left to see its chart and analysis.'
          }}
        </p>
        <q-btn
          v-if="railCollapsed"
          flat
          no-caps
          color="primary"
          :label="languageStore.isThai ? 'เปิดแถบสำรวจหุ้น' : 'Open explorer'"
          @click="toggleRail"
        />
      </div>
    </section>
  </q-page>
</template>

<style scoped lang="scss">
.stock-terminal-page {
  display: flex;
  align-items: stretch;
  min-height: 100vh;
  /* เดิมไม่ได้ระบุพื้นหลัง ทำให้ตอนยังไม่เลือกหุ้นเห็นพื้นของ layout ทะลุมา
     คนละโทนกับตอนเลือกแล้ว (ซึ่ง StockAnalysisPage ทาพื้นของตัวเอง) */
  background: var(--bg-page);
}

.terminal-rail {
  display: flex;
  flex-direction: column;
  /* 290px ตามแบบ — เดิม 320px กว้างกว่าที่ mockup วางไว้ */
  flex: 0 0 290px;
  width: 290px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: flex-basis 0.2s ease, width 0.2s ease;
  overflow: hidden;
}

.terminal-rail--collapsed {
  flex-basis: 44px;
  width: 44px;
}

.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 6px 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  min-height: 44px;
}

/* ==========================================================
   แถบปุ่มสามโหมดบนหัวแผงซ้าย (สำรวจหุ้น / หุ้นไทย / หุ้นสหรัฐ)
   ทรง segmented control: กล่องเดียวพื้นจาง ปุ่มที่เลือกเป็นการ์ดยกขึ้นมา
========================================================== */
.rail-modes {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex: 1;
  min-width: 0;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.rail-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 5px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.rail-mode:hover:not(.rail-mode--active) {
  color: var(--text-primary);
}

.rail-mode--active {
  background: var(--bg-card);
  color: var(--accent-800);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(15, 42, 40, 0.12);
}

.body--dark .rail-mode--active {
  color: var(--accent-400);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

/* แผงแคบมาก ป้ายกำกับจะเบียดกันจนอ่านไม่ออก — เหลือแต่ไอคอน
   (ยังมี aria-selected + tooltip ของปุ่มย่อ/ขยายให้บริบทอยู่) */
@media (max-width: 1180px) {
  .rail-mode span {
    display: none;
  }
}

.terminal-body {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
}

.terminal-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 60vh;
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.terminal-empty__title {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.terminal-empty__hint {
  margin: 0;
  font-size: 13px;
  max-width: 320px;
  color: var(--text-secondary);
}

/* จอแคบ: แถบสำรวจไปอยู่ด้านบนแทนการเบียดกราฟจนใช้ไม่ได้ */
@media (max-width: 1023px) {
  .stock-terminal-page {
    flex-direction: column;
  }

  .terminal-rail {
    flex: 0 0 auto;
    width: 100%;
    max-height: 60vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .terminal-rail--collapsed {
    flex-basis: auto;
    width: 100%;
    max-height: 44px;
  }
}
</style>
