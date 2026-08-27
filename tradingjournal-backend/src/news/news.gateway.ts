import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { verifySocketUser } from '../auth/utils/socket-auth.util';
import { resolveCorsOrigins } from '../config/cors-origins.util';
import { NewsScope } from './dto/news-query.dto';

/**
 * origin เดียวกับฝั่ง HTTP ไม่ใช่ '*'
 *
 * ของเดิม hardcode `origin: '*'` ไว้ ทั้งที่ main.ts บังคับให้ตั้ง CORS_ORIGINS
 * บน production และไม่ยอมรับ '*' — ประตูหน้าล็อกแต่ประตูข้างเปิดค้าง
 */
@WebSocketGateway({
  cors: { origin: resolveCorsOrigins(), credentials: true },
})
export class NewsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NewsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * ต้องล็อกอินก่อนถึงจะรับ broadcast ได้
   *
   * news.controller.ts:16 ใส่ JwtAuthGuard ทั้ง controller อยู่แล้ว แต่ gateway นี้
   * เดิมไม่ตรวจอะไรเลย เนื้อหาชุดเดียวกันจึงรั่วออกทาง WebSocket ให้ใครก็ได้ —
   * รวม `news_ai_enriched` ซึ่งเป็นผลจากการเรียกโมเดลที่ระบบจ่ายเงินไปแล้ว
   */
  handleConnection(client: Socket) {
    const user = verifySocketUser(
      client,
      this.jwtService,
      this.configService.get<string>('JWT_ACCESS_SECRET'),
      this.logger,
      'News',
    );

    if (!user) {
      client.disconnect();
      return;
    }

    client.data.user = user;
  }

  broadcastNewsUpdate(
    event: 'new_news' | 'news_data_changed' | 'news_ai_enriched',
    scope: Exclude<NewsScope, NewsScope.ALL>,
    data: unknown,
  ) {
    this.server.emit(event, { scope, data });
  }
}
