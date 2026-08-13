import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaidTierGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { userId?: number; id?: number; sub?: number };
    }>();

    const userId =
      request.user?.userId ?? request.user?.id ?? request.user?.sub;
    if (!userId) throw new ForbiddenException('ไม่พบข้อมูลผู้ใช้');

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        subscription_tier: true,
        subscriptions: {
          where: { status: 'ACTIVE', end_date: { gte: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) throw new ForbiddenException('ไม่พบบัญชีผู้ใช้');

    if (user.subscription_tier === null && user.subscriptions.length === 0) {
      throw new ForbiddenException('ฟีเจอร์นี้ใช้ได้เฉพาะสมาชิกแบบชำระเงิน');
    }

    return true;
  }
}
