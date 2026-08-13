import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { GamificationQueryDto } from './dto/gamification-query.dto';
import { RecordGamificationEventDto } from './dto/record-event.dto';
import { RedeemTokenDto } from './dto/redeem-token.dto';
import { GamificationService } from './gamification.service';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(
    private readonly service: GamificationService,
  ) {}

  @Get()
  getOverview(
    @CurrentUser() user: AuthUser,
    @Query() query: GamificationQueryDto,
  ) {
    return this.service.getOverview(
      user.userId,
      query,
    );
  }

  @Get('missions')
  getMissions(
    @CurrentUser() user: AuthUser,
    @Query() query: GamificationQueryDto,
  ) {
    return this.service.getMissions(
      user.userId,
      query,
    );
  }

  @Post('missions/:id/claim')
  claimMission(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    missionId: number,
  ) {
    return this.service.claimMission(
      user.userId,
      missionId,
    );
  }

  @Post('redeem')
  redeem(
    @CurrentUser() user: AuthUser,
    @Body() dto: RedeemTokenDto,
  ) {
    return this.service.redeemPointsToTokens(
      user.userId,
      dto.tokensToRedeem,
    );
  }

  @Get('leaderboard')
  getLeaderboard(
    @Query('limit')
    limit?: string,
  ) {
    const parsed =
      Number(limit);

    return this.service.getLeaderboard(
      Number.isInteger(parsed)
        ? parsed
        : undefined,
    );
  }

  // Internal/manual endpoint for testing. In production, domain services should
  // call GamificationService.recordEvent() directly after successful actions.
  @Post('events')
  recordEvent(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: RecordGamificationEventDto,
  ) {
    return this.service.recordEvent(
      user.userId,
      dto.event_type,
      dto.portfolio_type,
      dto.increment,
    );
  }
}
