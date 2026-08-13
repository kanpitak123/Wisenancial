import type { ChartInterval } from '../types/asset.types';

export const ASSETS_API_PATH = '/assets';

export const ASSET_CHART_INTERVALS: readonly ChartInterval[] = ['1d', '1wk', '1mo'];

export const DEFAULT_CHART_INTERVAL: ChartInterval = '1d';

export const ASSET_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Portfolio',
  loadFailed: 'ไม่สามารถโหลดรายการสินทรัพย์ได้',
  chartFailed: 'ไม่สามารถโหลดข้อมูลกราฟได้',
  monthlyFailed: 'ไม่สามารถโหลดข้อมูลรายเดือนได้',
  investorOverviewFailed: 'ไม่สามารถโหลดภาพรวมสินทรัพย์ Investor ได้',
  newsFailed: 'ไม่สามารถโหลดข่าวหุ้นได้',
  eventsFailed: 'ไม่สามารถโหลด Corporate Events ได้',
  trendingFailed: 'ไม่สามารถโหลดหุ้นที่กำลังเป็นกระแสได้',
  valuationFailed: 'ไม่สามารถโหลดข้อมูล Valuation ได้',
} as const;
