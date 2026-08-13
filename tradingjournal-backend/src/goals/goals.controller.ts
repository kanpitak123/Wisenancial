import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get('portfolio/:id')
  getGoal(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Request() req: any,
  ) {
    return this.goalsService.getGoal(req.user.sub, +id, +year, +month);
  }

  @Post('portfolio/:id')
  setGoal(
    @Param('id') id: string,
    @Body() body: { year: number; month: number; target: number },
    @Request() req: any,
  ) {
    return this.goalsService.setGoal(
      req.user.sub,
      +id,
      body.year,
      body.month,
      body.target,
    );
  }
}
