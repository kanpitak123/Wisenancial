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

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * ใส่เมื่อหน้านั้นมีเฉพาะโหมดเดียว — router guard จะเตะออกถ้า activeType ไม่ตรง
     * หน้าที่ใช้ได้ทั้งสองโหมด (pages/shared/) ไม่ต้องใส่
     */
    workspace?: WorkspaceType;
    requiresAuth?: boolean;
  }
}
