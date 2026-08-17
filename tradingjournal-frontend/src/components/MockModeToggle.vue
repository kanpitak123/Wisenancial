<template>
  <q-btn
    flat
    dense
    no-caps
    class="mock-toggle"
    :class="{ 'mock-toggle--on': enabled }"
    @click="confirmToggle"
  >
    <q-icon name="science" size="16px" />
    <span v-if="enabled" class="mock-toggle__label q-ml-xs">MOCK</span>

    <q-tooltip class="bg-grey-9 text-white shadow-4" max-width="260px">
      {{
        enabled
          ? 'กำลังแสดงข้อมูลตัวอย่าง (ไม่ได้ยิง backend) — คลิกเพื่อกลับไปใช้ข้อมูลจริง'
          : 'สลับเป็นข้อมูลตัวอย่าง เพื่อดูหน้าตาทุกหน้าโดยไม่ต้องมีข้อมูลใน DB'
      }}
    </q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { isMockEnabled, setMockEnabled } from 'src/mocks';

const $q = useQuasar();
const enabled = ref(isMockEnabled());

function confirmToggle() {
  const turningOn = !enabled.value;

  $q.dialog({
    title: turningOn ? 'เปิดโหมดข้อมูลตัวอย่าง' : 'กลับไปใช้ข้อมูลจริง',
    message: turningOn
      ? 'ทุกหน้าจะแสดงข้อมูลตัวอย่างแทนการยิง backend เพื่อให้ดูหน้าตาได้ครบทุกหน้า<br><br>หน้าเว็บจะรีโหลดหนึ่งครั้ง'
      : 'จะกลับไปดึงข้อมูลจริงจาก backend ตามปกติ<br><br>หน้าเว็บจะรีโหลดหนึ่งครั้ง',
    html: true,
    cancel: { flat: true, label: 'ยกเลิก', color: 'grey' },
    ok: { unelevated: true, label: turningOn ? 'เปิด Mock' : 'ใช้ข้อมูลจริง', color: 'primary' },
    persistent: false,
  }).onOk(() => {
    setMockEnabled(turningOn);
    enabled.value = turningOn;

    // รีโหลดเพื่อให้ทุก store ดึงข้อมูลใหม่จากแหล่งที่เลือก
    window.location.reload();
  });
}
</script>

<style scoped>
.mock-toggle {
  border-radius: 999px;
  padding: 2px 10px;
  min-height: 28px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  opacity: 0.55;
  transition:
    background 0.25s ease,
    color 0.25s ease,
    opacity 0.25s ease;
}

.mock-toggle:hover {
  opacity: 0.9;
}

.mock-toggle--on {
  opacity: 1;
  background: rgba(255, 177, 105, 0.18);
  color: #ff9f43;
  border: 1px solid rgba(255, 177, 105, 0.45);
}
</style>
