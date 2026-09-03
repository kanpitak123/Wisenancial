import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthUser } from '../../auth/types/auth-user.type';
import { BrokerConnectionsService } from './broker-connections.service';
import { CreateBrokerConnectionDto } from './dto/create-broker-connection.dto';

/**
 * จัดการ broker connection ของผู้ใช้เอง — ทุก endpoint ยืนยันสิทธิ์ด้วย user.userId จาก
 * JWT (@CurrentUser()) เท่านั้น ไม่รับ userId จาก body/param ตาม pattern เดิมของโปรเจกต์
 * (ดู tax.controller.ts) — ทุก query ที่แตะแถวเดี่ยวกรองด้วย user_id ในตัว WHERE clause
 * เสมอ ไม่ใช่ fetch-by-id-then-check-owner-after เพื่อกัน IDOR แบบที่เคยเกิดใน
 * goals.controller.ts มาก่อน (อ่าน req.user.sub ที่ไม่มีจริง ทำให้เช็คสิทธิ์ผ่านตลอด)
 *
 * plaintext API key คืนกลับให้ผู้ใช้เห็นได้แค่ตอน create() กับ rotateKey() เท่านั้น —
 * DB เก็บแค่ hash ไม่มีทางกู้ค่านี้คืนมาแสดงซ้ำได้อีกเลย (ดู BrokerApiKeyService)
 */
@UseGuards(JwtAuthGuard)
@Controller('brokers/connections')
export class BrokerConnectionsController {
  constructor(private readonly connections: BrokerConnectionsService) {}

  @Post()
  create(@Body() dto: CreateBrokerConnectionDto, @CurrentUser() user: AuthUser) {
    return this.connections.create(user.userId, dto.broker_type, dto.portfolio_id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.connections.list(user.userId);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.connections.getOwned(id, user.userId);
  }

  @Post(':id/revoke')
  revoke(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.connections.revoke(id, user.userId);
  }

  @Post(':id/rotate-key')
  rotateKey(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.connections.rotateKey(id, user.userId);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await this.connections.softDelete(id, user.userId);

    return { message: 'ลบ broker connection แล้ว' };
  }
}
