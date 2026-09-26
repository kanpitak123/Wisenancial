import { defineStore } from 'pinia';
import { legalService } from 'src/services/legal.service';

interface LegalState {
  /** null = ยังไม่ได้โหลด/โหลดไม่สำเร็จ — ห้ามเดาค่าเอง (ไม่มีเลขเวอร์ชันฝังในหน้าบ้าน) */
  termsVersion: string | null;
  loading: boolean;
  error: string | null;
}

export const useLegalStore = defineStore('legal', {
  state: (): LegalState => ({
    termsVersion: null,
    loading: false,
    error: null,
  }),

  actions: {
    /** โหลดเลขเวอร์ชันข้อกำหนดจากหลังบ้าน; ไม่โยน error — ดูผลจาก termsVersion/error */
    async loadTermsVersion(): Promise<void> {
      if (this.loading) return;

      this.loading = true;
      this.error = null;

      try {
        this.termsVersion = await legalService.getTermsVersion();
      } catch (error) {
        this.termsVersion = null;
        this.error = error instanceof Error ? error.message : 'Failed to load the terms version';
      } finally {
        this.loading = false;
      }
    },
  },
});
