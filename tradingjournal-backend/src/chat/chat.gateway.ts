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
import { AuthUser, JwtAccessPayload } from '../auth/types/auth-user.type';

/** socket ที่ผ่าน handshake แล้วจะมี user ติดมาด้วยเสมอ */
type AuthenticatedSocket = Socket & {
  data: { user?: AuthUser };
};

// ตั้งค่า Gateway ให้เปิดรับ Cors จากหน้าบ้าน
@WebSocketGateway({
  cors: {
    origin: '*',
  },
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

  // 🌐 เมื่อมี Client เชื่อมต่อเข้ามา (Handshake ทำการตรวจสอบสิทธิ์ JWT Token)
  handleConnection(client: AuthenticatedSocket) {
    // ดึง Token ได้ทั้งจาก Headers หรือ Auth Payload ของ Socket.io
    const rawToken = this.extractToken(client);

    if (!rawToken) {
      this.logger.warn('Chat WS connection rejected: no token provided');
      client.disconnect();
      return;
    }

    // ใช้ JWT_ACCESS_SECRET ตัวเดียวกับที่ AuthService ใช้เซ็น access token
    // และตัวเดียวกับที่ JwtAuthGuard ใช้ตรวจฝั่ง HTTP — ระบุตรงนี้ให้ชัด
    // จะได้ไม่มีทางหล่นไปใช้ config อื่นแม้วันหลังมีใครมา register JwtModule ทับ
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      this.logger.error('JWT_ACCESS_SECRET is not configured — rejecting chat WS connection');
      client.disconnect();
      return;
    }

    let payload: JwtAccessPayload;

    try {
      payload = this.jwtService.verify<JwtAccessPayload>(rawToken, { secret });
    } catch {
      this.logger.warn('Chat WS connection rejected: invalid or expired token');
      client.disconnect();
      return;
    }

    // ตรวจ claim ชุดเดียวกับ JwtAuthGuard — ของเดิมรับ payload อะไรก็ได้ที่ decode ผ่าน
    // แล้ว handleMessage ไปหยิบ .sub ทีหลัง ถ้า token ไม่มี sub จะบันทึกข้อความ
    // ด้วย user_id เป็น undefined
    if (!payload.sub || !payload.email || !payload.username || !payload.role) {
      this.logger.warn('Chat WS connection rejected: token payload is incomplete');
      client.disconnect();
      return;
    }

    client.data.user = {
      userId: payload.userId ?? payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };

    this.logger.log(`User connected to chat WS: ${client.data.user.username}`);
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

  private extractToken(client: Socket): string | undefined {
    const raw =
      client.handshake.headers.authorization || client.handshake.auth?.token;

    if (typeof raw !== 'string' || !raw.trim()) {
      return undefined;
    }

    const value = raw.trim();

    return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : value;
  }
}
