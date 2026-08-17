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

    /**
     * เลขรอบของการ initialize — กัน request ที่ค้างอยู่เขียนทับ store หลังผู้ใช้สลับโหมดไปแล้ว
     * reset() จะบวกเลขนี้ ทำให้รอบที่กำลัง await อยู่กลายเป็น "ล้าสมัย" แล้วถูกทิ้ง
     */
    generation: 0,

    /** รอบที่กำลังทำงานอยู่ — เรียกซ้ำจะได้รอตัวนี้ แทนที่จะ return เงียบๆ */
    pending: null as Promise<unknown> | null,
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
      // มีรอบที่ค้างอยู่ -> รอตัวนั้นให้เสร็จ ไม่ใช่ return เงียบๆ
      // (ของเดิม return ทันทีทำให้ setActiveType ไม่ถูกเรียก โหมดเลยไม่เปลี่ยนแต่ไม่มี error)
      if (this.pending) {
        return this.pending;
      }

      const generation = ++this.generation;

      this.loading = true;
      this.error = null;

      const run = async () => {
        try {
          const portfolioStore = usePortfolioStore();

          portfolioStore.setActiveType('INVESTOR');
          await portfolioStore.loadPortfolios('INVESTOR');

          // ผู้ใช้สลับโหมดไปแล้วระหว่างรอ -> ทิ้งผลลัพธ์ ไม่แตะ store
          if (generation !== this.generation) {
            return null;
          }

          const portfolio = portfolioStore.activeInvestorPortfolio;

          if (portfolio) {
            await this.loadPortfolioData(portfolio.id);

            // เช็คซ้ำหลังโหลด — ถ้าสลับไปแล้วต้องล้างของที่เพิ่งเขียนลงไปทิ้ง
            if (generation !== this.generation) {
              this.clearDomainStores();
              return null;
            }
          } else {
            this.clearDomainStores();
          }

          this.initialized = true;
          return portfolio;
        } catch (error) {
          if (generation === this.generation) {
            this.error =
              error instanceof Error ? error.message : 'เริ่มต้น Investor workspace ไม่สำเร็จ';
          }
          throw error;
        } finally {
          if (generation === this.generation) {
            this.loading = false;
          }

          this.pending = null;
        }
      };

      this.pending = run();

      return this.pending;
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
      // บวก generation เพื่อทำให้ initialize ที่ยัง await อยู่กลายเป็นล้าสมัย
      // ไม่งั้นพอ request ค้างตอบกลับมา มันจะยัดข้อมูลโหมดนี้กลับเข้า store ทั้งที่สลับไปแล้ว
      this.generation += 1;
      this.pending = null;
      this.loading = false;
      this.initialized = false;
      this.error = null;
      this.clearDomainStores();
    },
  },
});
