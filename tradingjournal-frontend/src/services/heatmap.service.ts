import { api } from 'src/boot/axios';
import type { HeatmapParams, HeatmapResponse } from 'src/types/heatmap.types';

// Wired to the backend: GET /market-insights/heatmap?market=
// ปล่อย error ออกไปให้ผู้เรียกจัดการเอง หน้าเพจจะได้แยก 402/403 (ต้องอัปเกรด)
// ออกจาก error อื่นได้ — เหมือน volatility.service.ts ที่ยิงคอนโทรลเลอร์ตัวเดียวกัน
export const heatmapService = {
  /** Fetch the sector heatmap from the API. */
  async getHeatmap(params: HeatmapParams = {}): Promise<HeatmapResponse> {
    const { market } = params;

    const response = await api.get<HeatmapResponse>('/market-insights/heatmap', {
      params: { ...(market ? { market } : {}) },
    });
    return response.data;
  },
};
