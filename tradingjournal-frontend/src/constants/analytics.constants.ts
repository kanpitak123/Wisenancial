import type { AnalyticsTimeframe } from '../types/analytics.types';

export const ANALYTICS_API_PATH = '/analytics';

export const ANALYTICS_TIMEFRAMES: readonly AnalyticsTimeframe[] = [
  '1W',
  '1M',
  '3M',
  '6M',
  '9M',
  '1Y',
  'ALL',
];

export const DEFAULT_ANALYTICS_TIMEFRAME: AnalyticsTimeframe = '1M';

export const DEFAULT_ANALYTICS_BENCHMARK = 'SET';

export const ANALYTICS_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Portfolio',
  loadFailed: 'ไม่สามารถโหลด Analytics ได้',
  detailsFailed: 'ไม่สามารถโหลดข้อมูล Analytics เพิ่มเติมได้',
  advancedFailed: 'ไม่สามารถโหลด Advanced Analytics ได้',
  paidTierRequired: 'ฟีเจอร์ Analytics นี้ต้องใช้แพ็กเกจแบบชำระเงิน',
  dcaFailed: 'ไม่สามารถจำลอง DCA ได้',
} as const;
