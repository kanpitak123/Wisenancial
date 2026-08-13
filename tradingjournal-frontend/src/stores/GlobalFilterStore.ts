import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useGlobalFilterStore = defineStore('globalFilter', () => {
  // ตั้งค่าเริ่มต้นเป็น 30 วันล่าสุด
  const today = new Date();
  const pastDate = new Date();
  pastDate.setDate(today.getDate() - 30);

  // Quasar q-date มักจะใช้ Format YYYY/MM/DD
  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  };

  // State: เก็บค่าแบบ Range (จากวันไหน ถึงวันไหน)
  const dateRange = ref<{ from: string; to: string } | string>({
    from: formatDate(pastDate),
    to: formatDate(today),
  });

  // Getters: แปลงเป็น YYYY-MM-DD เพื่อส่งให้ API หลังบ้าน
  const apiStartDate = computed(() => {
    if (typeof dateRange.value === 'string') return dateRange.value.replace(/\//g, '-');
    return dateRange.value?.from ? dateRange.value.from.replace(/\//g, '-') : '';
  });

  const apiEndDate = computed(() => {
    if (typeof dateRange.value === 'string') return dateRange.value.replace(/\//g, '-');
    return dateRange.value?.to ? dateRange.value.to.replace(/\//g, '-') : '';
  });

  // Getter: สำหรับโชว์บนปุ่ม (เช่น "2024/01/01 - 2024/01/30")
  const displayLabel = computed(() => {
    if (typeof dateRange.value === 'string') return dateRange.value; // กรณีเลือกวันเดียว
    if (dateRange.value?.from && dateRange.value?.to) {
      return `${dateRange.value.from} - ${dateRange.value.to}`;
    }
    return 'เลือกช่วงเวลา';
  });

  return {
    dateRange,
    apiStartDate,
    apiEndDate,
    displayLabel,
  };
});
