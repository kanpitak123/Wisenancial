import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portfolioService } from '../services/portfolio.service';
import { usePortfolioStore } from './PortfolioStore';
import type { Portfolio, PortfolioQuota, PortfolioType } from '../types/portfolio.types';

// mock ทั้งโมดูล ไม่ importActual — ไม่งั้นจะลากไปโหลด boot/axios ตัวจริง
vi.mock('../services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    getQuota: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (error: unknown, fallback: string) => {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message;

    return message ?? fallback;
  },
}));

const service = vi.mocked(portfolioService);

function portfolio(id: number, type: PortfolioType, name = `พอร์ต ${id}`): Portfolio {
  return {
    id,
    user_id: 1,
    name,
    initial_balance: 1000,
    current_balance: 1200,
    portfolio_type: type,
    investor_cost_method: 'FIFO',
    currency: 'USD',
    icon: null,
    color: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function quota(
  max: number,
  trader: number,
  investor: number,
): PortfolioQuota {
  const used = trader + investor;

  return {
    max,
    used,
    remaining: Math.max(0, max - used),
    byType: { TRADER: trader, INVESTOR: investor },
  };
}

/** รอให้ void this.loadQuota() ที่ยิงแบบไม่ await ทำงานจบ */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PortfolioStore — โควต้า', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    service.getAll.mockResolvedValue([]);
    service.getQuota.mockResolvedValue(quota(3, 0, 0));
  });

  describe('loadQuota', () => {
    it('เก็บโควต้าจาก endpoint ลง state', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 1, 1));

      await store.loadQuota();

      expect(store.quota).toEqual(quota(3, 1, 1));
      expect(store.isLoadingQuota).toBe(false);
    });

    it('โหลดไม่สำเร็จ -> ไม่ throw และ quota คงเป็น null', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockRejectedValue(new Error('network down'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(store.loadQuota()).resolves.toBeNull();

      expect(store.quota).toBeNull();
      expect(store.isLoadingQuota).toBe(false);

      consoleError.mockRestore();
    });

    it('loadPortfolios() ดึงโควต้ามาด้วย', async () => {
      const store = usePortfolioStore();

      service.getAll.mockResolvedValue([portfolio(1, 'TRADER'), portfolio(2, 'INVESTOR')]);
      service.getQuota.mockResolvedValue(quota(3, 1, 1));

      await store.loadPortfolios();
      await flush();

      expect(service.getQuota.mock.calls.length).toBeGreaterThan(0);
      expect(store.quota).toEqual(quota(3, 1, 1));
    });
  });

  describe('getters', () => {
    it('โควต้าเหลือ -> hasReachedQuota เป็น false และตัวเลขถูกต้อง', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 1, 1));
      await store.loadQuota();

      expect(store.quotaMax).toBe(3);
      expect(store.quotaUsed).toBe(2);
      expect(store.quotaRemaining).toBe(1);
      expect(store.hasReachedQuota).toBe(false);
    });

    it('โควต้าเต็ม -> hasReachedQuota เป็น true', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 2, 1));
      await store.loadQuota();

      expect(store.quotaRemaining).toBe(0);
      expect(store.hasReachedQuota).toBe(true);
    });

    it('byType แสดงจำนวนแยกโหมดตามที่ backend ส่งมา', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(5, 3, 2));
      await store.loadQuota();

      expect(store.quotaByType).toEqual({ TRADER: 3, INVESTOR: 2 });
    });

    it('ยังไม่มีโควต้า (quota = null) -> ไม่ disable ปุ่ม และ byType นับจากพอร์ตที่โหลดมา', async () => {
      const store = usePortfolioStore();

      service.getAll.mockResolvedValue([
        portfolio(1, 'TRADER'),
        portfolio(2, 'TRADER'),
        portfolio(3, 'INVESTOR'),
      ]);
      service.getQuota.mockRejectedValue(new Error('offline'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await store.loadPortfolios();
      await flush();

      expect(store.quota).toBeNull();
      expect(store.quotaMax).toBeNull();
      expect(store.hasReachedQuota).toBe(false);
      expect(store.quotaUsed).toBe(3);
      expect(store.quotaByType).toEqual({ TRADER: 2, INVESTOR: 1 });

      consoleError.mockRestore();
    });

    it('พอร์ตเกินเพดาน (เพิ่งถูกดาวน์เกรด) -> remaining ไม่ติดลบ', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(2, 3, 2));
      await store.loadQuota();

      expect(store.quotaUsed).toBe(5);
      expect(store.quotaRemaining).toBe(0);
      expect(store.hasReachedQuota).toBe(true);
    });
  });

  describe('อัปเดตแบบ real-time หลังสร้าง/ลบ', () => {
    it('สร้างพอร์ตแล้วตัวเลขขยับทันทีโดยไม่ต้องรอ backend', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 1, 1));
      await store.loadQuota();

      const created = portfolio(9, 'INVESTOR');
      service.create.mockResolvedValue(created);
      // ให้ refresh คืนค่าเดิม จะได้พิสูจน์ว่าตัวเลขที่เห็นมาจาก local delta
      service.getQuota.mockResolvedValue(quota(3, 1, 2));

      await store.createPortfolio({ name: 'ใหม่', initial_balance: 100 });

      expect(store.quotaUsed).toBe(3);
      expect(store.quotaRemaining).toBe(0);
      expect(store.hasReachedQuota).toBe(true);
      expect(store.quotaByType).toEqual({ TRADER: 1, INVESTOR: 2 });
    });

    it('ลบพอร์ตแล้วโควต้าคืนกลับมา', async () => {
      const store = usePortfolioStore();

      service.getAll.mockResolvedValue([portfolio(1, 'TRADER'), portfolio(2, 'INVESTOR')]);
      service.getQuota.mockResolvedValue(quota(2, 1, 1));

      await store.loadPortfolios();
      await flush();

      expect(store.hasReachedQuota).toBe(true);

      service.delete.mockResolvedValue({ message: 'ok', deleted_id: 2 });
      service.getQuota.mockResolvedValue(quota(2, 1, 0));

      await store.deletePortfolio(2);

      expect(store.quotaUsed).toBe(1);
      expect(store.quotaRemaining).toBe(1);
      expect(store.hasReachedQuota).toBe(false);
      expect(store.quotaByType).toEqual({ TRADER: 1, INVESTOR: 0 });
    });

    it('สร้างไม่สำเร็จ (โควต้าเต็มฝั่ง backend) -> ตัวเลขไม่ขยับ และเก็บ error ไว้', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 2, 1));
      await store.loadQuota();

      service.create.mockRejectedValue({
        response: { data: { message: 'สร้างพอร์ตไม่ได้ แพ็กเกจ 279฿ ของคุณสร้างได้สูงสุด 3 พอร์ต' } },
      });

      await expect(
        store.createPortfolio({ name: 'เกิน', initial_balance: 100 }),
      ).rejects.toBeDefined();

      expect(store.quotaUsed).toBe(3);
      expect(store.quotaByType).toEqual({ TRADER: 2, INVESTOR: 1 });
      expect(store.error).toContain('สร้างพอร์ตไม่ได้');
    });

    it('applyQuotaDelta ไม่พังเมื่อยังไม่มีโควต้า', () => {
      const store = usePortfolioStore();

      expect(() => store.applyQuotaDelta('TRADER', 1)).not.toThrow();
      expect(store.quota).toBeNull();
    });

    it('applyQuotaDelta ไม่ทำให้ byType ติดลบ', async () => {
      const store = usePortfolioStore();

      service.getQuota.mockResolvedValue(quota(3, 0, 1));
      await store.loadQuota();

      store.applyQuotaDelta('TRADER', -1);

      expect(store.quotaByType.TRADER).toBe(0);
      expect(store.quotaUsed).toBe(1);
    });
  });

  it('clear() ล้างโควต้าด้วย', async () => {
    const store = usePortfolioStore();

    service.getQuota.mockResolvedValue(quota(3, 1, 1));
    await store.loadQuota();

    store.clear();

    expect(store.quota).toBeNull();
  });
});
