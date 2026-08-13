// src/chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';

// ตั้งค่า Gateway ให้เปิดรับ Cors จากหน้าบ้าน
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  // 🌐 เมื่อมี Client เชื่อมต่อเข้ามา (Handshake ทำการตรวจสอบสิทธิ์ JWT Token)
  async handleConnection(client: Socket) {
    try {
      // ดึง Token ได้ทั้งจาก Headers หรือ Auth Payload ของ Socket.io
      const authHeader =
        client.handshake.headers.authorization || client.handshake.auth?.token;

      if (!authHeader) {
        console.log('❌ Chat WS Connection Rejected: No Token Provided');
        client.disconnect();
        return;
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;
      // ถอดรหัส JWT ตรวจสอบผู้ใช้งาน
      const decoded = this.jwtService.verify(token);

      // เก็บข้อมูล User ไว้ใน Object ของ Socket Client นั้นๆ เพื่อดึงมาใช้ง่ายๆ
      client.data.user = decoded;
      console.log(
        `🔌 User connected to chat WS: ${decoded.username || decoded.sub}`,
      );
    } catch (err) {
      console.log('❌ Chat WS Connection Rejected: Invalid Token');
      client.disconnect();
    }
  }

  // 🔌 เมื่อ Client ตัดการเชื่อมต่อ
  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected from chat WS: ${client.id}`);
  }

  // 🚪 Event สำหรับให้ Client สลับ/เข้าห้องแชทตามคู่ Asset (เช่น 'BTC/USD', 'XAU/USD')
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string },
  ) {
    // ออกจากห้องเดิมทั้งหมดก่อน (ป้องกันการจมห้องแชทเก่าและข้อความซ้อน)
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id) {
        client.leave(room);
      }
    });

    client.join(payload.roomName);
    console.log(`🚪 User joined chat room: ${payload.roomName}`);
  }

  // ✉️ Event รับข้อความแชทใหม่จากหน้าบ้าน
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string; message: string },
  ) {
    const userId = client.data.user.sub || client.data.user.id; // อ้างอิงตาม Payload โครงสร้าง Jwt ของคุณ

    if (!payload.message || !payload.message.trim()) return;

    // 1. บันทึกลงฐานข้อมูล
    const savedMsg = await this.chatService.saveMessage(
      userId,
      payload.roomName,
      payload.message,
    );

    // 2. กระจายข้อความ (Broadcast) ไปให้ทุกคนที่เปิดหน้าจออยู่ในห้อง (roomName) เดียวกัน
    this.server.to(payload.roomName).emit('newMessage', savedMsg);
  }
}
