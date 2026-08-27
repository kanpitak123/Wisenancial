<script setup lang="ts">
/**
 * Stock Terminal — รวม /StockExplorer กับ /StockAnalysis เดิมไว้เป็นหน้าเดียว
 *
 * เดิมหน้านี้เป็นสองเสา (แถบสำรวจหุ้นซ้าย + เทอร์มินัลขวา) ตอนนี้แถบซ้ายถูกถอดออก
 * ทั้งหมด — การเลือกหุ้นทุกทาง (สำรวจหุ้น / หุ้นไทย / หุ้นสหรัฐ) ย้ายไปรวมอยู่ที่การ์ด
 * "หุ้นยอดนิยม" ใต้กราฟในแท็บกราฟ ซึ่งเป็นที่เดียวกับที่คนกำลังดูราคาอยู่แล้ว
 * ผลพลอยได้คือกราฟได้ความกว้างเต็มหน้าจอคืนมา
 *
 * /stock/:symbol ยังเป็น deep link หลักเหมือนเดิม การคลิกเลือกหุ้นเปลี่ยนแค่ params
 * ไม่ remount ทั้งหน้า — watcher ของ StockAnalysisPage ยิงโหลดหุ้นตัวใหม่เอง
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLanguageStore } from 'stores/LanguageStore';
import { stocksService } from 'src/services/stocks.service';
import StockAnalysisPage from './StockAnalysisPage.vue';

const route = useRoute();
const router = useRouter();
const languageStore = useLanguageStore();

/** symbol จาก URL เป็นแหล่งความจริงเดียว — deep link /stock/:symbol จึงทำงานเหมือนเดิม */
const activeSymbol = computed<string | null>(() => {
  const raw = route.params.symbol;
  const symbol = Array.isArray(raw) ? raw[0] : raw;

  return symbol ? String(symbol).toUpperCase() : null;
});

const resolvingDefault = ref(false);

/**
 * เข้าหน้านี้แบบไม่มี symbol (/Stocks หรือมาจากลิงก์เก่า) — หยิบหุ้นตัวแรกของ listing
 * มาให้อัตโนมัติ
 *
 * เดิมงานนี้เป็นของแถบสำรวจซ้าย (event `loaded`) พอแถบถูกถอดออกก็ไม่มีใครทำให้แล้ว
 * ถ้าไม่ยิงเอง หน้าจะค้างที่ empty state ตลอด เพราะการ์ดเลือกหุ้นอยู่ข้างใน
 * StockAnalysisPage ซึ่ง render ต่อเมื่อมี symbol แล้วเท่านั้น
 *
 * ใช้ replace ไม่ใช่ push เพื่อไม่ให้ปุ่ม back ของเบราว์เซอร์ค้างอยู่ที่หน้าว่าง
 */
async function resolveDefaultSymbol() {
  if (activeSymbol.value) return;

  resolvingDefault.value = true;

  try {
    const { rows } = await stocksService.list({ page: 1, pageSize: 1 });
    const first = rows[0]?.symbol;

    // เช็ค activeSymbol ซ้ำหลัง await — ผู้ใช้อาจกดลิงก์หุ้นไปแล้วระหว่างที่รอ
    if (first && !activeSymbol.value) {
      await router.replace(`/stock/${first.toUpperCase()}`);
    }
  } catch (error) {
    // ปล่อยให้ตกไปที่ empty state ที่มีปุ่มลองใหม่ ดีกว่าค้างสปินเนอร์ไว้เฉยๆ
    console.error('Could not resolve a default symbol:', error);
  } finally {
    resolvingDefault.value = false;
  }
}

onMounted(() => {
  void resolveDefaultSymbol();
});
</script>

<template>
  <q-page class="stock-terminal-page" data-test="stock-terminal-page">
    <section class="terminal-body" data-test="terminal-body">
      <StockAnalysisPage v-if="activeSymbol" />

      <div v-else-if="resolvingDefault" class="terminal-empty" data-test="terminal-resolving">
        <q-spinner-dots size="40px" color="primary" />
      </div>

      <div v-else class="terminal-empty" data-test="terminal-empty">
        <q-icon name="query_stats" size="48px" />
        <p class="terminal-empty__title">
          {{ languageStore.isThai ? 'ยังไม่ได้เลือกหุ้น' : 'No stock selected' }}
        </p>
        <p class="terminal-empty__hint">
          {{
            languageStore.isThai
              ? 'เลือกหุ้นจากการ์ดหุ้นยอดนิยมใต้กราฟ เพื่อดูกราฟและบทวิเคราะห์'
              : 'Pick a stock from the popular stocks card below the chart to see its analysis.'
          }}
        </p>
        <q-btn
          flat
          no-caps
          color="primary"
          data-test="terminal-retry"
          :label="languageStore.isThai ? 'ลองใหม่' : 'Try again'"
          @click="resolveDefaultSymbol"
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

/* ไม่มีแถบซ้ายมาเบียดแล้ว — เทอร์มินัลกินเต็มความกว้างหน้า */
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
  gap: 8px;
  min-height: 60vh;
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
}

.terminal-empty__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.terminal-empty__hint {
  margin: 0;
  max-width: 320px;
  font-size: 12.5px;
  line-height: 1.5;
}
</style>
