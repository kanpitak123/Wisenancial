import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import type { BrokerAuthenticatedRequest } from '../connections/broker-api-key.guard';

/**
 * Per-connection rate limit for the EA-facing MT ingestion endpoints — separate from
 * the app-wide IP-based ThrottlerGuard (registered globally in app.module.ts, still
 * applies untouched). This is the gap mt-ingestion.controller.ts's own comment has
 * flagged since Phase 2: "ควรมี rate limit แยกจาก user-facing endpoint ในอนาคต...
 * ยังไม่ implement per-connection rate limit ในเฟสนี้".
 *
 * Why a standalone guard instead of a second named entry in the shared
 * ThrottlerModule config + @SkipThrottle(): @nestjs/throttler's skip-metadata is read
 * by *every* ThrottlerGuard instance checking a route, not scoped per guard class —
 * annotating this controller to skip the global 'default' bucket for one guard would
 * make the *global* guard skip it too, which would remove the IP-based layer this
 * endpoint should keep. A small guard using the already-globally-provided
 * ThrottlerStorage directly (see ThrottlerModule's @Global() decorator) avoids that
 * coupling — both limits now apply independently, keyed differently (IP vs
 * connection id), which is the actual "separate from the user-facing endpoint" ask.
 *
 * Must run AFTER BrokerApiKeyGuard — see the @UseGuards order on
 * MtIngestionController — since it reads request.brokerConnection.id, which only
 * exists once that guard has authenticated the request.
 */
@Injectable()
export class MtConnectionThrottleGuard implements CanActivate {
  private static readonly THROTTLER_NAME = 'mt-ingest-per-connection';

  private readonly ttlMs: number;
  private readonly limit: number;

  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    private readonly configService: ConfigService,
  ) {
    const ttlSeconds = Number(this.configService.get<string>('MT_INGEST_THROTTLE_TTL_SECONDS') ?? 60);
    this.ttlMs = ttlSeconds * 1000;
    this.limit = Number(this.configService.get<string>('MT_INGEST_THROTTLE_LIMIT') ?? 30);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BrokerAuthenticatedRequest>();
    const connection = request.brokerConnection;

    // ไม่ควรเกิดขึ้นจริง — BrokerApiKeyGuard ต้องรันมาก่อนแล้วเสมอตาม @UseGuards order —
    // แต่ถ้าลำดับ guard ผิดพลาดในอนาคต ต้องปฏิเสธ ไม่ใช่ปล่อยผ่านแบบไม่มี rate limit เลย
    if (!connection) {
      throw new UnauthorizedException('ไม่พบ broker connection ที่ยืนยันตัวตนแล้ว');
    }

    const key = `mt-ingest:${connection.id}`;
    const { isBlocked } = await this.storage.increment(
      key,
      this.ttlMs,
      this.limit,
      this.ttlMs, // block for one more full window once tripped — not indefinite
      MtConnectionThrottleGuard.THROTTLER_NAME,
    );

    if (isBlocked) {
      throw new ThrottlerException();
    }

    return true;
  }
}
