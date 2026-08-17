/**
 * เส้นทางและเมนูหลังยุบ /StockExplorer + /StockAnalysis เป็นหน้าเดียว
 *
 * จุดที่พังเงียบได้ง่ายที่สุดของงานรวมหน้าคือ "ลิงก์ค้าง" — เมนู ปุ่มในหน้าอื่น หรือ
 * bookmark ของผู้ใช้ที่ยังชี้ไป path เดิมแล้วตก 404 โดยไม่มีใครรู้จนกว่าจะมีคนกด
 */
import { describe, expect, it } from 'vitest';
import routes from './routes';
import { WORKSPACE_NAV_LINKS } from 'src/constants/workspace.constants';
import type { RouteRecordRaw } from 'vue-router';

const workspaceChildren = (): RouteRecordRaw[] => {
  const shell = routes.find((route) => Array.isArray(route.children) && route.children.length > 5);

  expect(shell, 'ไม่พบ route หลักที่ครอบหน้าในเวิร์กสเปซ').toBeDefined();

  return shell!.children as RouteRecordRaw[];
};

const findRoute = (path: string) =>
  workspaceChildren().find((route) => route.path === path);

describe('เส้นทางของ Stock Terminal', () => {
  it('/Stocks กับ /stock/:symbol โหลด component ตัวเดียวกัน (คลิกเลือกหุ้นจึงไม่ remount ทั้งหน้า)', () => {
    const terminal = findRoute('Stocks');
    const deepLink = findRoute('stock/:symbol');

    expect(terminal?.component).toBeDefined();
    expect(deepLink?.component).toBeDefined();

    // ทั้งคู่เป็น lazy loader คนละ closure จึงเทียบ identity ตรง ๆ ไม่ได้
    // เทียบว่าชี้ไปโมดูลเดียวกันแทน (ถ้าแยกไฟล์เมื่อไหร่ การเปลี่ยนหุ้นจะกลายเป็น remount)
    const source = (route: RouteRecordRaw | undefined) => {
      const loader = route?.component;

      expect(typeof loader).toBe('function');

      return Function.prototype.toString.call(loader);
    };

    expect(source(terminal)).toContain('StockTerminalPage');
    expect(source(deepLink)).toBe(source(terminal));
  });

  it('/stock/:symbol ยังเป็น deep link หลัก ไม่ถูกลบทิ้งตอนรวมหน้า', () => {
    expect(findRoute('stock/:symbol')).toBeDefined();
  });

  it('path เดิมสองอันถูก redirect มาที่หน้าใหม่ ไม่ปล่อยให้ตก 404', () => {
    expect(findRoute('StockExplorer')?.redirect).toBe('/Stocks');
    expect(findRoute('StockAnalysis')?.redirect).toBe('/Stocks');
  });

  it('ทั้งสอง path เดิมไม่ผูกกับ component ของตัวเองอีกแล้ว', () => {
    expect(findRoute('StockExplorer')?.component).toBeUndefined();
    expect(findRoute('StockAnalysis')?.component).toBeUndefined();
  });

  it('หน้าใหม่ยังล็อกไว้ที่เวิร์กสเปซ INVESTOR เหมือนสองหน้าเดิม', () => {
    expect(findRoute('Stocks')?.meta?.workspace).toBe('INVESTOR');
    expect(findRoute('stock/:symbol')?.meta?.workspace).toBe('INVESTOR');
  });
});

describe('เมนูของโหมด Stock', () => {
  const investorLinks = WORKSPACE_NAV_LINKS.INVESTOR;

  it('เหลือรายการเดียวที่ชี้มาหน้ารวม ไม่ใช่สองรายการเดิม', () => {
    const stockLinks = investorLinks.filter((item) =>
      ['/Stocks', '/StockExplorer', '/StockAnalysis'].includes(item.link),
    );

    expect(stockLinks).toHaveLength(1);
    expect(stockLinks[0]!.link).toBe('/Stocks');
  });

  it('ไม่มีเมนูไหนชี้ไป path เดิมที่ถูกยุบแล้ว', () => {
    const stale = investorLinks.filter(
      (item) => item.link === '/StockExplorer' || item.link === '/StockAnalysis',
    );

    expect(stale).toEqual([]);
  });

  it('ทุกลิงก์ในเมนูโหมด Stock ต้องมี route รองรับจริง', () => {
    const paths = new Set(workspaceChildren().map((route) => `/${route.path}`));

    for (const item of investorLinks) {
      expect(paths.has(item.link), `เมนู "${item.title}" ชี้ไป ${item.link} ที่ไม่มี route`).toBe(
        true,
      );
    }
  });
});
