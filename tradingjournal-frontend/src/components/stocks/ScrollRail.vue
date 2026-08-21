<template>
  <div class="scroll-rail" data-test="scroll-rail">
    <button
      type="button"
      class="scroll-rail__nav scroll-rail__nav--prev"
      data-test="scroll-rail-prev"
      :disabled="atStart"
      :aria-label="'Scroll left'"
      @click="scrollBy(-1)"
    >
      <q-icon name="chevron_left" size="22px" />
    </button>

    <div ref="track" class="scroll-rail__track" data-test="scroll-rail-track" @scroll="syncEdges">
      <slot />
    </div>

    <button
      type="button"
      class="scroll-rail__nav scroll-rail__nav--next"
      data-test="scroll-rail-next"
      :disabled="atEnd"
      :aria-label="'Scroll right'"
      @click="scrollBy(1)"
    >
      <q-icon name="chevron_right" size="22px" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * รางเลื่อนแนวนอน (แบบ Netflix) — การ์ดไม่ตัดขึ้นบรรทัดใหม่ ปัดหรือกดปุ่มซ้าย/ขวาเอา
 *
 * ปุ่มจะถูก disable เมื่อสุดทางแล้วจริงๆ ไม่ใช่ซ่อนไปเฉยๆ ผู้ใช้จะได้รู้ว่ารางมีแค่นี้
 * ไม่ใช่ปุ่มเสีย ส่วน "สุดทาง" เผื่อ 1px ไว้เพราะเบราว์เซอร์ปัดเศษ scrollLeft เป็น
 * ทศนิยม (เช่น 249.6 vs 250) แล้วปุ่มจะค้างเปิดอยู่ทั้งที่เลื่อนต่อไม่ได้แล้ว
 */
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** เปลี่ยนค่านี้เมื่อรายการในรางเปลี่ยน เพื่อให้คำนวณสถานะปุ่มใหม่ */
    itemCount?: number;
  }>(),
  { itemCount: 0 },
);

const track = useTemplateRef<HTMLElement>('track');
const atStart = ref(true);
const atEnd = ref(true);

const EDGE_TOLERANCE = 1;

function syncEdges() {
  const el = track.value;
  if (!el) return;

  atStart.value = el.scrollLeft <= EDGE_TOLERANCE;
  // scrollWidth เท่ากับ clientWidth เมื่อการ์ดใส่ได้พอดีอยู่แล้ว -> ปิดปุ่มทั้งสองข้าง
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_TOLERANCE;
}

/**
 * เลื่อนทีละ "เกือบเต็มหน้าจอราง" (85%) ไม่ใช่เต็ม 100% — เหลือการ์ดสุดท้ายค้างไว้
 * ให้เห็นขอบ ผู้ใช้จะได้ไม่หลุดบริบทว่ากำลังดูอยู่ตรงไหนของราง
 */
function scrollBy(direction: 1 | -1) {
  const el = track.value;
  if (!el) return;

  el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
}

let observer: ResizeObserver | null = null;

onMounted(() => {
  syncEdges();

  // ย่อ/ขยายหน้าต่างแล้วการ์ดอาจใส่ได้พอดีจนไม่ต้องเลื่อน — ปุ่มต้องอัปเดตตาม
  if (typeof ResizeObserver !== 'undefined' && track.value) {
    observer = new ResizeObserver(() => syncEdges());
    observer.observe(track.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

watch(
  () => props.itemCount,
  () => {
    void nextTick(syncEdges);
  },
);

defineExpose({ syncEdges });
</script>

<style scoped>
.scroll-rail {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.scroll-rail__track {
  display: flex;
  flex-wrap: nowrap;
  gap: 16px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scroll-snap-type: x proximity;
  /* ซ่อน scrollbar แต่ยังเลื่อนด้วยการปัด/เทรกแพดได้ตามปกติ */
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* เผื่อที่ให้เงา/เส้นขอบบนของการ์ดไม่โดนตัด */
  padding: 4px 2px 6px;
  flex: 1;
  min-width: 0;
}

.scroll-rail__track::-webkit-scrollbar {
  display: none;
}

.scroll-rail__track > * {
  scroll-snap-align: start;
}

.scroll-rail__nav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.scroll-rail__nav:hover:not(:disabled) {
  background: var(--bg-card-soft);
  color: var(--text-primary);
}

/* สุดทางแล้ว — จางลงและกดไม่ได้ แต่ยังอยู่ในเลย์เอาต์ ไม่ให้รางกระตุกตอนปุ่มหาย */
.scroll-rail__nav:disabled {
  opacity: 0.32;
  cursor: default;
}

/* จอแคบ: ปัดเอาสะดวกกว่ากดปุ่มเล็กๆ อยู่แล้ว เอาปุ่มออกเพื่อคืนความกว้างให้การ์ด */
@media (max-width: 700px) {
  .scroll-rail__nav {
    display: none;
  }
}
</style>
