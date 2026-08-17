import type { PortfolioState, PortfolioType } from '../types/portfolio.types';

export const PORTFOLIO_API_PATH = '/portfolios';

export const PORTFOLIO_TYPES: readonly PortfolioType[] = ['TRADER', 'INVESTOR'];

export const PORTFOLIO_DEFAULTS = {
  type: 'TRADER' as PortfolioType,
  currency: 'USD',
  initialBalance: 0,
} as const;

export const PORTFOLIO_STORAGE_KEYS = {
  activeType: 'wisenancial_active_portfolio_type',
  activeTraderPortfolioId: 'wisenancial_active_trader_portfolio_id',
  activeInvestorPortfolioId: 'wisenancial_active_investor_portfolio_id',
} as const;

export const PORTFOLIO_MESSAGES = {
  loadFailed: 'ไม่สามารถโหลดข้อมูลพอร์ตได้',
  createFailed: 'ไม่สามารถสร้างพอร์ตได้',
  updateFailed: 'ไม่สามารถแก้ไขพอร์ตได้',
  deleteFailed: 'ไม่สามารถลบพอร์ตได้',
  notFound: 'ไม่พบพอร์ตที่เลือก',
  quotaFailed: 'ไม่สามารถโหลดโควต้าพอร์ตได้',
  quotaReached: 'ใช้โควต้าพอร์ตครบแล้ว',
} as const;

/** route ของหน้าอัปเกรดแพ็กเกจ — ต้องตรงกับ routes.ts และ redirect ของ payments.service.ts */
export const UPGRADE_ROUTE = '/Upgrade';

export const INITIAL_PORTFOLIO_STATE: PortfolioState = {
  portfolios: [],
  activePortfolioIds: {
    TRADER: null,
    INVESTOR: null,
  },
  activeType: PORTFOLIO_DEFAULTS.type,
  quota: null,
  isSwitchingWorkspace: false,
  isInitializingWorkspace: false,
  isLoading: false,
  isLoadingQuota: false,
  isSubmitting: false,
  hasLoadedAll: false,
  loadedTypes: {
    TRADER: false,
    INVESTOR: false,
  },
  error: null,
};
