import {
  ConflictException,
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
