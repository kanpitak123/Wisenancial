import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * ชั้นห่อ error monitoring (Sentry) — ตอนนี้เป็น "stub" ที่ยังไม่ผูก SDK จริง
 *
 * ทำไมถึงยังไม่ลง @sentry/node: การลง SDK จริงต้องมีบัญชี Sentry + DSN ก่อนถึงจะ
 * ทดสอบได้ว่าทำงานจริงไหม ซึ่งอยู่นอกขอบเขตของงานเตรียมโค้ดรอบนี้ ตัวนี้จึงทำหน้าที่
 * เป็น "รูที่เสียบปลั๊กได้" — โค้ดที่เหลือเรียก captureException() ได้เลยตั้งแต่วันนี้
 * และวันที่พร้อมใช้ Sentry จริงก็แก้แค่ไฟล์เดียว ไม่ต้องไล่แก้จุดเรียกทั้งโปรเจกต์
 *
 * พฤติกรรม:
 *   - ไม่มี SENTRY_DSN  -> log ลง console ตามปกติ (ไม่ throw ไม่ crash)
 *   - มี SENTRY_DSN     -> log ลง console + เตือนว่า SDK ยังไม่ได้ติดตั้ง
 *                          จะได้ไม่เข้าใจผิดว่า error ถูกส่งขึ้น Sentry แล้ว
 */
@Injectable()
export class MonitoringService implements OnModuleInit {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly dsn = process.env.SENTRY_DSN?.trim() ?? '';

  get isEnabled(): boolean {
    return this.dsn.length > 0;
  }

  onModuleInit(): void {
    if (!this.isEnabled) {
      this.logger.log(
        'SENTRY_DSN not set — error monitoring falls back to console logging',
      );
      return;
    }

    // ⚠️ จุดเดียวที่ต้องแก้เมื่อพร้อมใช้ Sentry จริง:
    //    1. npm install @sentry/node
    //    2. Sentry.init({ dsn: this.dsn, environment: process.env.NODE_ENV,
    //                     tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0) })
    //    3. เปลี่ยน captureException() ให้เรียก Sentry.captureException()
    this.logger.warn(
      'SENTRY_DSN is set but the Sentry SDK is not installed — ' +
        'errors are still only going to the console. See monitoring.service.ts.',
    );
  }

  /** ส่ง error เข้าระบบติดตาม — ตอนนี้คือ console */
  captureException(error: unknown, context?: Record<string, unknown>): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      context ? `${message} ${JSON.stringify(context)}` : message,
      stack,
    );
  }

  /** ส่งข้อความระดับเตือน (ไม่ใช่ error เต็มรูปแบบ) */
  captureMessage(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(
      context ? `${message} ${JSON.stringify(context)}` : message,
    );
  }
}
