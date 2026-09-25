/**
 * GET /users/me/export ต้องมีเพดานของตัวเองที่เข้มกว่าเพดานรวมของระบบ
 *
 * ยิงผ่าน ThrottlerGuard + ThrottlerStorage ของจริง (ไม่ mock ตัวนับ) แบบเดียวกับ
 * auth.throttle.spec.ts — ถ้าใครถอด @Throttle ออกจาก controller เทสนี้ต้องแดง
 */
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EXPORT_THROTTLE } from './constants/users.constants';
import { UsersController } from './users.controller';
import { UsersExportService } from './users-export.service';
import { UsersService } from './users.service';

const GLOBAL_LIMIT = 120;

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT }])],
    controllers: [UsersController],
    providers: [
      { provide: UsersService, useValue: {} },
      { provide: UsersExportService, useValue: {} },
      ThrottlerGuard,
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

async function callExport(
  app: INestApplication,
  ip: string,
): Promise<'ok' | 'throttled'> {
  const guard = app.get(ThrottlerGuard);
  const controller = app.get(UsersController);

  const request = {
    ip,
    ips: [],
    method: 'GET',
    url: '/users/me/export',
    headers: {},
  };

  const context = {
    getClass: () => UsersController,
    // อ้างอิง method เพื่อให้ guard อ่าน decorator metadata เท่านั้น ไม่เคยเรียกเอง
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => controller.exportMe,
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as unknown as ExecutionContext;

  try {
    await guard.canActivate(context);
  } catch (error) {
    if (error instanceof ThrottlerException) return 'throttled';
    throw error;
  }

  return 'ok';
}

describe('GET /users/me/export rate limit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('เพดานต้องเข้มกว่าเพดานรวมของระบบมาก', () => {
    expect(EXPORT_THROTTLE.limit).toBeGreaterThan(0);
    expect(EXPORT_THROTTLE.limit).toBeLessThan(GLOBAL_LIMIT / 4);
  });

  it('ยิงถึงเพดานยังผ่าน แต่เกินไป 1 ครั้งถูกบล็อก', async () => {
    const results: string[] = [];

    for (let i = 0; i < EXPORT_THROTTLE.limit; i++) {
      results.push(await callExport(app, '203.0.113.30'));
    }

    expect(results.every((r) => r === 'ok')).toBe(true);
    expect(await callExport(app, '203.0.113.30')).toBe('throttled');
  });

  it('IP อื่นไม่ได้รับผลจากคนที่โดนบล็อก', async () => {
    for (let i = 0; i <= EXPORT_THROTTLE.limit; i++) {
      await callExport(app, '203.0.113.31');
    }

    expect(await callExport(app, '198.51.100.9')).toBe('ok');
  });
});
