// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module'; // อ้างอิงตาม PrismaModule ในระบบของคุณ
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      // 💡 ใส่ Secret Key ให้ตรงกับ Auth Module หลักของคุณ
      secret: process.env.JWT_SECRET || 'MY_SECRET_KEY_1234',
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
