import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'; // 👈 เพิ่ม Import ตัวนี้เข้ามา
import { NestExpressApplication } from '@nestjs/platform-express'; // 👈 1. Import ตัวนี้
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // refresh token อยู่ใน httpOnly cookie เบราว์เซอร์จะแนบมาให้ก็ต่อเมื่อ credentials
  // เปิดอยู่เท่านั้น และสเปก CORS ห้ามใช้ credentials คู่กับ origin '*' (ซึ่งคือค่าที่
  // enableCors() เปล่าๆ ให้มาแต่เดิม) จึงต้องระบุ origin ให้ชัด
  //
  // อ่านจาก CORS_ORIGINS (คั่นด้วย comma) ก่อน ไม่มีก็ถอยไปใช้ FRONTEND_URL ที่ตั้งไว้อยู่แล้ว
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.FRONTEND_URL ??
    'http://localhost:9000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
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

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Trading Journal API')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
