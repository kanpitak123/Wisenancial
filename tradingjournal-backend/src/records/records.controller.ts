import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateManualRecordDto } from './dto/create-manual-record.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { RecordsService } from './records.service';

@UseGuards(JwtAuthGuard)
@Controller('records')
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
  ) {}

  @Get('portfolio/:portfolioId')
  findAll(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('type')
    type?: RecordType,
    @Query('limit')
    limit?: string,
    @Query('from')
    from?: string,
    @Query('to')
    to?: string,
    @Query('status')
    status?: RecordStatus,
  ) {
    return this.records.findAll(
      portfolioId,
      user.userId,
      {
        type,
        limit:
          limit !== undefined
            ? Number(limit)
            : undefined,
        from: from
          ? new Date(from)
          : undefined,
        to: to
          ? new Date(to)
          : undefined,
        status,
      },
    );
  }

  @Get('portfolio/:portfolioId/summary')
  summary(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.getSummary(
      portfolioId,
      user.userId,
    );
  }

  @Post('portfolio/:portfolioId')
  create(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Body()
    body: CreateManualRecordDto,
  ) {
    return this.records.createManual(
      portfolioId,
      user.userId,
      body,
    );
  }

  @Post('transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTransferDto,
  ) {
    return this.records.transfer(
      user.userId,
      body.from_portfolio_id,
      body.to_portfolio_id,
      body.amount,
      body.description,
    );
  }

  @Post(':id/reverse')
  reverse(
    @Param('id', ParseIntPipe)
    id: number,
    @CurrentUser() user: AuthUser,
    @Body('reason')
    reason?: string,
  ) {
    return this.records.reverse(
      id,
      user.userId,
      reason,
    );
  }

  @Post(
    'portfolio/:portfolioId/rebuild-balance',
  )
  rebuild(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.rebuildBalance(
      portfolioId,
      user.userId,
    );
  }
}
