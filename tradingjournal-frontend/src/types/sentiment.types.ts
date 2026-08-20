/**
 * อารมณ์ตลาด (long/short positioning) — คู่กับ GET /market-insights/sentiment
 *
 * รูปร่างตรงกับ SentimentResponse และเพื่อนๆ ใน
 * `tradingjournal-backend/src/market-insights/market-insights.service.ts`
 * ถ้าฝั่งหลังบ้านเปลี่ยน ต้องแก้ที่นี่ด้วย (แพทเทิร์นเดียวกับ heatmap.types.ts)
 *
 * ประกาศครบทุกก้อนที่ endpoint คืนมาแม้หน้าจะยังใช้แค่ overall + longShortRatios
 * เพราะ type ควรสะท้อน response จริง ไม่ใช่แค่ส่วนที่หน้าปัจจุบันหยิบไปใช้
 */
import type { HeatmapMarket } from './heatmap.types';

/** สัดส่วน long/short ของหุ้นหนึ่งตัว */
export interface SentimentRatio {
  symbol: string;
  name: string;
  /** สัดส่วนสถานะที่เป็นฝั่งซื้อ 0-100 (longPercent + shortPercent = 100) */
  longPercent: number;
  shortPercent: number;
}

/** หุ้นที่มีเงินไหลเข้า/ออกสุทธิมากที่สุด */
export interface SentimentFlowEntry {
  symbol: string;
  name: string;
  /** จำนวนเทรดเดอร์สุทธิที่ใช้จัดอันดับ */
  netTraders: number;
  changePercent: number;
}

/** รูปแบบการเข้าเทรดที่เจอบ่อยในบันทึกเทรด */
export interface SentimentSetupEntry {
  name: string;
  occurrences: number;
  /** win rate ในอดีตของ setup นี้ 0-100 */
  winRate: number;
}

/** อารมณ์ตลาดรายภูมิภาค */
export interface SentimentRegion {
  region: string;
  /** สัดส่วนฝั่งกระทิง 0-100 โดย 50 = กลางๆ */
  bullishPercent: number;
  changePercent: number;
}

export interface SentimentResponse {
  market: HeatmapMarket;
  /** ISO timestamp ของรอบข้อมูล */
  asOf: string;
  /** ภาพรวม long/short ของทุกสถานะที่ติดตามอยู่ */
  overall: { longPercent: number; shortPercent: number };
  longShortRatios: SentimentRatio[];
  mostBought: SentimentFlowEntry[];
  mostSold: SentimentFlowEntry[];
  frequentSetups: SentimentSetupEntry[];
  regions: SentimentRegion[];
}

export interface SentimentParams {
  market?: HeatmapMarket;
}
