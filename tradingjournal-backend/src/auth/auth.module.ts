import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,

    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');

        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is required');
        }

        const configuredExpiresIn =
          configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
          AUTH_CONSTANTS.defaultAccessTokenExpiresIn;

        const expiresInSeconds = thisToSeconds(configuredExpiresIn);

        return {
          secret,
          signOptions: {
            expiresIn: expiresInSeconds,
          },
        };
      },
    }),
  ],

  providers: [AuthService, JwtAuthGuard],

  controllers: [AuthController],

  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

function thisToSeconds(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const match = normalized.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    return 900;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multiplier: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * multiplier[unit];
}
