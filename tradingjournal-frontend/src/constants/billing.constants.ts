import type { CreditPackageId, SubscriptionTier } from 'src/types/billing.types';

export const BILLING_API_PATH = '/billing';

export const PAYMENTS_API_PATH = '/payments';

export const CREDIT_PACKAGE_IDS: readonly CreditPackageId[] = ['STARTER', 'PRO', 'MAX'];

export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  'PACK_159',
  'PACK_219',
  'PACK_279',
  'PACK_399',
];

/**
 * โควต้าพอร์ตของแต่ละแพ็ก — สะท้อน portfolio-quota.config.ts ฝั่ง backend
 *
 * ใช้เพื่อ "แสดงผล" เท่านั้น (ตารางราคาในหน้า Upgrade และ mock)
 * ตัวเลขจริงที่บังคับใช้มาจาก GET /portfolios/quota เสมอ — อย่าเอาไปตัดสินใจ
 * แทน PortfolioStore.hasReachedQuota
 */
export const TIER_MAX_PORTFOLIOS: Record<SubscriptionTier, number> = {
  PACK_159: 2,
  PACK_219: 2,
  PACK_279: 3,
  PACK_399: 5,
};

/** ผู้ใช้ที่ subscription_tier เป็น null (free tier) */
export const FREE_TIER_MAX_PORTFOLIOS = 1;

export function maxPortfoliosForTier(tier: SubscriptionTier | null | undefined): number {
  return tier ? TIER_MAX_PORTFOLIOS[tier] : FREE_TIER_MAX_PORTFOLIOS;
}

/** ราคาต่อเดือน (บาท) — ตัวเลขในชื่อแพ็กคือราคาอยู่แล้ว */
export const TIER_PRICE_THB: Record<SubscriptionTier, number> = {
  PACK_159: 159,
  PACK_219: 219,
  PACK_279: 279,
  PACK_399: 399,
};

export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  PACK_159: 'Starter',
  PACK_219: 'Basic',
  PACK_279: 'Pro',
  PACK_399: 'Elite',
};

/** ฟีเจอร์ที่โชว์ในตารางเปรียบเทียบ (ยกมาจาก TIER_CONFIG ของโปรเจกต์รุ่นก่อน) */
export const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  PACK_159: ['บันทึกเทรด/ลงทุนไม่จำกัด', 'Analytics พื้นฐาน'],
  PACK_219: ['บันทึกเทรด/ลงทุนไม่จำกัด', 'Analytics พื้นฐาน'],
  PACK_279: [
    'ทุกอย่างในแพ็ก Basic',
    'AI Stock Screener',
    'News Impact แบบเรียลไทม์',
    'Trading Academy',
  ],
  PACK_399: [
    'ทุกอย่างในแพ็ก Pro',
    'AI เต็มรูปแบบ',
    'Coach Room',
    'Priority Support',
  ],
};

/**
 * แพ็กที่เปิดขายจริงตอนนี้ เรียงตามลำดับที่จะแสดง
 *
 * PACK_159 เป็นแพ็ก legacy — ยังอยู่ใน SUBSCRIPTION_TIERS เพื่อให้สมาชิกเดิมใช้งานต่อได้
 * แต่ไม่เสนอขายให้คนใหม่ (เหมือน AVAILABLE_PACK_PLAN_IDS ของโปรเจกต์รุ่นก่อน)
 */
export const AVAILABLE_SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  'PACK_219',
  'PACK_279',
  'PACK_399',
];

/** ใช้เทียบว่าแพ็กไหนสูงกว่ากัน — ตัดสินว่าปุ่มเป็น "อัปเกรด" หรือ "แพ็กปัจจุบัน" */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  PACK_159: 1,
  PACK_219: 2,
  PACK_279: 3,
  PACK_399: 4,
};

export function tierRank(tier: SubscriptionTier | null | undefined): number {
  return tier ? TIER_RANK[tier] : 0;
}

export const BILLING_MESSAGES = {
  packagesFailed: 'ไม่สามารถโหลดแพ็กเกจ AI Credits ได้',
  creditCheckoutFailed: 'ไม่สามารถสร้างหน้าชำระเงิน AI Credits ได้',
  subscriptionCheckoutFailed: 'ไม่สามารถสร้างหน้าชำระเงิน Subscription ได้',
} as const;
