import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidTierGuard } from '../auth/paid-tier.guard';
import { CoachService } from './coach.service';
import { BookSessionDto } from './dto/book-session.dto';

@Controller('coaches')
@UseGuards(JwtAuthGuard, PaidTierGuard)
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  private getUserId(req: { user?: { sub?: number; userId?: number } }): number {
    const userId = req.user?.sub ?? req.user?.userId;
    return Number(userId);
  }

  @Get()
  listCoaches() {
    return this.coachService.listCoaches();
  }

  @Get('sessions/mine')
  mySessions(@Request() req: { user?: { sub?: number; userId?: number } }) {
    return this.coachService.mySessions(this.getUserId(req));
  }

  @Post('sessions')
  bookSession(
    @Request() req: { user?: { sub?: number; userId?: number } },
    @Body() body: BookSessionDto,
  ) {
    return this.coachService.bookSession(this.getUserId(req), body);
  }

  @Post('sessions/:id/cancel')
  cancelSession(
    @Request() req: { user?: { sub?: number; userId?: number } },
    @Param('id') id: string,
  ) {
    return this.coachService.cancelSession(this.getUserId(req), id);
  }

  @Get(':id')
  getCoach(@Param('id') id: string) {
    return this.coachService.getCoach(id);
  }

  @Get(':id/reviews')
  getReviews(@Param('id') id: string) {
    return this.coachService.getReviews(id);
  }
}
