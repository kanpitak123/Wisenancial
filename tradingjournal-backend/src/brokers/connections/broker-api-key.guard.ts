import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { BrokerConnectionStatus, broker_connections } from '@prisma/client';
import { Request } from 'express';
import { BrokerConnectionsService } from './broker-connections.service';

export interface BrokerAuthenticatedRequest extends Request {
  brokerConnection: broker_connections;
}

/**
 * Auth guard สำหรับ endpoint ที่ EA เรียกเข้ามาเอง (heartbeat ตอนนี้, ingest ในอนาคต) — ใช้
 * API key แบบ Bearer แทน JWT เพราะ MQL ไม่มี OAuth client capability ในตัว (ดู
 * TRADING_PLATFORM_INTEGRATION_SPEC.md หัวข้อ 5.6) แนบ connection ที่ยืนยันแล้วไว้ใน
 * request.brokerConnection ให้ controller ใช้ต่อได้โดยไม่ต้อง query ซ้ำ
 *
 * ข้อบังคับด้านความปลอดภัย: connection ที่ status = REVOKED ต้องถูกปฏิเสธที่นี่เสมอ ก่อน
 * ถึง handler ใดๆ ทั้งสิ้น — ห้ามให้ REVOKED กลับมาใช้งานได้อีกผ่านทางไหนก็ตามที่เข้ามาทาง
 * guard ตัวนี้ (rotate-key ผ่าน BrokerConnectionsController ต่างหาก ใช้ JWT ไม่ใช่ guard นี้
 * และเป็นการกระทำที่ผู้ใช้ตั้งใจทำเอง ไม่ใช่ replay ของ key เก่า)
 */
@Injectable()
export class BrokerApiKeyGuard implements CanActivate {
  constructor(private readonly connections: BrokerConnectionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BrokerAuthenticatedRequest>();
    const rawKey = this.extractKey(request);

    if (!rawKey) {
      throw new UnauthorizedException('ไม่พบ API key');
    }

    const connection = await this.connections.findByRawApiKey(rawKey);

    if (!connection) {
      throw new UnauthorizedException('API key ไม่ถูกต้อง');
    }

    if (connection.status === BrokerConnectionStatus.REVOKED) {
      throw new UnauthorizedException('Connection นี้ถูก revoke แล้ว');
    }

    request.brokerConnection = connection;

    return true;
  }

  private extractKey(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.trim().split(/\s+/) ?? [];

    return type === 'Bearer' && token ? token : undefined;
  }
}
