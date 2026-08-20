import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

const prismaMock = { $queryRaw: jest.fn() };

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('DB ตอบได้ -> ok และรายงาน latency', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.dependencies.database.status).toBe('up');
    expect(report.dependencies.database.latencyMs).not.toBeNull();
  });

  it('ยิง query จริง ไม่ใช่แค่ดูว่ามี client อยู่ไหม', async () => {
    // PrismaClient ยัง "มีอยู่" ได้แม้ connection pool ตายไปแล้ว
    // ถ้าไม่ยิงจริงจะได้ ok ตลอดทั้งที่ DB ล่ม
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await service.check();

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it('DB ล่ม -> degraded แต่ไม่ throw (คอนโทรลเลอร์เป็นคนตัดสิน HTTP status)', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.dependencies.database.status).toBe('down');
    expect(report.dependencies.database.latencyMs).toBeNull();
  });

  it('ไม่เผยข้อมูลลับใน payload (connection string / host / จำนวนผู้ใช้)', async () => {
    // endpoint นี้เปิดสาธารณะ ถ้าหลุด connection string ออกไปคือจบเลย
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const body = JSON.stringify(await service.check());

    expect(body).not.toMatch(/postgres:\/\//i);
    expect(body).not.toMatch(/password/i);
    expect(body).not.toMatch(/DATABASE_URL/i);
  });
});
