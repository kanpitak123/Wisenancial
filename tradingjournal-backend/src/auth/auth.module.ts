import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';
import { parseExpiresInSeconds } from './utils/expires-in.util';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,

    // ค่าที่ register ไว้ตรงนี้ใช้กับ access token เท่านั้น
    // refresh token เซ็น/ตรวจด้วย secret + อายุคนละชุด โดยส่ง options เข้าไป
    // ตอนเรียก sign/verify ใน RefreshTokenService
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');

        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is required');
        }

        const expiresInSeconds = parseExpiresInSeconds(
          configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
          parseExpiresInSeconds(AUTH_CONSTANTS.defaultAccessTokenExpiresIn, 900),
        );

        return {
          secret,
          signOptions: {
            expiresIn: expiresInSeconds,
          },
        };
      },
    }),
  ],

  providers: [AuthService, JwtAuthGuard, RefreshTokenService],

  controllers: [AuthController],

  exports: [AuthService, JwtAuthGuard, RefreshTokenService],
})
export class AuthModule {}
