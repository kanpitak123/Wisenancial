import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * เทสต์นี้ compile ทั้ง AppModule ผ่าน Nest DI container จริง (ไม่ใช่แค่ BrokersModule
 * เดี่ยวๆ) เพราะ BrokerConnectionsController ใช้ @UseGuards(JwtAuthGuard) ซึ่ง Nest
 * resolve แบบ non-strict ข้ามทั้งแอป (หา JwtService ที่ AuthModule ประกาศไว้ ไม่ใช่ต้อง
 * import AuthModule เข้า BrokersModule เอง) — ต้อง compile ทั้งแอปเหมือนที่ bootstrap()
 * จริงทำ ถึงจะจับปัญหา provider ขาดหายได้ตรงจุด ซึ่งเป็นจุดที่ `nest build` (แค่
 * type-check) จับไม่ได้เพราะไม่ได้ instantiate DI graph จริง
 *
 * mock เฉพาะ PrismaService ไม่ให้ต่อ DB จริงตอนรันเทส
 *
 * AuthModule ต้องการ JWT_ACCESS_SECRET ตอน compile เลยตั้งค่าทดสอบให้ชัดเจนเอง
 * (ไม่พึ่ง .env จริง — CI ไม่มีไฟล์ .env) แล้วคืนค่าเดิมหลังจบเทส
 */
describe('AppModule (with BrokersModule wired in)', () => {
  const originalJwtSecret = process.env.JWT_ACCESS_SECRET;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-only-jwt-access-secret';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = originalJwtSecret;
    }
  });

  it('compile ผ่าน Nest DI container ได้โดยไม่มี provider ขาดหาย', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  }, 20000);
});
