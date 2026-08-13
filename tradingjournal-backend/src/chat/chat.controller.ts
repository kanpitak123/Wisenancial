// src/chat/chat.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // อ้างอิงตาม Guard ที่มีในระบบคุณ

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // 📜 ดึงประวัติแชทเก่าแยกตามชื่อห้องแชท (เช่น GET http://localhost:3000/chat/history/BTC-USD)
  @Get('history/:roomName')
  async getRoomHistory(@Param('roomName') roomName: string) {
    return await this.chatService.getRoomHistory(roomName);
  }
}
