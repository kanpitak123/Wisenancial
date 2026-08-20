import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
        email: true,
        role: true,
        avatar_url: true,
        bio: true,
        subscription_tier: true,
        created_at: true,
        updated_at: true,
        points_balance: true,
        ai_token_balance: true,
        current_streak: true,
        longest_streak: true,
        subscriptions: {
          where: {
            status: 'ACTIVE',
            end_date: {
              gte: new Date(),
            },
          },
          orderBy: { end_date: 'desc' },
          take: 1,
          select: {
            status: true,
            start_date: true,
            end_date: true,
            plans: {
              select: {
                id: true,
                name: true,
                price: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('ไม่พบบัญชีผู้ใช้');
    }

    const activeSubscription = user.subscriptions[0] ?? null;

    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      bio: user.bio,
      subscription_tier: user.subscription_tier,
      created_at: user.created_at,
      updated_at: user.updated_at,
      points_balance: user.points_balance,
      ai_token_balance: user.ai_token_balance,
      current_streak: user.current_streak,
      longest_streak: user.longest_streak,
      plan: activeSubscription
        ? {
            id: activeSubscription.plans?.id ?? null,
            name: activeSubscription.plans?.name ?? 'Unknown',
            price: Number(activeSubscription.plans?.price ?? 0),
            description:
              activeSubscription.plans?.description ?? null,
            status: activeSubscription.status,
            start_date: activeSubscription.start_date,
            end_date: activeSubscription.end_date,
          }
        : null,
    };
  }

  async updateProfile(userId: number, data: UpdateUserDto) {
    const username = data.username?.trim();
    const fullName = data.full_name?.trim();
    const bio = data.bio?.trim();

    if (username) {
      const existingUser = await this.prisma.users.findFirst({
        where: {
          username,
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
      }
    }

    try {
      const updatedUser = await this.prisma.users.update({
        where: { id: userId },
        data: {
          ...(username !== undefined && { username }),
          ...(fullName !== undefined && { full_name: fullName }),
          ...(bio !== undefined && { bio: bio || null }),
          ...(data.avatar_url !== undefined && {
            avatar_url: data.avatar_url,
          }),
          ...(data.is_public_profile !== undefined && {
            is_public_profile: data.is_public_profile,
          }),
        },
        select: {
          id: true,
          username: true,
          full_name: true,
          email: true,
          role: true,
          avatar_url: true,
          bio: true,
          subscription_tier: true,
          is_public_profile: true,
          updated_at: true,
        },
      });

      return {
        message: 'อัปเดตโปรไฟล์สำเร็จ',
        user: updatedUser,
      };
    } catch (error: unknown) {
      this.rethrowKnownPrismaError(error);
      throw error;
    }
  }

  /**
   * โปรไฟล์สาธารณะของผู้ใช้คนอื่น (GET /users/profile/:username)
   *
   * คอลัมน์ users.is_public_profile กับ username @unique มีใน schema มาตั้งแต่ต้น
   * แต่ยังไม่เคยมี endpoint มาอ่าน — ตัวนี้มาปิดช่องนั้น ไม่ได้แก้ schema
   *
   * viewerUserId ใช้ตัดสินสองอย่าง:
   *   1. เจ้าของดูโปรไฟล์ตัวเองได้เสมอ แม้จะยังปิดเป็นส่วนตัวอยู่ ไม่งั้นจะเปิดหน้า
   *      ไปกดสวิตช์เปิดสาธารณะไม่ได้เลย (ไก่กับไข่)
   *   2. ส่งธง is_owner กลับไปให้หน้าบ้านรู้ว่าควรโชว์การ์ดตั้งค่าความเป็นส่วนตัวไหม
   */
  async getPublicProfile(username: string, viewerUserId: number) {
    const user = await this.prisma.users.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar_url: true,
        bio: true,
        subscription_tier: true,
        is_public_profile: true,
        current_streak: true,
        created_at: true,
        portfolios: {
          select: {
            current_balance: true,
            // ถือจริงเท่านั้น — ของเดิมนับรวมไม้ที่ขายไปแล้วด้วย ทำให้โปรไฟล์
            // สาธารณะโชว์หุ้นที่เจ้าตัวไม่ได้ถืออยู่แล้ว
            stock_purchases: {
              where: { remaining_shares: { gt: 0 } },
              select: { stock_symbol: true },
            },
            // P&L ที่รับรู้แล้วของฝั่งหุ้น — ของเดิมบวกแค่ trades.pnl (ฝั่ง Forex)
            // ทำให้พอร์ตโหมด Stock ได้ 0 เสมอ
            stock_sales: {
              select: { realized_pnl: true },
            },
            trades: {
              select: { pnl: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้นี้');
    }

    const isOwner = user.id === viewerUserId;

    if (!user.is_public_profile && !isOwner) {
      throw new ForbiddenException('โปรไฟล์นี้ตั้งเป็นส่วนตัว');
    }

    const heldStocks = new Set<string>();
    let totalAssetValue = 0;
    let totalPnl = 0;

    for (const portfolio of user.portfolios) {
      totalAssetValue += Number(portfolio.current_balance);

      for (const purchase of portfolio.stock_purchases) {
        heldStocks.add(purchase.stock_symbol);
      }

      for (const sale of portfolio.stock_sales) {
        totalPnl += Number(sale.realized_pnl);
      }

      for (const trade of portfolio.trades) {
        totalPnl += Number(trade.pnl ?? 0);
      }
    }

    return {
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      subscription_tier: user.subscription_tier,
      is_public_profile: user.is_public_profile,
      is_owner: isOwner,
      current_streak: user.current_streak,
      member_since: user.created_at,
      held_stocks: [...heldStocks].sort(),
      total_asset_value: totalAssetValue,
      total_pnl: totalPnl,
      portfolio_count: user.portfolios.length,
    };
  }

  async removeAvatar(userId: number) {
    try {
      const user = await this.prisma.users.update({
        where: { id: userId },
        data: {
          avatar_url: null,
        },
        select: {
          id: true,
          avatar_url: true,
          updated_at: true,
        },
      });

      return {
        message: 'ลบรูปโปรไฟล์สำเร็จ',
        user,
      };
    } catch (error: unknown) {
      this.rethrowKnownPrismaError(error);
      throw error;
    }
  }

  private rethrowKnownPrismaError(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('ไม่พบบัญชีผู้ใช้');
    }
  }
}
