import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { EXPORT_THROTTLE } from './constants/users.constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersExportService } from './users-export.service';
import { UsersService } from './users.service';

const exportThrottle = {
  default: { limit: EXPORT_THROTTLE.limit, ttl: EXPORT_THROTTLE.ttlMs },
};

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersExportService: UsersExportService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() body: UpdateUserDto) {
    return this.usersService.updateProfile(user.userId, body);
  }

  /**
   * ข้อมูลทั้งหมดของผู้ใช้เองเป็น JSON ก้อนเดียว — ใช้ userId จาก token เสมอ
   * ไม่รับ id จาก client จึงดึงของคนอื่นไม่ได้
   *
   * no-store: ไฟล์นี้มีข้อมูลการเงินส่วนตัว ห้าม proxy/เบราว์เซอร์เก็บแคชไว้
   */
  @Throttle(exportThrottle)
  @Get('me/export')
  async exportMe(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bundle = await this.usersExportService.buildExport(user.userId);

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="wisenancial-export-${bundle.exported_at.slice(0, 10)}.json"`,
    );

    return bundle;
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.usersService.removeAvatar(user.userId);
  }

  /**
   * โปรไฟล์สาธารณะของผู้ใช้คนอื่น
   *
   * ยังอยู่หลัง JwtAuthGuard ระดับคลาสเหมือน route อื่นในคอนโทรลเลอร์นี้ —
   * "สาธารณะ" ในที่นี้คือ "คนอื่นในระบบดูได้" ไม่ใช่เปิดให้คนนอกที่ยังไม่ล็อกอิน
   * (ของเดิมก็วางไว้ในคอนโทรลเลอร์เดียวกันและหน้าจออยู่ใน /app เหมือนกัน)
   *
   * ประกาศทีหลัง 'me' ได้ไม่ชนกัน เพราะเป็นคนละ path segment
   */
  @Get('profile/:username')
  getPublicProfile(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ) {
    return this.usersService.getPublicProfile(username, user.userId);
  }
}
