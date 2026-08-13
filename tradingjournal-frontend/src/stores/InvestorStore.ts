import { defineStore } from 'pinia';
import { useDividendStore } from './DividendStore';
import { useInvestorPortfolioStore } from './InvestorPortfolioStore';
import { usePortfolioStore } from './PortfolioStore';
import { useRecordStore } from './RecordStore';

export const useInvestorStore = defineStore('investor', {
  state: () => ({
    loading: false,
    initialized: false,
    error: null as string | null,
  }),

  getters: {
    activePortfolio() {
      return usePortfolioStore().activeInvestorPortfolio;
    },

    activePortfolioId(): number | null {
      return this.activePortfolio?.id ?? null;
    },

    hasPortfolio(): boolean {
      return this.activePortfolioId !== null;
    },
  },

  actions: {
    async loadPortfolioData(portfolioId: number) {
      await Promise.all([
        useInvestorPortfolioStore().load(portfolioId),
        useRecordStore().load(portfolioId),
        useDividendStore().load(portfolioId),
      ]);
    },

    async initialize() {
      this.loading = true;
      this.error = null;

      try {
        const portfolioStore = usePortfolioStore();

        portfolioStore.setActiveType('INVESTOR');
        await portfolioStore.loadPortfolios('INVESTOR');

        const portfolio = portfolioStore.activeInvestorPortfolio;

        if (portfolio) {
          await this.loadPortfolioData(portfolio.id);
        } else {
          this.clearDomainStores();
        }

        this.initialized = true;
        return portfolio;
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'เริ่มต้น Investor workspace ไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async selectPortfolio(portfolioId: number) {
      const selected = usePortfolioStore().selectPortfolio(portfolioId);

      if (!selected) {
        return false;
      }

      this.loading = true;
      this.error = null;

      try {
        await this.loadPortfolioData(portfolioId);
        return true;
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'เปลี่ยน Investor portfolio ไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async refreshPortfolio() {
      const id = this.activePortfolioId;

      if (id === null) {
        this.clearDomainStores();
        return;
      }

      this.loading = true;
      this.error = null;

      try {
        await this.loadPortfolioData(id);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'รีเฟรช Investor portfolio ไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    clearDomainStores() {
      useInvestorPortfolioStore().clear();
      useRecordStore().clear();
      useDividendStore().clear();
    },

    reset() {
      this.loading = false;
      this.initialized = false;
      this.error = null;
      this.clearDomainStores();
    },
  },
});
