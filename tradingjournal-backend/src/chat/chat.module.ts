// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module'; // อ้างอิงตาม PrismaModule ในระบบของคุณ

/**
 * เดิมโมดูลนี้ register JwtModule ของตัวเองด้วย
 *   secret: process.env.JWT_SECRET || 'MY_SECRET_KEY_1234'
 *
 * ซึ่งมีปัญหา 2 ข้อ:
 *   1. อ่าน JWT_SECRET คนละตัวกับที่ระบบ auth ใช้เซ็น (JWT_ACCESS_SECRET) —
 *      ที่ผ่านมารอดมาได้เพราะบังเอิญตั้งค่าใน .env ให้เท่ากันพอดี ถ้าวันไหน
 *      หมุน secret ตัวใดตัวหนึ่ง แชทจะ verify token ที่ auth ออกให้ไม่ผ่านทันที
 *   2. มี fallback เป็นค่าคงที่ในโค้ด ถ้า env หลุดหาย ระบบจะยังเดินต่อเงียบๆ
 *      ด้วย secret ที่ใครก็รู้ = ปลอม token เข้าแชทได้เลย
 *
 * ตัดทิ้งทั้งก้อน แล้วใช้ JwtModule ตัวเดียวกับ AuthModule (register ไว้เป็น global)
 * จึงไม่มีทางที่ config ของแชทกับของ auth จะแยกกันได้อีก
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
