import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import axios from 'axios';
import { MOCK_LATENCY_MS, isMockEnabled } from './mock.config';
import { asString, type MockContext, type MockMethod, type MockRoute } from './mock.types';
import { coreRoutes } from './routes/core.routes';
import { traderRoutes } from './routes/trader.routes';
import { investorRoutes } from './routes/investor.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { contentRoutes } from './routes/content.routes';
import { extraRoutes } from './routes/extras.routes';

const ROUTES: MockRoute[] = [
  ...coreRoutes,
  ...traderRoutes,
  ...investorRoutes,
  ...analyticsRoutes,
  ...contentRoutes,
  ...extraRoutes,
];

interface CompiledRoute extends MockRoute {
  regex: RegExp;
  keys: string[];
}

/** '/trades/portfolio/:portfolioId' -> /^\/trades\/portfolio\/([^/]+)$/ */
function compile(route: MockRoute): CompiledRoute {
  const keys: string[] = [];

  const pattern = route.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      keys.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');

  return { ...route, keys, regex: new RegExp(`^${pattern}$`) };
}

const COMPILED = ROUTES.map(compile);

/**
 * route ที่ path ยาว/เจาะจงกว่าต้องถูกจับก่อน
 * เช่น '/coaches/sessions/mine' ต้องมาก่อน '/coaches/:id'
 */
const SORTED = [...COMPILED].sort((a, b) => {
  const staticSegments = (route: CompiledRoute) =>
    route.path.split('/').filter((s) => s && !s.startsWith(':')).length;

  const bySegments = b.path.split('/').length - a.path.split('/').length;
  return bySegments !== 0 ? bySegments : staticSegments(b) - staticSegments(a);
});

function toPath(url: string, baseURL?: string): string {
  let path = url;

  if (baseURL && path.startsWith(baseURL)) {
    path = path.slice(baseURL.length);
  }

  // ตัด origin ออกกรณีส่ง absolute URL มา
  path = path.replace(/^https?:\/\/[^/]+/, '');

  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    path = path.slice(0, queryIndex);
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function collectQuery(config: AxiosRequestConfig): Record<string, string> {
  const query: Record<string, string> = {};

  const url = config.url ?? '';
  const queryIndex = url.indexOf('?');

  if (queryIndex >= 0) {
    new URLSearchParams(url.slice(queryIndex + 1)).forEach((value, key) => {
      query[key] = value;
    });
  }

  const params = config.params as Record<string, unknown> | undefined;

  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query[key] = asString(value, JSON.stringify(value));
      }
    }
  }

  return query;
}

function parseBody(data: unknown): Record<string, unknown> {
  if (!data) return {};

  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (data instanceof FormData) {
    const body: Record<string, unknown> = {};
    data.forEach((value, key) => {
      body[key] = value;
    });
    return body;
  }

  return typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export interface MockMatch {
  route: CompiledRoute;
  ctx: MockContext;
}

export function matchMock(config: AxiosRequestConfig): MockMatch | null {
  const method = (config.method ?? 'get').toUpperCase() as MockMethod;
  const path = toPath(config.url ?? '', config.baseURL);

  for (const route of SORTED) {
    if (route.method !== method) continue;

    const match = route.regex.exec(path);
    if (!match) continue;

    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = match[index + 1] ?? '';
    });

    return {
      route,
      ctx: { method, path, params, query: collectQuery(config), body: parseBody(config.data) },
    };
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ติดตั้ง mock adapter ลงบน axios instance
 *
 * - mock ปิด -> ยิงจริงตามปกติ
 * - mock เปิด + เจอ route -> ตอบข้อมูลตัวอย่าง
 * - mock เปิด + ไม่เจอ route -> เตือนใน console แล้วปล่อยไปยิงจริง
 *   (จะได้รู้ทันทีว่ามี endpoint ไหนยังไม่ได้ mock)
 */
export function installMockAdapter(instance: AxiosInstance): void {
  const realAdapter = axios.getAdapter(instance.defaults.adapter);

  instance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    if (!isMockEnabled()) {
      return realAdapter(config);
    }

    const match = matchMock(config);

    if (!match) {
      console.warn(
        `[mock] ยังไม่มี handler สำหรับ ${(config.method ?? 'get').toUpperCase()} ${toPath(config.url ?? '', config.baseURL)} — ส่งต่อไปยัง backend จริง`,
      );
      return realAdapter(config);
    }

    await delay(MOCK_LATENCY_MS);

    const response: AxiosResponse = {
      data: match.route.handler(match.ctx),
      status: 200,
      statusText: 'OK (mock)',
      headers: {},
      config,
    };

    return response;
  };
}

export { isMockEnabled, setMockEnabled, MOCK_STORAGE_KEY } from './mock.config';
export const MOCK_ROUTE_COUNT = ROUTES.length;
