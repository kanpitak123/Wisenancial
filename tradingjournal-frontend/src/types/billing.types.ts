export type CreditPackageId = 'STARTER' | 'PRO' | 'MAX';

export interface CreditPackage {
  id: CreditPackageId;
  name: string;
  priceThb: number;
  tokens: number;
  popular?: boolean;
}

export type SubscriptionTier = 'PACK_159' | 'PACK_219' | 'PACK_279' | 'PACK_399';

export interface CheckoutResponse {
  checkoutUrl: string;
  url: string;
  sessionId: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}
