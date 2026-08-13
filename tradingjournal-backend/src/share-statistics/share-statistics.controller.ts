import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidTierGuard } from '../auth/paid-tier.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  LogShareActivityDto,
  SHARE_PLATFORMS,
  type SharePlatform,
} from './dto/share-platform.dto';
import { ShareStatisticsService } from './share-statistics.service';

@Controller('share-statistics')
@UseGuards(
  JwtAuthGuard,
  PaidTierGuard,
)
export class ShareStatisticsController {
  constructor(
    private readonly service: ShareStatisticsService,
  ) {}

  @Get('portfolio/:portfolioId')
  getShareStatistics(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getShareStatistics(
      user.userId,
      portfolioId,
    );
  }

  @Get(
    'portfolio/:portfolioId/message/:platform',
  )
  generateShareMessage(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Param('platform')
    platform: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateShareMessage(
      user.userId,
      portfolioId,
      this.parsePlatform(platform),
    );
  }

  @Get('portfolio/:portfolioId/image')
  generateShareImage(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateShareImage(
      user.userId,
      portfolioId,
    );
  }

  @Post('portfolio/:portfolioId/log')
  logShareActivity(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Body()
    body: LogShareActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.logShareActivity(
      user.userId,
      portfolioId,
      body.platform,
      body.message,
      body.content_type,
      body.image_url,
      body.public_url,
    );
  }

  @Get(
    'portfolio/:portfolioId/logs',
  )
  getShareLogs(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Query('limit')
    limit: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const parsedLimit =
      Number(limit);

    return this.service.getShareLogs(
      user.userId,
      portfolioId,
      Number.isInteger(parsedLimit)
        ? parsedLimit
        : 20,
    );
  }

  @Get(
    'portfolio/:portfolioId/social-data',
  )
  getSocialSharingData(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getSocialSharingData(
      user.userId,
      portfolioId,
    );
  }

  private parsePlatform(
    platform: string,
  ): SharePlatform {
    const normalized =
      platform.toLowerCase();

    if (
      !SHARE_PLATFORMS.includes(
        normalized as SharePlatform,
      )
    ) {
      throw new BadRequestException(
        `Unsupported share platform: ${platform}`,
      );
    }

    return normalized as SharePlatform;
  }
}
