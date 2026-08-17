import { SubscriptionTier } from '@prisma/client';

/**
 * โควต้าจำนวนพอร์ตต่อ subscription tier
 *
 * โควต้าเป็น "ก้อนเดียว" รวม TRADER + INVESTOR — ผู้ใช้แบ่งสัดส่วนเองได้ว่าจะสร้าง
 * พอร์ตหุ้นกี่พอร์ต พอร์ต forex กี่พอร์ต ขอแค่ผลรวมไม่เกินเพดานของ tier
 *
 * ค่าอ้างอิงจาก TIER_CONFIG.portfolioLimit ของโปรเจกต์รุ่นก่อน (159:1, 219:1, 279:3, 399:5)
 * แต่ยกพื้นขั้นต่ำเป็น 2 เพราะรุ่นนั้นยังไม่แยกโหมด — เพดาน 1 จะทำให้ผู้ใช้เลือกได้แค่
 * โหมดเดียวและแบ่งสัดส่วนอะไรไม่ได้เลย
 */
export const TIER_MAX_PORTFOLIOS: Record<SubscriptionTier, number> = {
  // legacy — ไม่ได้ขายใหม่แล้ว เก็บไว้ให้สมาชิกเดิมใช้งานต่อได้
  [SubscriptionTier.PACK_159]: 2,
  [SubscriptionTier.PACK_219]: 2,
  [SubscriptionTier.PACK_279]: 3,
  [SubscriptionTier.PACK_399]: 5,
};

/**
 * ผู้ใช้ที่ subscription_tier เป็น null (สมัครใหม่ / ยังไม่จ่าย / หมดอายุ)
 *
 * ให้ 1 พอร์ตเพื่อให้ทดลองใช้งานจริงได้ แล้วค่อยเจอกำแพงตอนสร้างพอร์ตที่ 2
 * (โปรเจกต์เก่าให้ 0 แต่ที่นั่นมี free-gating router + หน้า Upgrade รองรับอยู่แล้ว)
 */
export const FREE_TIER_MAX_PORTFOLIOS = 1;

export function maxPortfoliosForTier(tier: SubscriptionTier | null): number {
  return tier === null ? FREE_TIER_MAX_PORTFOLIOS : TIER_MAX_PORTFOLIOS[tier];
}

/** ชื่อแพ็กที่เอาไว้โชว์ในข้อความ error ให้ผู้ใช้อ่านรู้เรื่อง */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  [SubscriptionTier.PACK_159]: 'แพ็กเกจ 159฿',
  [SubscriptionTier.PACK_219]: 'แพ็กเกจ 219฿',
  [SubscriptionTier.PACK_279]: 'แพ็กเกจ 279฿',
  [SubscriptionTier.PACK_399]: 'แพ็กเกจ 399฿',
};

export function tierLabel(tier: SubscriptionTier | null): string {
  return tier === null ? 'แพ็กเกจฟรี' : TIER_LABELS[tier];
}

/**
 * แปลง plans.name เป็น SubscriptionTier
 *
 * flow ของ Stripe เขียนแค่ users.subscription_tier ไม่ได้แตะตาราง subscriptions
 * แต่ยังมีสมาชิกที่ถูกเพิ่มด้วยมือผ่าน subscriptions/plans อยู่ (PaidTierGuard ก็ยอมให้ผ่าน)
 * เลยต้องอ่านเผื่อไว้ ไม่งั้นคนที่จ่ายเงินแล้วจะโดนตัดสิทธิ์เหลือโควต้า free
 */
export function tierFromPlanName(name: string | null | undefined): SubscriptionTier | null {
  if (!name) {
    return null;
  }

  const normalized = name.trim().toUpperCase();

  return (Object.values(SubscriptionTier) as string[]).includes(normalized)
    ? (normalized as SubscriptionTier)
    : null;
}
