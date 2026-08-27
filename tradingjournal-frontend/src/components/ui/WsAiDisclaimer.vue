<script setup lang="ts">
/**
 * แถบเตือนว่าผลวิเคราะห์จาก AI ไม่ใช่คำแนะนำการลงทุน
 *
 * ข้อความอยู่ที่นี่ที่เดียวแล้วให้ทั้ง 4 จุดที่แสดงผล AI เรียกใช้ (AI Picks,
 * AI Insights, AI Portfolio Advisor, AI Risk Analysis) — ถ้อยคำแบบนี้ควรตรงกัน
 * ทุกหน้าและแก้ที่เดียวจบ ไม่ใช่ก๊อปวางไว้สี่ที่แล้วค่อย ๆ เพี้ยนออกจากกัน
 *
 * ตั้งใจวาง "ก่อน" เนื้อผลวิเคราะห์ ไม่ใช่ตัวเล็ก ๆ ท้ายการ์ด — คนต้องเห็นก่อนอ่าน
 * ตัวเลข ไม่ใช่หลังจากเชื่อไปแล้ว ฝั่ง prompt ก็มี guardrail ห้ามโมเดลพูดเป็นคำสั่ง
 * ซื้อขายอยู่แล้ว แถบนี้คือชั้นที่สองในระดับ product
 *
 * ภาษาเดินตาม LanguageStore เหมือน component อื่นทั้งโปรเจกต์ (โปรเจกต์นี้ไม่ได้ใช้
 * vue-i18n จริง — มีแต่ scaffold ที่ไม่มีใครเรียก)
 */
import { computed } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';

interface Props {
  /** ใช้ในการ์ดที่พื้นที่จำกัด — เล็กลงแต่ยังอ่านออกและยังอยู่เหนือเนื้อหา */
  dense?: boolean;
  /**
   * หมายเหตุเพิ่มเติมของหน้านั้น ๆ เช่น "ตัวเลขอ้างอิงงบไตรมาสที่จบ ..."
   *
   * รับเข้ามาแสดงในกล่องเดียวกันแทนที่จะให้แต่ละหน้าไปวางแถบของตัวเองเพิ่ม —
   * สองแถบสีเหลืองซ้อนกันบนหัวเดียวกันอ่านแล้วรก และแถบที่สองมักถูกมองข้าม
   * ผู้เรียกส่งข้อความที่แปลแล้วมาเลย เพราะมีแต่ผู้เรียกที่รู้ว่าข้อมูลของตัวเองคืออะไร
   */
  note?: string;
}

const props = withDefaults(defineProps<Props>(), { dense: false, note: '' });

const languageStore = useLanguageStore();

const text = computed(() =>
  languageStore.isThai
    ? 'ผลวิเคราะห์นี้สร้างจาก AI เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน โปรดใช้วิจารณญาณและศึกษาข้อมูลเพิ่มเติมก่อนตัดสินใจ'
    : 'This analysis is AI-generated for educational purposes only. It is not investment advice — use your own judgement and do further research before deciding.',
);
</script>

<template>
  <div
    class="ai-disclaimer"
    :class="{ 'ai-disclaimer--dense': props.dense }"
    role="note"
    data-test="ai-disclaimer"
  >
    <q-icon name="info" :size="props.dense ? '16px' : '18px'" class="ai-disclaimer__icon" />
    <span class="ai-disclaimer__text">
      {{ text }}
      <span v-if="props.note" class="ai-disclaimer__note" data-test="ai-disclaimer-note">
        {{ props.note }}
      </span>
    </span>
  </div>
</template>

<style scoped>
.ai-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  /* เหลืองอ่อนแบบ "หมายเหตุ" ไม่ใช่แดงแบบ error — เตือนให้อ่าน ไม่ใช่บอกว่ามีอะไรพัง */
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: var(--text-secondary, #94a3b8);
}

.ai-disclaimer--dense {
  padding: 8px 12px;
  margin-bottom: 10px;
}

.ai-disclaimer__icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: #f59e0b;
}

.ai-disclaimer__text {
  font-size: 12.5px;
  line-height: 1.5;
}

.ai-disclaimer--dense .ai-disclaimer__text {
  font-size: 11.5px;
}

/* บรรทัดที่สองในกล่องเดิม — จางลงหน่อยเพราะเป็นที่มาของข้อมูล ไม่ใช่คำเตือน */
.ai-disclaimer__note {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  opacity: 0.85;
}
</style>
