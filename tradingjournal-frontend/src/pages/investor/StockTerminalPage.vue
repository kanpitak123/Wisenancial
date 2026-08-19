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
import StockAnalysisPage from './StockAnalysisPage.vue';

const route = useRoute();
const router = useRouter();
const languageStore = useLanguageStore();

const RAIL_STORAGE_KEY = 'wisenancial.stockTerminal.railCollapsed';

const railCollapsed = ref(false);

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

onMounted(() => {
  railCollapsed.value = localStorage.getItem(RAIL_STORAGE_KEY) === '1';
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
        <span v-if="!railCollapsed" class="rail-title">
          {{ languageStore.isThai ? 'สำรวจหุ้น' : 'Explorer' }}
        </span>
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

      <!-- v-show ไม่ใช่ v-if: ย่อแล้วขยายกลับต้องไม่ต้องโหลดตารางใหม่ทั้งชุด -->
      <StockExplorerRail
        v-show="!railCollapsed"
        :selected-symbol="activeSymbol"
        @select="selectSymbol"
        @loaded="onRailLoaded"
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

.rail-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
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
