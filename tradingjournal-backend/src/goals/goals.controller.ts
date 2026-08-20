import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  /**
   * เดิมสองเมธอดนี้อ่าน `req.user.sub` แต่ JwtAuthGuard ใส่ `{ userId, email,
   * username, role }` ลง request.user — ไม่มี `sub` เลย ค่าที่ส่งเข้า service จึงเป็น
   * undefined เสมอ และ Prisma ตีความ `user_id: undefined` ว่า "ไม่ต้องกรองด้วยเงื่อนไขนี้"
   * ผลคือด่านเช็คสิทธิ์ใน GoalsService ผ่านตลอด ใครก็ตามที่ล็อกอินอยู่จึงอ่านและ
   * เขียนทับเป้าหมายรายเดือนของพอร์ตคนอื่นได้ถ้ารู้เลข id
   *
   * เปลี่ยนมาใช้ @CurrentUser() ชุดเดียวกับคอนโทรลเลอร์อื่นทั้งโปรเจกต์
   * (coach.controller.ts รอดมาได้เพราะเขียน `req.user?.sub ?? req.user?.userId`)
   */
  @Get('portfolio/:id')
  getGoal(
    @Param('id', ParseIntPipe) portfolioId: number,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.goalsService.getGoal(user.userId, portfolioId, +year, +month);
  }

  @Post('portfolio/:id')
  setGoal(
    @Param('id', ParseIntPipe) portfolioId: number,
    @Body() body: { year: number; month: number; target: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.goalsService.setGoal(
      user.userId,
      portfolioId,
      body.year,
      body.month,
      body.target,
    );
  }
}
