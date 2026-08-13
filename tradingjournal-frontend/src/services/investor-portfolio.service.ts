import { api } from 'src/boot/axios';
import type {
  BuyStockInput,
  InvestorActivity,
  InvestorDashboard,
  InvestorPerformancePoint,
  InvestorSale,
  SellStockInput,
} from 'src/types/investor-portfolio.types';

export const investorPortfolioService = {
  buy(portfolioId: number, payload: BuyStockInput) {
    return api.post(`/investor/portfolios/${portfolioId}/stocks/buy`, payload);
  },

  sell(portfolioId: number, payload: SellStockInput) {
    return api.post(`/investor/portfolios/${portfolioId}/stocks/sell`, payload);
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
