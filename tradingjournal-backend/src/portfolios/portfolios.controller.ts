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
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreatePortfolioDto,
  ListPortfoliosQueryDto,
  UpdatePortfolioDto,
} from './dto/portfolio.dto';
import { PortfoliosService } from './portfolios.service';

@UseGuards(JwtAuthGuard)
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPortfoliosQueryDto,
  ) {
    return this.portfoliosService.findAll(user.userId, query.type);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.portfoliosService.findOne(id, user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePortfolioDto,
  ) {
    return this.portfoliosService.create(user.userId, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePortfolioDto,
  ) {
    return this.portfoliosService.update(id, user.userId, body);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.portfoliosService.remove(id, user.userId);
  }
}
