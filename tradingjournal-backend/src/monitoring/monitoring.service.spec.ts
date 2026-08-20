import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  const originalDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
  });

  it('ไม่มี SENTRY_DSN -> ปิดอยู่ และ boot ได้ตามปกติไม่ throw', () => {
    delete process.env.SENTRY_DSN;

    const service = new MonitoringService();

    expect(service.isEnabled).toBe(false);
    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('DSN เป็นช่องว่างล้วน -> นับว่ายังไม่ได้ตั้ง', () => {
    process.env.SENTRY_DSN = '   ';

    expect(new MonitoringService().isEnabled).toBe(false);
  });

  it('มี SENTRY_DSN -> เปิดใช้งาน', () => {
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';

    expect(new MonitoringService().isEnabled).toBe(true);
  });

  it('captureException ต้องไม่ throw ต่อ ไม่ว่าจะตั้ง DSN หรือไม่', () => {
    // ระบบติดตาม error ที่ทำให้แอปพังเองคือสิ่งที่แย่ที่สุด
    delete process.env.SENTRY_DSN;
    const service = new MonitoringService();

    expect(() => service.captureException(new Error('boom'))).not.toThrow();
    expect(() => service.captureException('ไม่ใช่ Error object')).not.toThrow();
    expect(() =>
      service.captureException(new Error('boom'), { userId: 7 }),
    ).not.toThrow();
  });
});
