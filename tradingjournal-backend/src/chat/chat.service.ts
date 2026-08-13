// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // 💾 บันทึกข้อความแชทใหม่ลง Database
  async saveMessage(userId: number, roomName: string, message: string) {
    return await this.prisma.chat_messages.create({
      data: {
        room_name: roomName,
        user_id: userId,
        message: message,
      },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            full_name: true,
          },
        },
      },
    });
  }

  // 📜 ดึงประวัติข้อความเก่าในห้องแชท (จำกัดที่ 50 ข้อความล่าสุด)
  async getRoomHistory(roomName: string) {
    return await this.prisma.chat_messages.findMany({
      where: {
        room_name: roomName,
      },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 50,
    });
  }
}
