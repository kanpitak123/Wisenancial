import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  PostReferenceType,
  Prisma,
  Sentiment,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    userId: number,
    dto: CreatePostDto,
    file?: Express.Multer.File,
  ) {
    const portfolio =
      await this.requireOwnedPortfolio(
        userId,
        dto.portfolio_id,
      );

    const referenceType =
      dto.reference_type ??
      PostReferenceType.NONE;

    const referenceId =
      await this.validateReference(
        userId,
        portfolio.id,
        portfolio.portfolio_type,
        referenceType,
        dto.reference_id,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const post =
          await tx.posts.create({
            data: {
              user_id: userId,
              portfolio_id:
                portfolio.id,
              portfolio_type:
                portfolio.portfolio_type,
              asset_symbol:
                this.normalizeSymbol(
                  dto.asset_symbol,
                ),
              content:
                dto.content.trim(),
              sentiment:
                dto.sentiment ??
                Sentiment.NEUTRAL,
              post_type:
                this.normalizeUpper(
                  dto.post_type,
                  'GENERAL',
                ),
              visibility:
                this.normalizeUpper(
                  dto.visibility,
                  'PUBLIC',
                ),
              reference_type:
                referenceType,
              reference_id:
                referenceId,
            },
          });

        if (file) {
          await tx.post_images.create({
            data: {
              post_id: post.id,
              image_url:
                `/uploads/posts/${file.filename}`,
            },
          });
        }

        return this.findOne(
          post.id,
          userId,
          tx,
        );
      },
    );
  }

  async findAll(
    currentUserId: number,
    query: PostsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where:
      Prisma.postsWhereInput = {
      visibility: 'PUBLIC',
      ...(query.portfolio_id
        ? {
            portfolio_id:
              query.portfolio_id,
          }
        : {}),
      ...(query.portfolio_type
        ? {
            portfolio_type:
              query.portfolio_type,
          }
        : {}),
      ...(query.asset_symbol
        ? {
            asset_symbol: {
              equals:
                query.asset_symbol
                  .trim()
                  .toUpperCase(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.reference_type
        ? {
            reference_type:
              query.reference_type,
          }
        : {}),
      ...(query.sentiment
        ? {
            sentiment:
              query.sentiment,
          }
        : {}),
    };

    const [total, posts] =
      await Promise.all([
        this.prisma.posts.count({
          where,
        }),
        this.prisma.posts.findMany({
          where,
          include:
            this.postInclude(
              currentUserId,
            ),
          orderBy: {
            created_at: 'desc',
          },
          skip:
            (page - 1) * limit,
          take: limit,
        }),
      ]);

    const data = await Promise.all(
      posts.map((post) =>
        this.mapPostWithReference(
          post,
        ),
      ),
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit,
          ),
        hasNext:
          page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(
    postId: number,
    currentUserId: number,
    client:
      | PrismaService
      | Prisma.TransactionClient =
      this.prisma,
  ) {
    const post =
      await client.posts.findUnique({
        where: { id: postId },
        include:
          this.postInclude(
            currentUserId,
          ),
      });

    if (!post) {
      throw new NotFoundException(
        'Post not found',
      );
    }

    if (
      post.visibility !==
        'PUBLIC' &&
      post.user_id !==
        currentUserId
    ) {
      throw new ForbiddenException(
        'ไม่มีสิทธิ์ดูโพสต์นี้',
      );
    }

    return this.mapPostWithReference(
      post,
    );
  }

  async update(
    postId: number,
    userId: number,
    dto: UpdatePostDto,
  ) {
    const current =
      await this.requireOwnedPost(
        postId,
        userId,
      );

    const portfolio =
      await this.requireOwnedPortfolio(
        userId,
        dto.portfolio_id ??
          current.portfolio_id,
      );

    const referenceType =
      dto.reference_type ??
      current.reference_type;

    const referenceId =
      await this.validateReference(
        userId,
        portfolio.id,
        portfolio.portfolio_type,
        referenceType,
        dto.reference_id ??
          current.reference_id ??
          undefined,
      );

    await this.prisma.posts.update({
      where: { id: postId },
      data: {
        portfolio_id:
          portfolio.id,
        portfolio_type:
          portfolio.portfolio_type,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        ...(dto.asset_symbol !==
          undefined && {
          asset_symbol:
            this.normalizeSymbol(
              dto.asset_symbol,
            ),
        }),
        ...(dto.content !==
          undefined && {
          content:
            dto.content.trim(),
        }),
        ...(dto.sentiment !==
          undefined && {
          sentiment:
            dto.sentiment,
        }),
        ...(dto.post_type !==
          undefined && {
          post_type:
            this.normalizeUpper(
              dto.post_type,
              'GENERAL',
            ),
        }),
        ...(dto.visibility !==
          undefined && {
          visibility:
            this.normalizeUpper(
              dto.visibility,
              'PUBLIC',
            ),
        }),
      },
    });

    return this.findOne(
      postId,
      userId,
    );
  }

  async remove(
    postId: number,
    userId: number,
  ) {
    await this.requireOwnedPost(
      postId,
      userId,
    );

    await this.prisma.posts.delete({
      where: { id: postId },
    });

    return {
      success: true,
      deleted_id: postId,
    };
  }

  async toggleLike(
    userId: number,
    postId: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const post =
          await tx.posts.findUnique({
            where: { id: postId },
            select: {
              id: true,
            },
          });

        if (!post) {
          throw new NotFoundException(
            'Post not found',
          );
        }

        const existing =
          await tx.post_likes.findUnique({
            where: {
              post_id_user_id: {
                post_id: postId,
                user_id: userId,
              },
            },
          });

        if (existing) {
          await tx.post_likes.delete({
            where: {
              post_id_user_id: {
                post_id: postId,
                user_id: userId,
              },
            },
          });

          const updated =
            await tx.posts.update({
              where: { id: postId },
              data: {
                likes_count: {
                  decrement: 1,
                },
              },
              select: {
                likes_count: true,
              },
            });

          return {
            liked: false,
            likes_count:
              Math.max(
                0,
                updated.likes_count,
              ),
          };
        }

        await tx.post_likes.create({
          data: {
            post_id: postId,
            user_id: userId,
          },
        });

        const updated =
          await tx.posts.update({
            where: { id: postId },
            data: {
              likes_count: {
                increment: 1,
              },
            },
            select: {
              likes_count: true,
            },
          });

        return {
          liked: true,
          likes_count:
            updated.likes_count,
        };
      },
    );
  }

  async addComment(
    userId: number,
    postId: number,
    dto: CreateCommentDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const post =
          await tx.posts.findUnique({
            where: {
              id: postId,
            },
            select: {
              id: true,
            },
          });

        if (!post) {
          throw new NotFoundException(
            'Post not found',
          );
        }

        const comment =
          await tx.comments.create({
            data: {
              post_id: postId,
              user_id: userId,
              content:
                dto.content.trim(),
            },
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                  full_name: true,
                  avatar_url: true,
                },
              },
            },
          });

        await tx.posts.update({
          where: { id: postId },
          data: {
            comments_count: {
              increment: 1,
            },
          },
        });

        return comment;
      },
    );
  }

  private async validateReference(
    userId: number,
    portfolioId: number,
    portfolioType: PortfolioType,
    referenceType: PostReferenceType,
    referenceId?: number,
  ): Promise<number | null> {
    if (
      referenceType ===
      PostReferenceType.NONE
    ) {
      return null;
    }

    if (
      referenceType ===
      PostReferenceType.PORTFOLIO
    ) {
      return portfolioId;
    }

    if (!referenceId) {
      throw new BadRequestException(
        'reference_id is required',
      );
    }

    switch (referenceType) {
      case PostReferenceType.TRADE: {
        if (
          portfolioType !==
          PortfolioType.TRADER
        ) {
          throw new BadRequestException(
            'TRADE reference requires TRADER portfolio',
          );
        }

        const item =
          await this.prisma.trades.findFirst({
            where: {
              id: referenceId,
              user_id: userId,
              portfolio_id:
                portfolioId,
            },
            select: {
              id: true,
            },
          });

        if (!item) {
          throw new BadRequestException(
            'Trade reference does not belong to this portfolio',
          );
        }

        return item.id;
      }

      case PostReferenceType.STOCK_PURCHASE: {
        this.requireInvestorType(
          portfolioType,
          referenceType,
        );

        const item =
          await this.prisma.stock_purchases.findFirst({
            where: {
              id: referenceId,
              portfolio_id:
                portfolioId,
            },
            select: {
              id: true,
            },
          });

        if (!item) {
          throw new BadRequestException(
            'Stock purchase reference does not belong to this portfolio',
          );
        }

        return item.id;
      }

      case PostReferenceType.STOCK_SALE: {
        this.requireInvestorType(
          portfolioType,
          referenceType,
        );

        const item =
          await this.prisma.stock_sales.findFirst({
            where: {
              id: referenceId,
              portfolio_id:
                portfolioId,
            },
            select: {
              id: true,
            },
          });

        if (!item) {
          throw new BadRequestException(
            'Stock sale reference does not belong to this portfolio',
          );
        }

        return item.id;
      }

      case PostReferenceType.DIVIDEND: {
        this.requireInvestorType(
          portfolioType,
          referenceType,
        );

        const item =
          await this.prisma.dividends.findFirst({
            where: {
              id: referenceId,
              user_id: userId,
              portfolio_id:
                portfolioId,
            },
            select: {
              id: true,
            },
          });

        if (!item) {
          throw new BadRequestException(
            'Dividend reference does not belong to this portfolio',
          );
        }

        return item.id;
      }

      default:
        throw new BadRequestException(
          'Unsupported reference type',
        );
    }
  }

  private async mapPostWithReference(
    post: any,
  ) {
    const {
      post_likes,
      ...rest
    } = post;

    return {
      ...rest,
      isLiked:
        post_likes.length > 0,
      reference:
        await this.resolveReference(
          post.reference_type,
          post.reference_id,
        ),
    };
  }

  private async resolveReference(
    type: PostReferenceType,
    id: number | null,
  ) {
    if (
      type ===
        PostReferenceType.NONE ||
      id === null
    ) {
      return null;
    }

    if (
      type ===
      PostReferenceType.PORTFOLIO
    ) {
      return this.prisma.portfolios.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          portfolio_type: true,
        },
      });
    }

    if (
      type ===
      PostReferenceType.TRADE
    ) {
      return this.prisma.trades.findUnique({
        where: { id },
        select: {
          id: true,
          pair: true,
          trade_type: true,
          pnl: true,
          result_status: true,
        },
      });
    }

    if (
      type ===
      PostReferenceType.STOCK_PURCHASE
    ) {
      return this.prisma.stock_purchases.findUnique({
        where: { id },
        select: {
          id: true,
          stock_symbol: true,
          shares_count: true,
          purchase_price: true,
          status: true,
        },
      });
    }

    if (
      type ===
      PostReferenceType.STOCK_SALE
    ) {
      return this.prisma.stock_sales.findUnique({
        where: { id },
        select: {
          id: true,
          stock_symbol: true,
          shares_sold: true,
          sold_price: true,
          realized_pnl: true,
        },
      });
    }

    return this.prisma.dividends.findUnique({
      where: { id },
      select: {
        id: true,
        symbol: true,
        net_amount: true,
        payment_date: true,
      },
    });
  }

  private requireInvestorType(
    portfolioType: PortfolioType,
    referenceType: PostReferenceType,
  ) {
    if (
      portfolioType !==
      PortfolioType.INVESTOR
    ) {
      throw new BadRequestException(
        `${referenceType} requires INVESTOR portfolio`,
      );
    }
  }

  private async requireOwnedPortfolio(
    userId: number,
    portfolioId: number,
  ) {
    const portfolio =
      await this.prisma.portfolios.findFirst({
        where: {
          id: portfolioId,
          user_id: userId,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ Portfolio หรือไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private async requireOwnedPost(
    postId: number,
    userId: number,
  ) {
    const post =
      await this.prisma.posts.findFirst({
        where: {
          id: postId,
          user_id: userId,
        },
      });

    if (!post) {
      throw new NotFoundException(
        'ไม่พบ Post หรือไม่มีสิทธิ์แก้ไข',
      );
    }

    return post;
  }

  private postInclude(
    currentUserId: number,
  ) {
    return {
      users: {
        select: {
          id: true,
          username: true,
          full_name: true,
          avatar_url: true,
        },
      },
      portfolios: {
        select: {
          id: true,
          name: true,
          portfolio_type: true,
        },
      },
      post_images: true,
      comments: {
        include: {
          users: {
            select: {
              id: true,
              username: true,
              full_name: true,
              avatar_url: true,
            },
          },
        },
        orderBy: {
          created_at:
            'asc' as const,
        },
      },
      post_likes: {
        where: {
          user_id:
            currentUserId,
        },
        select: {
          user_id: true,
        },
      },
    };
  }

  private normalizeSymbol(
    value?: string,
  ) {
    const normalized =
      value?.trim().toUpperCase();

    return normalized || null;
  }

  private normalizeUpper(
    value: string | undefined,
    fallback: string,
  ) {
    return (
      value?.trim().toUpperCase() ||
      fallback
    );
  }
}
