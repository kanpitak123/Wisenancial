export interface CreditPackage {
  id: string;
  name: string;
  priceThb: number;
  tokens: number;
  popular?: boolean;
}

export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    priceThb: 99,
    tokens: 500,
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceThb: 249,
    tokens: 1500,
    popular: true,
  },
  {
    id: 'MAX',
    name: 'Max',
    priceThb: 499,
    tokens: 3500,
  },
];
