import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'; // 👈 เพิ่ม Import ตัวนี้เข้ามา
import { NestExpressApplication } from '@nestjs/platform-express'; // 👈 1. Import ตัวนี้
import { assertCorsOriginsValid } from './config/cors-origins.util';
import { assertProductionEnv } from './config/env.validation';
import { resolveTrustProxy } from './config/trust-proxy.util';
import { uploadsRoot } from './storage/storage.service';
import {
  buildHelmetOptions,
  isSwaggerEnabled,
} from './config/http-security.util';
import {
  MT5_INGEST_ROUTE_PATH,
  createMt5IngestBodyParser,
} from './brokers/ingestion/mt5-ingest-body-limit';

async function bootstrap() {
  // production: ตรวจ env ที่จำเป็นทั้งหมดก่อนทำอย่างอื่น แล้วรายงานปัญหาทุกข้อในครั้งเดียว
  // (ก่อนหน้านี้ JWT_REFRESH_SECRET / Stripe / Anthropic ไปพังตอนมีผู้ใช้เรียกใช้จริง)
  assertProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // อยู่หลัง load balancer ต้องบอก Express ว่าเชื่อ X-Forwarded-For กี่ชั้น ไม่งั้น req.ip เป็น IP ของ
  // proxy ตัวเดียวสำหรับทุกคน แล้ว rate limit (แบบ IP) จะนับรวมผู้ใช้ทั้งระบบเป็นคนเดียว
  // ดู trust-proxy.util.ts (TRUST_PROXY: ไม่ตั้ง = 1 บน production, ปิดตอน dev)
  app.set('trust proxy', resolveTrustProxy());

  // ตอน deploy ใหม่ โฮสต์ส่ง SIGTERM มา — เปิด shutdown hooks เพื่อให้ Nest รอ request ที่กำลังทำอยู่
  // แล้วเรียก onModuleDestroy (ปิดการเชื่อมต่อ Prisma) แทนที่จะโดนตัดกลางคัน
  app.enableShutdownHooks();

  // security headers (HSTS, nosniff, frame options, ...) — ดู http-security.util.ts
  const swaggerEnabled = isSwaggerEnabled();
  app.use(helmet(buildHelmetOptions(swaggerEnabled)));

  // ต้องแขวนก่อน Nest's own global body-parser (ซึ่งถูก register ตอน app.listen()/init()
  // ทีหลังเสมอ) — express middleware ทำงานตามลำดับที่ .use() ถูกเรียก ตัวนี้ยิงก่อนจึง
  // parse body ของ route นี้ด้วย limit ที่กว้างกว่าไปเลย แล้ว global parser ที่ตามมาจะเห็น
  // request เสร็จสิ้นแล้ว (onFinished) และข้ามไปเฉยๆ ไม่ parse ซ้ำ — ดู
  // mt5-ingest-body-limit.ts สำหรับเหตุผลที่มาของตัวเลข limit
  app.use(MT5_INGEST_ROUTE_PATH, createMt5IngestBodyParser());
  // refresh token อยู่ใน httpOnly cookie เบราว์เซอร์จะแนบมาให้ก็ต่อเมื่อ credentials
  // เปิดอยู่เท่านั้น และสเปก CORS ห้ามใช้ credentials คู่กับ origin '*' (ซึ่งคือค่าที่
  // enableCors() เปล่าๆ ให้มาแต่เดิม) จึงต้องระบุ origin ให้ชัด
  //
  // อ่านจาก CORS_ORIGINS (คั่นด้วย comma) ก่อน ไม่มีก็ถอยไปใช้ FRONTEND_URL
  // กติกาเดียวกันนี้ถูกใช้กับ WebSocket gateway ด้วย (ดู cors-origins.util.ts)
  // ตอน dev ถอยไป localhost:9000 ให้ใช้งานได้ทันที แต่ production ห้ามถอย —
  // ตายตั้งแต่ boot ดีกว่าปล่อยขึ้นไปรันโดยอนุญาต origin ของเครื่อง dev ค้างอยู่
  const corsOrigins = assertCorsOriginsValid();

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useStaticAssets(uploadsRoot(), {
    prefix: '/uploads',
  });

  // 👈 เพิ่ม Global Validation Pipe เพื่อให้ @Length(1, 500) ใน DTO ทำงานได้จริง
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัดฟิลด์ที่หน้าบ้านส่งมาเกินและไม่มีใน DTO ทิ้งอัตโนมัติ
      forbidNonWhitelisted: true, // แจ้ง Error กลับทันทีถ้าหน้าบ้านแอบส่งฟิลด์แปลกปลอมมา
      transform: true, // แปลงชนิดข้อมูลให้ตรงกับประเภทที่ระบุไว้ใน DTO
    }),
  );

  // Swagger — ไม่มี auth และเปิดเผยทุก route/DTO จึงปิดบน production เว้นแต่ SWAGGER_ENABLED=true
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Trading Journal API')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  // พอร์ตต้องมาจาก env — ผู้ให้บริการโฮสต์ส่วนใหญ่กำหนด PORT มาให้เองและ
  // จะฆ่าโปรเซสที่ไป bind พอร์ตอื่น
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);
}
bootstrap();
