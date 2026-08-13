import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  getMe(
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.getMe(
      user.userId,
    );
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(
      user.userId,
      body,
    );
  }

  @Delete('me/avatar')
  removeAvatar(
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.removeAvatar(
      user.userId,
    );
  }
}
