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

export const BILLING_MESSAGES = {
  packagesFailed: 'ไม่สามารถโหลดแพ็กเกจ AI Credits ได้',
  creditCheckoutFailed: 'ไม่สามารถสร้างหน้าชำระเงิน AI Credits ได้',
  subscriptionCheckoutFailed: 'ไม่สามารถสร้างหน้าชำระเงิน Subscription ได้',
} as const;
