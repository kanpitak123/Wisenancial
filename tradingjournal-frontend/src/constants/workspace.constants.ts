import type { WorkspaceType } from 'src/types/workspace.types';

export const WORKSPACE_ROUTES: Record<WorkspaceType, string> = {
  TRADER: '/app/trader/dashboard',
  INVESTOR: '/app/investor/dashboard',
};

export const WORKSPACE_MESSAGES = {
  traderPortfolioRequired: 'กรุณาสร้างหรือเลือกพอร์ตเทรดก่อน',
  investorPortfolioRequired: 'กรุณาสร้างหรือเลือกพอร์ตลงทุนก่อน',
} as const;
