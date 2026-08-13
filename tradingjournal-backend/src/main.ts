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
  app.enableCors();

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
