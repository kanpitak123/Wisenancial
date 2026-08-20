import { api } from 'src/boot/axios';
import type { SentimentParams, SentimentResponse } from 'src/types/sentiment.types';

// Wired to the backend: GET /market-insights/sentiment?market=
// endpoint นี้สร้างไว้นานแล้วแต่ไม่เคยมีหน้าไหนเรียกใช้จริง — MarketPulsePage เป็นตัวแรก
//
// อยู่บน MarketInsightsController ตัวเดียวกับ /heatmap และ /movers จึงติด PaidTierGuard
// เหมือนกัน แพ็กฟรีจะได้ 403 — ปล่อย error ออกไปให้ผู้เรียกแยกเอง (เหมือน
// heatmap.service.ts / volatility.service.ts) ไม่ดักกลืนไว้ในนี้
export const sentimentService = {
  /** Fetch aggregate long/short positioning from the API. */
  async getSentiment(params: SentimentParams = {}): Promise<SentimentResponse> {
    const { market } = params;

    const response = await api.get<SentimentResponse>('/market-insights/sentiment', {
      params: { ...(market ? { market } : {}) },
    });
    return response.data;
  },
};
