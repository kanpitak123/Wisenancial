import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = 'ok' | 'degraded';
export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: HealthStatus;
  /** ISO timestamp ตอนที่ตรวจ ไม่ใช่ตอน deploy */
  timestamp: string;
  /** วินาทีที่โปรเซสนี้รันมา — ใช้ดูว่าเพิ่ง restart ไปหรือเปล่า */
  uptimeSeconds: number;
  version: string;
  environment: string;
  dependencies: {
    database: {
      status: DependencyStatus;
      /** เวลาที่ใช้ในการ query จริงเป็น ms — ค่าที่พุ่งขึ้นคือสัญญาณเตือนก่อนล่ม */
      latencyMs: number | null;
    };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ตรวจสุขภาพระบบสำหรับ load balancer / uptime monitor
   *
   * ยิง `SELECT 1` จริงแทนการเช็คว่ามี client object อยู่ไหม เพราะ PrismaClient
   * ยัง "มีอยู่" ได้แม้ connection pool จะตายไปแล้ว ถ้าไม่ยิงจริงจะได้ ok ตลอด
   * ทั้งที่ DB ล่ม ซึ่งอันตรายกว่าไม่มี health check เลย
   *
   * DB ล่ม -> คืน degraded (ไม่ throw) ให้คอนโทรลเลอร์เป็นคนตัดสินใจเรื่อง HTTP status
   */
  async check(): Promise<HealthReport> {
    const startedAt = Date.now();
    let databaseStatus: DependencyStatus = 'down';
    let latencyMs: number | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'up';
      latencyMs = Date.now() - startedAt;
    } catch (error) {
      this.logger.error(
        'Health check: database is unreachable',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      status: databaseStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? 'unknown',
      environment: process.env.NODE_ENV ?? 'development',
      dependencies: {
        database: { status: databaseStatus, latencyMs },
      },
    };
  }
}
