// src/chat/chat.gateway.ts
import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { AuthUser } from '../auth/types/auth-user.type';
import { verifySocketUser } from '../auth/utils/socket-auth.util';
import { resolveCorsOrigins } from '../config/cors-origins.util';

/** socket ที่ผ่าน handshake แล้วจะมี user ติดมาด้วยเสมอ */
type AuthenticatedSocket = Socket & {
  data: { user?: AuthUser };
};

// origin เดียวกับฝั่ง HTTP ไม่ใช่ '*' — main.ts บังคับให้ตั้ง CORS_ORIGINS บน
// production และไม่ยอมรับ '*' อยู่แล้ว gateway ต้องเดินตามกติกาเดียวกัน
@WebSocketGateway({
  cors: { origin: resolveCorsOrigins(), credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 🌐 Handshake — ตรวจ JWT ก่อนอนุญาตให้ต่อ
   *
   * ตรรกะย้ายไปอยู่ที่ auth/utils/socket-auth.util.ts แล้ว เพราะ NewsGateway ต้องใช้
   * ชุดเดียวกัน (ของเดิมที่นั่นไม่ตรวจอะไรเลย) พฤติกรรมทุกข้อเหมือนเดิมทั้งหมด —
   * ไม่มี token / ไม่มี secret / token เสีย / claim ไม่ครบ = ตัดการเชื่อมต่อ
   */
  handleConnection(client: AuthenticatedSocket) {
    const user = verifySocketUser(
      client,
      this.jwtService,
      this.configService.get<string>('JWT_ACCESS_SECRET'),
      this.logger,
      'Chat',
    );

    if (!user) {
      client.disconnect();
      return;
    }

    client.data.user = user;

    this.logger.log(`User connected to chat WS: ${user.username}`);
  }

  // 🔌 เมื่อ Client ตัดการเชื่อมต่อ
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from chat WS: ${client.id}`);
  }

  // 🚪 Event สำหรับให้ Client สลับ/เข้าห้องแชทตามคู่ Asset (เช่น 'BTC/USD', 'XAU/USD')
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomName: string },
  ) {
    if (!client.data.user) {
      client.disconnect();
      return;
    }

    // ออกจากห้องเดิมทั้งหมดก่อน (ป้องกันการจมห้องแชทเก่าและข้อความซ้อน)
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id) {
        client.leave(room);
      }
    });

    client.join(payload.roomName);
    this.logger.log(`User joined chat room: ${payload.roomName}`);
  }

  // ✉️ Event รับข้อความแชทใหม่จากหน้าบ้าน
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomName: string; message: string },
  ) {
    const user = client.data.user;

    // ไม่มี user แปลว่า handshake ไม่ผ่าน — ปิดทิ้งแทนที่จะปล่อยให้เขียน DB
    // ด้วย user_id ที่ไม่มีอยู่จริง
    if (!user) {
      client.disconnect();
      return;
    }

    if (!payload.message || !payload.message.trim()) return;

    // 1. บันทึกลงฐานข้อมูล
    const savedMsg = await this.chatService.saveMessage(
      user.userId,
      payload.roomName,
      payload.message,
    );

    // 2. กระจายข้อความ (Broadcast) ไปให้ทุกคนที่เปิดหน้าจออยู่ในห้อง (roomName) เดียวกัน
    this.server.to(payload.roomName).emit('newMessage', savedMsg);
  }
}
