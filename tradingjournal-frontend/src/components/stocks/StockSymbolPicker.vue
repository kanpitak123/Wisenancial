<script setup lang="ts">
/**
 * ช่องค้นหาหุ้นแบบมี dropdown แนะนำผล — ถอดออกมาจากแถบค้นหาของ Stock Terminal
 *
 * ใช้ซ้ำได้ทุกที่ที่เดิมเป็นช่องพิมพ์เปล่า ๆ (ฟอร์ม DCA, หน้าบันทึกซื้อหุ้น) เพื่อให้
 * ผู้ใช้ไม่ต้องจำ ticker เอง และพิมพ์ผิดน้อยลง — ค้นได้ทั้งสัญลักษณ์และชื่อบริษัทเต็ม
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { useStockCatalog, type StockCatalogItem } from 'src/composables/useStockCatalog';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    dense?: boolean;
    outlined?: boolean;
    clearable?: boolean;
    autofocus?: boolean;
    disable?: boolean;
    error?: boolean;
    errorMessage?: string;
    dark?: boolean;
    /** จำนวนผลลัพธ์สูงสุดใน dropdown */
    maxResults?: number;
    /** บังคับให้ค่าที่ส่งออกเป็นตัวพิมพ์ใหญ่เสมอ (ticker) */
    uppercase?: boolean;
  }>(),
  {
    label: '',
    placeholder: '',
    dense: true,
    outlined: true,
    clearable: false,
    autofocus: false,
    disable: false,
    error: false,
    errorMessage: '',
    dark: false,
    maxResults: 20,
    uppercase: true,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  /** ยิงเฉพาะตอนเลือกจาก dropdown — พกทั้งแถวมาให้ (หน้าบันทึกซื้อใช้เติมชื่อหุ้นต่อ) */
  (event: 'select', item: StockCatalogItem): void;
}>();

const languageStore = useLanguageStore();
const { catalog, load, search } = useStockCatalog();

const query = ref(props.modelValue);
const open = ref(false);
/** ชี้แถวที่กำลังถูกเลือกด้วยลูกศรขึ้น/ลง */
const highlighted = ref(0);

onMounted(() => {
  void load();
});

// พ่อแม่เปลี่ยนค่าเอง (เช่น reset ฟอร์ม) ช่องต้องตามไปด้วย
watch(
  () => props.modelValue,
  (value) => {
    if (value !== query.value) query.value = value;
  },
);

const results = computed(() => search(catalog.value, query.value, props.maxResults));

const emitValue = (value: string) => {
  const next = props.uppercase ? value.toUpperCase() : value;
  query.value = next;
  emit('update:modelValue', next);
};

const onInput = (value: string | number | null) => {
  emitValue(String(value ?? ''));
  highlighted.value = 0;
  open.value = results.value.length > 0;
};

const choose = (item: StockCatalogItem) => {
  emitValue(item.symbol);
  open.value = false;
  emit('select', item);
};

const onFocus = () => {
  open.value = query.value.trim().length > 0 && results.value.length > 0;
};

// ปิดแบบหน่วงนิดเดียว ไม่งั้น blur จะกิน click บนแถวผลลัพธ์ไปก่อน
const onBlur = () => {
  setTimeout(() => {
    open.value = false;
  }, 150);
};

const move = (delta: number) => {
  if (!open.value || results.value.length === 0) return;

  const count = results.value.length;
  highlighted.value = (highlighted.value + delta + count) % count;
};

const onEnter = () => {
  const item = open.value ? results.value[highlighted.value] : undefined;

  if (item) {
    choose(item);
    return;
  }

  open.value = false;
};
</script>

<template>
  <div class="symbol-picker" data-test="stock-symbol-picker">
    <q-input
      :model-value="query"
      :label="props.label"
      :placeholder="
        props.placeholder ||
        (languageStore.isThai ? 'ค้นหาสัญลักษณ์หรือชื่อบริษัท' : 'Search symbol or company')
      "
      :dense="props.dense"
      :outlined="props.outlined"
      :clearable="props.clearable"
      :autofocus="props.autofocus"
      :disable="props.disable"
      :error="props.error"
      :error-message="props.errorMessage"
      :dark="props.dark"
      autocomplete="off"
      data-test="symbol-picker-input"
      @update:model-value="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="open = false"
    >
      <template #prepend>
        <q-icon name="search" size="18px" />
      </template>
      <template v-if="$slots.append" #append>
        <slot name="append" />
      </template>
    </q-input>

    <div v-if="open && results.length" class="symbol-picker__menu" data-test="symbol-picker-menu">
      <div
        v-for="(item, index) in results"
        :key="item.symbol"
        class="symbol-picker__row"
        :class="{ 'symbol-picker__row--active': index === highlighted }"
        data-test="symbol-picker-option"
        @mousedown.prevent="choose(item)"
        @mouseenter="highlighted = index"
      >
        <span class="symbol-picker__symbol">{{ item.symbol }}</span>
        <span class="symbol-picker__name">{{ item.name }}</span>
        <span v-if="item.sector" class="symbol-picker__sector">{{ item.sector }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.symbol-picker {
  position: relative;
  width: 100%;
}

.symbol-picker__menu {
  position: absolute;
  z-index: 3000;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
}

.symbol-picker__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.symbol-picker__row--active {
  background: var(--bg-card-soft);
}

.symbol-picker__symbol {
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  flex: 0 0 auto;
}

.symbol-picker__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.symbol-picker__sector {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
