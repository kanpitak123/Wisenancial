import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecordType } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateInvestorRecordDto } from './dto/create-investor-record.dto';
import { UpdateInvestorRecordDto } from './dto/update-investor-record.dto';
import { InvestorRecordsService } from './investor-records.service';

@UseGuards(JwtAuthGuard)
@Controller('investor-records')
export class InvestorRecordsController {
  constructor(private readonly service: InvestorRecordsService) {}

  @Get('portfolio/:portfolioId')
  findAll(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
  ) {
    return this.service.findAll(
      portfolioId,
      user.userId,
      type as RecordType | undefined,
    );
  }

  @Get('portfolio/:portfolioId/summary')
  summary(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getSummary(portfolioId, user.userId);
  }

  @Post('portfolio/:portfolioId')
  create(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvestorRecordDto,
  ) {
    return this.service.create(portfolioId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInvestorRecordDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }
}
