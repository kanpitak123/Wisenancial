import { defineStore } from 'pinia';
import { useJournalStore } from './JournalStore';
import { usePortfolioStore } from './PortfolioStore';
import { useRecordStore } from './RecordStore';

export const useTraderStore = defineStore('trader', {
  state: () => ({
    loading: false,
    initialized: false,
    error: null as string | null,
  }),

  getters: {
    activePortfolio() {
      return usePortfolioStore().activeTraderPortfolio;
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
        useJournalStore().loadPortfolio(portfolioId),
        useRecordStore().load(portfolioId),
      ]);
    },

    async initialize() {
      this.loading = true;
      this.error = null;

      try {
        const portfolioStore = usePortfolioStore();

        portfolioStore.setActiveType('TRADER');
        await portfolioStore.loadPortfolios('TRADER');

        const portfolio = portfolioStore.activeTraderPortfolio;

        if (portfolio) {
          await this.loadPortfolioData(portfolio.id);
        } else {
          this.clearDomainStores();
        }

        this.initialized = true;
        return portfolio;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'เริ่มต้น Trader workspace ไม่สำเร็จ';
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
        this.error = error instanceof Error ? error.message : 'เปลี่ยน Trader portfolio ไม่สำเร็จ';
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
        this.error = error instanceof Error ? error.message : 'รีเฟรช Trader portfolio ไม่สำเร็จ';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    clearDomainStores() {
      useJournalStore().clear();
      useRecordStore().clear();
    },

    reset() {
      this.initialized = false;
      this.loading = false;
      this.error = null;
      this.clearDomainStores();
    },
  },
});
