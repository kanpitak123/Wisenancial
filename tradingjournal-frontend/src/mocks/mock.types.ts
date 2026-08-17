export type MockMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface MockContext {
  method: MockMethod;
  /** path ที่ตัด query string ออกแล้ว เช่น '/trades/portfolio/12' */
  path: string;
  /** ค่าที่จับได้จาก :param ใน route เช่น { portfolioId: '12' } */
  params: Record<string, string>;
  /** query string + config.params รวมกัน */
  query: Record<string, string>;
  /** request body ที่ parse แล้ว (ถ้ามี) */
  body: Record<string, unknown>;
}

export interface MockRoute {
  method: MockMethod;
  /** รองรับ :param เช่น '/analytics/portfolio/:portfolioId/overview' */
  path: string;
  handler: (ctx: MockContext) => unknown;
}

export function defineMockRoutes(routes: MockRoute[]): MockRoute[] {
  return routes;
}

/**
 * แปลงค่าที่รับมาจาก request body/query (type เป็น unknown) เป็น string อย่างปลอดภัย
 * ถ้าเป็น object จะคืน fallback แทนที่จะได้ '[object Object]'
 */
export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(typeof value === 'string' || typeof value === 'number' ? value : NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}
