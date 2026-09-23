import { api } from 'src/boot/axios';
import type {
  BuyStockInput,
  CostMethod,
  InvestorActivity,
  InvestorDashboard,
  InvestorPerformancePoint,
  InvestorSale,
  SellPreviewResponse,
  SellStockInput,
} from 'src/types/investor-portfolio.types';

export const investorPortfolioService = {
  buy(portfolioId: number, payload: BuyStockInput) {
    return api.post(`/investor/portfolios/${portfolioId}/stocks/buy`, payload);
  },

  sell(portfolioId: number, payload: SellStockInput) {
    return api.post(`/investor/portfolios/${portfolioId}/stocks/sell`, payload);
  },

  previewSell(
    portfolioId: number,
    params: { stock_symbol: string; shares_count: number; cost_method?: CostMethod },
  ) {
    return api.get<SellPreviewResponse>(`/investor/portfolios/${portfolioId}/stocks/sell-preview`, {
      params,
    });
  },

  getSales(portfolioId: number) {
    return api.get<InvestorSale[]>(`/investor/portfolios/${portfolioId}/stocks/sales`);
  },

  getDashboard(portfolioId: number) {
    return api.get<InvestorDashboard>(`/investor/portfolios/${portfolioId}/dashboard`);
  },

  getTimeline(portfolioId: number) {
    return api.get<InvestorActivity[]>(`/investor/portfolios/${portfolioId}/timeline`);
  },

  getPerformance(portfolioId: number) {
    return api.get<InvestorPerformancePoint[]>(`/investor/portfolios/${portfolioId}/performance`);
  },
};
