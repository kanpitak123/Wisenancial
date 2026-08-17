import { defineStore } from 'pinia';
import {
  INITIAL_PORTFOLIO_STATE,
  PORTFOLIO_DEFAULTS,
  PORTFOLIO_MESSAGES,
  PORTFOLIO_STORAGE_KEYS,
} from '../constants/portfolio.constants';
import { getPortfolioErrorMessage, portfolioService } from '../services/portfolio.service';
import type {
  CreatePortfolioPayload,
  Portfolio,
  PortfolioQuota,
  PortfolioState,
  PortfolioType,
  UpdatePortfolioPayload,
} from '../types/portfolio.types';

function getPortfolioStorageKey(type: PortfolioType): string {
  return type === 'TRADER'
    ? PORTFOLIO_STORAGE_KEYS.activeTraderPortfolioId
    : PORTFOLIO_STORAGE_KEYS.activeInvestorPortfolioId;
}

function readStoredPortfolioId(type: PortfolioType): number | null {
  const value = localStorage.getItem(getPortfolioStorageKey(type));

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readStoredType(): PortfolioType {
  const value = localStorage.getItem(PORTFOLIO_STORAGE_KEYS.activeType);

  return value === 'INVESTOR' ? 'INVESTOR' : PORTFOLIO_DEFAULTS.type;
}

function createInitialState(): PortfolioState {
  return {
    ...INITIAL_PORTFOLIO_STATE,
    activeType: readStoredType(),
    activePortfolioIds: {
      TRADER: readStoredPortfolioId('TRADER'),
      INVESTOR: readStoredPortfolioId('INVESTOR'),
    },
    loadedTypes: {
      TRADER: false,
      INVESTOR: false,
    },
  };
}

export const usePortfolioStore = defineStore('portfolio', {
  state: createInitialState,

  getters: {
    traderPortfolios: (state): Portfolio[] =>
      state.portfolios.filter((portfolio) => portfolio.portfolio_type === 'TRADER'),

    investorPortfolios: (state): Portfolio[] =>
      state.portfolios.filter((portfolio) => portfolio.portfolio_type === 'INVESTOR'),

    activePortfolio(state): Portfolio | null {
      const id = state.activePortfolioIds[state.activeType];

      return (
        state.portfolios.find(
          (portfolio) => portfolio.id === id && portfolio.portfolio_type === state.activeType,
        ) ?? null
      );
    },

    activePortfolioId(state): number | null {
      return state.activePortfolioIds[state.activeType] ?? null;
    },

    activeTraderPortfolio(state): Portfolio | null {
      const id = state.activePortfolioIds.TRADER;

      return (
        state.portfolios.find(
          (portfolio) => portfolio.id === id && portfolio.portfolio_type === 'TRADER',
        ) ?? null
      );
    },

    activeInvestorPortfolio(state): Portfolio | null {
      const id = state.activePortfolioIds.INVESTOR;

      return (
        state.portfolios.find(
          (portfolio) => portfolio.id === id && portfolio.portfolio_type === 'INVESTOR',
        ) ?? null
      );
    },

    currentPortfolios(state): Portfolio[] {
      return state.portfolios.filter((portfolio) => portfolio.portfolio_type === state.activeType);
    },

    // ── โควต้า ────────────────────────────────────────────────────────────────
    // โควต้าเป็นก้อนเดียวรวมทั้งสองโหมด backend เป็นเจ้าของตัวเลขจริงเสมอ
    // ระหว่างที่ยังโหลดไม่เสร็จ (quota = null) ให้ถือว่ายังสร้างได้ จะได้ไม่ disable ปุ่มมั่ว

    quotaMax: (state): number | null => state.quota?.max ?? null,

    quotaUsed(state): number {
      return state.quota?.used ?? state.portfolios.length;
    },

    quotaRemaining: (state): number | null => state.quota?.remaining ?? null,

    hasReachedQuota(state): boolean {
      return state.quota !== null && state.quota.remaining <= 0;
    },

    quotaByType(state): Record<PortfolioType, number> {
      if (state.quota) {
        return state.quota.byType;
      }

      // ยังไม่มีข้อมูลจาก backend -> นับจากพอร์ตที่โหลดมาแล้วไปก่อน
      return {
        TRADER: state.portfolios.filter((p) => p.portfolio_type === 'TRADER').length,
        INVESTOR: state.portfolios.filter((p) => p.portfolio_type === 'INVESTOR').length,
      };
    },
  },

  actions: {
    clearError() {
      this.error = null;
    },

    /**
     * โหลดโควต้าจาก backend
     *
     * ไม่ throw ต่อ — โควต้าโหลดไม่ได้ไม่ควรทำให้หน้าพอร์ตทั้งหน้าพัง
     * (quota คงเป็น null แล้ว getter จะ fallback ไปนับจากพอร์ตที่โหลดมาแทน)
     */
    async loadQuota(): Promise<PortfolioQuota | null> {
      this.isLoadingQuota = true;

      try {
        const quota = await portfolioService.getQuota();

        this.quota = quota;

        return quota;
      } catch (error) {
        console.error(PORTFOLIO_MESSAGES.quotaFailed, error);

        return null;
      } finally {
        this.isLoadingQuota = false;
      }
    },

    async loadPortfolios(type?: PortfolioType, force = false) {
      if (type && this.loadedTypes[type] && !force) {
        return this.getByType(type);
      }

      if (!type && this.hasLoadedAll && !force) {
        return this.portfolios;
      }

      this.isLoading = true;
      this.error = null;

      // โควต้ามาคู่กับรายการพอร์ตเสมอ ยิงขนานกันไปเลยไม่ต้องรอ
      void this.loadQuota();

      try {
        if (type) {
          const portfolios = await portfolioService.getAll({
            type,
          });

          this.replaceType(type, portfolios);

          this.loadedTypes[type] = true;
          this.ensureActivePortfolio(type);

          return portfolios;
        }

        const portfolios = await portfolioService.getAll();

        this.portfolios = this.sortPortfolios(portfolios);

        this.loadedTypes.TRADER = true;
        this.loadedTypes.INVESTOR = true;
        this.hasLoadedAll = true;

        this.ensureActivePortfolio('TRADER');
        this.ensureActivePortfolio('INVESTOR');

        return this.portfolios;
      } catch (error) {
        this.error = getPortfolioErrorMessage(error, PORTFOLIO_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchPortfolio(id: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const portfolio = await portfolioService.getOne(id);

        this.upsertPortfolio(portfolio);
        this.ensureActivePortfolio(portfolio.portfolio_type);

        return portfolio;
      } catch (error) {
        this.error = getPortfolioErrorMessage(error, PORTFOLIO_MESSAGES.notFound);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async createPortfolio(payload: CreatePortfolioPayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const portfolioType = payload.portfolio_type ?? this.activeType ?? PORTFOLIO_DEFAULTS.type;

        const created = await portfolioService.create({
          ...payload,
          portfolio_type: portfolioType,
          currency: payload.currency ?? PORTFOLIO_DEFAULTS.currency,
        });

        this.upsertPortfolio(created);
        this.loadedTypes[created.portfolio_type] = true;

        // ขยับตัวเลขทันทีเพื่อให้แถบโควต้าอัปเดตแบบ real-time แล้วค่อยยืนยันกับ backend
        this.applyQuotaDelta(created.portfolio_type, 1);
        void this.loadQuota();

        if (created.is_default || !this.activePortfolioIds[created.portfolio_type]) {
          this.selectPortfolio(created.id);
        } else {
          this.ensureActivePortfolio(created.portfolio_type);
        }

        return created;
      } catch (error) {
        this.error = getPortfolioErrorMessage(error, PORTFOLIO_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async updatePortfolio(id: number, payload: UpdatePortfolioPayload) {
      this.isSubmitting = true;
      this.error = null;

      const previous = this.portfolios.find((portfolio) => portfolio.id === id);

      try {
        const updated = await portfolioService.update(id, payload);

        if (previous && previous.portfolio_type !== updated.portfolio_type) {
          this.removePortfolioFromState(id);
          this.ensureActivePortfolio(previous.portfolio_type);
        }

        this.upsertPortfolio(updated);

        if (updated.is_default) {
          this.selectPortfolio(updated.id);
        } else {
          this.ensureActivePortfolio(updated.portfolio_type);
        }

        return updated;
      } catch (error) {
        this.error = getPortfolioErrorMessage(error, PORTFOLIO_MESSAGES.updateFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async deletePortfolio(id: number) {
      const portfolio = this.portfolios.find((item) => item.id === id);

      if (!portfolio) {
        return null;
      }

      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await portfolioService.delete(id);

        this.removePortfolioFromState(id);
        this.ensureActivePortfolio(portfolio.portfolio_type);

        this.applyQuotaDelta(portfolio.portfolio_type, -1);
        void this.loadQuota();

        return result;
      } catch (error) {
        this.error = getPortfolioErrorMessage(error, PORTFOLIO_MESSAGES.deleteFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    selectPortfolio(id: number): boolean {
      const portfolio = this.portfolios.find((item) => item.id === id);

      if (!portfolio) {
        return false;
      }

      const type = portfolio.portfolio_type;

      this.activeType = type;
      this.activePortfolioIds[type] = portfolio.id;

      localStorage.setItem(PORTFOLIO_STORAGE_KEYS.activeType, type);
      localStorage.setItem(getPortfolioStorageKey(type), String(portfolio.id));

      return true;
    },

    /** ผู้ใช้กดสลับโหมดอยู่ — ใช้กันกดซ้อน ทุกจุดเห็นค่าเดียวกัน */
    setSwitchingWorkspace(value: boolean) {
      this.isSwitchingWorkspace = value;
    },

    /** กำลัง initialize ตอนเปิดแอพ — ใช้โชว์ busy เท่านั้น ไม่บล็อกการกดสลับ */
    setInitializingWorkspace(value: boolean) {
      this.isInitializingWorkspace = value;
    },

    setActiveType(type: PortfolioType) {
      this.activeType = type;

      localStorage.setItem(PORTFOLIO_STORAGE_KEYS.activeType, type);

      this.ensureActivePortfolio(type);
    },

    /** ขยับตัวเลขโควต้าในเครื่องหลังสร้าง/ลบ ไม่ต้องรอ round trip */
    applyQuotaDelta(type: PortfolioType, delta: number) {
      if (!this.quota) {
        return;
      }

      const byType = {
        ...this.quota.byType,
        [type]: Math.max(0, this.quota.byType[type] + delta),
      };

      const used = byType.TRADER + byType.INVESTOR;

      this.quota = {
        ...this.quota,
        byType,
        used,
        remaining: Math.max(0, this.quota.max - used),
      };
    },

    getByType(type: PortfolioType): Portfolio[] {
      return this.portfolios.filter((portfolio) => portfolio.portfolio_type === type);
    },

    ensureActivePortfolio(type: PortfolioType) {
      const portfolios = this.getByType(type);

      if (portfolios.length === 0) {
        this.activePortfolioIds[type] = null;

        localStorage.removeItem(getPortfolioStorageKey(type));
        return;
      }

      const currentId = this.activePortfolioIds[type];

      const currentExists = portfolios.some((portfolio) => portfolio.id === currentId);

      if (currentExists) {
        return;
      }

      const next = portfolios.find((portfolio) => portfolio.is_default) ?? portfolios[0];

      if (!next) {
        return;
      }

      this.activePortfolioIds[type] = next.id;

      localStorage.setItem(getPortfolioStorageKey(type), String(next.id));
    },

    upsertPortfolio(portfolio: Portfolio) {
      const index = this.portfolios.findIndex((item) => item.id === portfolio.id);

      if (index >= 0) {
        this.portfolios[index] = portfolio;
      } else {
        this.portfolios.push(portfolio);
      }

      this.portfolios = this.sortPortfolios(this.portfolios);
    },

    replaceType(type: PortfolioType, portfolios: Portfolio[]) {
      this.portfolios = this.sortPortfolios([
        ...this.portfolios.filter((portfolio) => portfolio.portfolio_type !== type),
        ...portfolios,
      ]);
    },

    removePortfolioFromState(id: number) {
      this.portfolios = this.portfolios.filter((portfolio) => portfolio.id !== id);
    },

    sortPortfolios(portfolios: Portfolio[]) {
      return [...portfolios].sort((a, b) => {
        if (a.portfolio_type !== b.portfolio_type) {
          return a.portfolio_type.localeCompare(b.portfolio_type);
        }

        if (a.is_default !== b.is_default) {
          return a.is_default ? -1 : 1;
        }

        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;

        return createdA - createdB || a.id - b.id;
      });
    },

    clear() {
      Object.assign(this, createInitialState());

      localStorage.removeItem(PORTFOLIO_STORAGE_KEYS.activeType);
      localStorage.removeItem(PORTFOLIO_STORAGE_KEYS.activeTraderPortfolioId);
      localStorage.removeItem(PORTFOLIO_STORAGE_KEYS.activeInvestorPortfolioId);
    },
  },
});
