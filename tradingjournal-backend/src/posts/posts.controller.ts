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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image'),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePostDto,
    @UploadedFile()
    file?: Express.Multer.File,
  ) {
    return this.posts.create(
      user.userId,
      body,
      file,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: PostsQueryDto,
  ) {
    return this.posts.findAll(
      user.userId,
      query,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.posts.findOne(
      id,
      user.userId,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    id: number,
    @Body() body: UpdatePostDto,
  ) {
    return this.posts.update(
      id,
      user.userId,
      body,
    );
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.posts.remove(
      id,
      user.userId,
    );
  }

  @Post(':id/like')
  toggleLike(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    return this.posts.toggleLike(
      user.userId,
      id,
    );
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe)
    id: number,
    @Body() body: CreateCommentDto,
  ) {
    return this.posts.addComment(
      user.userId,
      id,
      body,
    );
  }
}
