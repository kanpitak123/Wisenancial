import type { Portfolio } from 'src/types/portfolio.types';

export type WorkspaceType = 'TRADER' | 'INVESTOR';

export interface WorkspaceState {
  activePortfolioId: number | null;
  loading: boolean;
  initialized: boolean;
}

export interface WorkspacePortfolioContext {
  portfolio: Portfolio;
  workspace: WorkspaceType;
}
