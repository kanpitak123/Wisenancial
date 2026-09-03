import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { verifySocketUser } from '../auth/utils/socket-auth.util';
import { resolveCorsOrigins } from '../config/cors-origins.util';
import { Mt5EventType } from './ingestion/dto/mt5-ingest.dto';

/**
 * Phase 3L — realtime notification when an MT5 sync event actually mutates a
 * user's trades/records (positions upserted/closed-by-absence, or at least
 * one new deal applied). No trade payload is sent over the socket on
 * purpose — this is a "something changed, go refetch" signal only, not a
 * second serialization path for trade data. The frontend listens for
 * `mt5_sync_update` and re-calls the existing authenticated REST endpoints
 * it already uses today.
 */
export interface Mt5SyncUpdateEvent {
  connectionId: number;
  eventType: Mt5EventType.ACCOUNT_SNAPSHOT | Mt5EventType.POSITIONS_SNAPSHOT | Mt5EventType.DEALS | Mt5EventType.RECONCILE;
  portfolioId: number;
  upsertedCount?: number;
  closedByAbsenceCount?: number;
  appliedDealsCount?: number;
}

function userRoom(userId: number): string {
  return `user:${userId}`;
}

// origin เดียวกับฝั่ง HTTP/gateway อื่นๆ (ChatGateway/NewsGateway) ไม่ใช่ '*' —
// ดู news.gateway.ts สำหรับเหตุผลเต็ม
@WebSocketGateway({
  cors: { origin: resolveCorsOrigins(), credentials: true },
})
export class BrokerSyncGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BrokerSyncGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * ต่างจาก ChatGateway ตรงที่ไม่มี explicit joinRoom — ข้อมูล MT5 sync เป็นของ
   * ส่วนตัวรายผู้ใช้เสมอ (ไม่มีแนวคิด "เลือกห้อง" แบบ chat rooms ต่อ asset pair)
   * จึง auto-join ห้องส่วนตัวของตัวเอง (`user:<userId>`) ทันทีที่ handshake ผ่าน
   * ใช้ userId จาก JWT ที่ verify แล้วเท่านั้น — ไม่เคยเชื่อค่าที่ client ส่งมาเอง
   */
  handleConnection(client: Socket) {
    const user = verifySocketUser(
      client,
      this.jwtService,
      this.configService.get<string>('JWT_ACCESS_SECRET'),
      this.logger,
      'BrokerSync',
    );

    if (!user) {
      client.disconnect();
      return;
    }

    client.data.user = user;
    client.join(userRoom(user.userId));
  }

  /**
   * เรียกจาก Mt5SyncService เท่านั้น หลัง sync event ที่ "เขียนจริง" สำเร็จ — ดู
   * เงื่อนไขการเรียกที่จุดเรียกจริงใน mt5-sync.service.ts (ต้อง accepted/appliedCount>0
   * ไม่เรียกทุกครั้งที่ ingest สำเร็จเฉยๆ เพราะ heartbeat/duplicate/stale ไม่มีอะไร
   * เปลี่ยนแปลงจริงให้ frontend ต้อง refetch)
   */
  broadcastMt5SyncUpdate(userId: number, event: Mt5SyncUpdateEvent): void {
    this.server.to(userRoom(userId)).emit('mt5_sync_update', event);
  }
}
