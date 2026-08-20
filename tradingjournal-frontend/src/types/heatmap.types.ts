/**
 * แผนที่ความร้อนตลาดรายเซกเตอร์ — คู่กับ GET /market-insights/heatmap
 *
 * รูปร่างตรงกับ HeatmapResponse/HeatmapSector/HeatmapTile ใน
 * `tradingjournal-backend/src/market-insights/market-insights.service.ts`
 * ถ้าฝั่งหลังบ้านเปลี่ยน ต้องแก้ที่นี่ด้วย
 */
export type HeatmapMarket = 'GLOBAL' | 'TH';

/** หุ้นหนึ่งตัว = ช่องสี่เหลี่ยมหนึ่งช่องในกริดของเซกเตอร์ */
export interface HeatmapTile {
  symbol: string;
  name: string;
  sector: string;
  changePercent: number;
  /** น้ำหนักตามขนาดหุ้น — ใช้เป็น flex-grow ให้ช่องหุ้นใหญ่กินพื้นที่มากกว่า */
  weight: number;
  tradedValue: number;
}

export interface HeatmapSector {
  sector: string;
  /** ค่าเฉลี่ยถ่วงน้ำหนักของ changePercent ในเซกเตอร์ (หลังบ้านคำนวณมาให้แล้ว) */
  avgChangePercent: number;
  totalWeight: number;
  tiles: HeatmapTile[];
}

export interface HeatmapResponse {
  market: HeatmapMarket;
  /** ISO timestamp ของรอบข้อมูล */
  asOf: string;
  sectors: HeatmapSector[];
}

export interface HeatmapParams {
  market?: HeatmapMarket;
}
