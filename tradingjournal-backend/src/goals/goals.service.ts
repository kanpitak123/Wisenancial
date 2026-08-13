import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  // 1. ดึงเป้าหมายของเดือนนั้นๆ
  async getGoal(
    userId: number,
    portfolioId: number,
    year: number,
    month: number,
  ) {
    // เช็คสิทธิ์ก่อน
    const port = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
    });
    if (!port) throw new UnauthorizedException('ไม่มีสิทธิ์เข้าถึง');

    // ใช้ findFirst แทน findUnique เพื่อหลบปัญหาเรื่อง Unique Index
    const goal = await this.prisma.goals.findFirst({
      where: {
        portfolio_id: portfolioId,
        year: year,
        month: month,
      },
    });

    // ✅ เปลี่ยนจาก target_amount เป็น target_profit
    return goal ? Number(goal.target_profit) : 0;
  }

  // 2. สร้างหรืออัปเดตเป้าหมาย
  async setGoal(
    userId: number,
    portfolioId: number,
    year: number,
    month: number,
    target: number,
  ) {
    // เช็คสิทธิ์ก่อน
    const port = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
    });
    if (!port) throw new UnauthorizedException('ไม่มีสิทธิ์เข้าถึง');

    // ค้นหาเป้าหมายเดิมก่อน
    const existingGoal = await this.prisma.goals.findFirst({
      where: {
        portfolio_id: portfolioId,
        year: year,
        month: month,
      },
    });

    if (existingGoal) {
      // ถ้าเดือนนี้ตั้งเป้าหมายไว้แล้ว -> ให้อัปเดตของเดิม
      return this.prisma.goals.update({
        where: { id: existingGoal.id }, // อัปเดตผ่าน ID ชัวร์สุด
        data: {
          target_profit: target, // ✅ ใช้ target_profit ตาม DB ของคุณ
        },
      });
    } else {
      // ถ้าเดือนนี้ยังไม่เคยตั้งเป้าหมาย -> ให้สร้างใหม่เลย
      return this.prisma.goals.create({
        data: {
          portfolio_id: portfolioId,
          year: year,
          month: month,
          target_profit: target, // ✅ ใช้ target_profit
        },
      });
    }
  }
}
