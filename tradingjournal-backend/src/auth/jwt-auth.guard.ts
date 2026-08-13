import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AUTH_ERROR_MESSAGES } from './constants/auth.constants';
import { AuthUser, JwtAccessPayload } from './types/auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.unauthorized);
    }

    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_ACCESS_SECRET is not configured',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(
        token,
        {
          secret,
        },
      );

      if (
        !payload.sub ||
        !payload.email ||
        !payload.username ||
        !payload.role
      ) {
        throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidToken);
      }

      request.user = {
        userId: payload.userId ?? payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role,
      };

      return true;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.invalidToken);
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] =
      request.headers.authorization?.trim().split(/\s+/) ?? [];

    return type === 'Bearer' && token ? token : undefined;
  }
}
