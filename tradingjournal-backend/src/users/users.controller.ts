import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  getMe(
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.getMe(
      user.userId,
    );
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(
      user.userId,
      body,
    );
  }

  @Delete('me/avatar')
  removeAvatar(
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.removeAvatar(
      user.userId,
    );
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
    return this.usersService.getPublicProfile(
      username,
      user.userId,
    );
  }
}
