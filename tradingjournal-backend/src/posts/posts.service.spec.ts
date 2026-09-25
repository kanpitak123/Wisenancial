import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const prismaMock = {
  posts: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  users: { findMany: jest.fn() },
  portfolios: { findMany: jest.fn() },
  post_images: { findMany: jest.fn() },
  comments: { findMany: jest.fn() },
  post_likes: { findMany: jest.fn() },
};

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll response shape ───────────────────────────────────────────────
  // Fix for the QA sweep's HIGH latency finding (2026-09-23): findAll() used to hydrate
  // relations via a single Prisma `include`, which resolved as 7 SERIAL round trips under
  // this app's pgbouncer connection (measured 13.7s for one page of posts). It now fetches
  // each relation with its own findMany + Promise.all so they run concurrently instead. This
  // test pins the exact response shape (keys, nesting, isLiked/reference derivation) against
  // the real shape captured from a live GET /posts response, so that refactor can never
  // silently change what the frontend receives.
  describe('findAll', () => {
    it('returns the same shape as the real API (hydrated relations, isLiked, reference)', async () => {
      const post = {
        id: 5,
        user_id: 14,
        portfolio_id: 17,
        portfolio_type: 'INVESTOR',
        asset_symbol: 'BTC/USD',
        content: 'QSelect-then-type test post',
        sentiment: 'NEUTRAL',
        post_type: 'GENERAL',
        visibility: 'PUBLIC',
        reference_type: 'NONE',
        reference_id: null,
        likes_count: 1,
        comments_count: 1,
        created_at: new Date('2026-09-23T09:41:27.371Z'),
        updated_at: new Date('2026-09-23T09:50:58.705Z'),
      };

      prismaMock.posts.count.mockResolvedValue(1);
      prismaMock.posts.findMany.mockResolvedValue([post]);
      prismaMock.users.findMany.mockResolvedValue([
        {
          id: 14,
          username: 'qa_paid_wisenancial',
          full_name: 'QA Paid',
          avatar_url: null,
        },
      ]);
      prismaMock.portfolios.findMany.mockResolvedValue([
        { id: 17, name: 'QA Stock Main', portfolio_type: 'INVESTOR' },
      ]);
      prismaMock.post_images.findMany.mockResolvedValue([]);
      prismaMock.comments.findMany.mockResolvedValue([
        {
          id: 4,
          post_id: 5,
          user_id: 14,
          content: 'QA test comment',
          created_at: new Date('2026-09-23T09:50:57.119Z'),
          updated_at: new Date('2026-09-23T09:50:57.119Z'),
          users: {
            id: 14,
            username: 'qa_paid_wisenancial',
            full_name: 'QA Paid',
            avatar_url: null,
          },
        },
      ]);
      prismaMock.post_likes.findMany.mockResolvedValue([{ post_id: 5 }]);

      const result = await service.findAll(14, {} as any);

      expect(result.data).toHaveLength(1);
      const hydrated = result.data[0];

      // exact key set the real API returns — no post_likes leaking through, no missing fields
      expect(Object.keys(hydrated).sort()).toEqual(
        [
          'id',
          'user_id',
          'portfolio_id',
          'portfolio_type',
          'asset_symbol',
          'content',
          'sentiment',
          'post_type',
          'visibility',
          'reference_type',
          'reference_id',
          'likes_count',
          'comments_count',
          'created_at',
          'updated_at',
          'users',
          'portfolios',
          'post_images',
          'comments',
          'isLiked',
          'reference',
        ].sort(),
      );

      expect(hydrated.users).toEqual({
        id: 14,
        username: 'qa_paid_wisenancial',
        full_name: 'QA Paid',
        avatar_url: null,
      });
      expect(hydrated.portfolios).toEqual({
        id: 17,
        name: 'QA Stock Main',
        portfolio_type: 'INVESTOR',
      });
      expect(hydrated.post_images).toEqual([]);
      expect(hydrated.comments).toHaveLength(1);
      expect(hydrated.comments[0].users).toEqual({
        id: 14,
        username: 'qa_paid_wisenancial',
        full_name: 'QA Paid',
        avatar_url: null,
      });
      expect(hydrated.isLiked).toBe(true);
      expect(hydrated.reference).toBeNull();

      // relation fetches ran once each (batched by post ids), not once per post/relation combo
      expect(prismaMock.users.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.portfolios.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.post_images.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.comments.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.post_likes.findMany).toHaveBeenCalledTimes(1);
    });

    it('isLiked is false when the current user has no like row for the post', async () => {
      const post = {
        id: 1,
        user_id: 12,
        portfolio_id: 9,
        portfolio_type: 'INVESTOR',
        asset_symbol: null,
        content: 'no like',
        sentiment: 'NEUTRAL',
        post_type: 'GENERAL',
        visibility: 'PUBLIC',
        reference_type: 'NONE',
        reference_id: null,
        likes_count: 0,
        comments_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      prismaMock.posts.count.mockResolvedValue(1);
      prismaMock.posts.findMany.mockResolvedValue([post]);
      prismaMock.users.findMany.mockResolvedValue([
        { id: 12, username: 'someone', full_name: 'Someone', avatar_url: null },
      ]);
      prismaMock.portfolios.findMany.mockResolvedValue([
        { id: 9, name: 'Some Portfolio', portfolio_type: 'INVESTOR' },
      ]);
      prismaMock.post_images.findMany.mockResolvedValue([]);
      prismaMock.comments.findMany.mockResolvedValue([]);
      prismaMock.post_likes.findMany.mockResolvedValue([]);

      const result = await service.findAll(14, {} as any);

      expect(result.data[0].isLiked).toBe(false);
    });

    it('returns an empty page without querying any relation tables', async () => {
      prismaMock.posts.count.mockResolvedValue(0);
      prismaMock.posts.findMany.mockResolvedValue([]);

      const result = await service.findAll(14, {} as any);

      expect(result.data).toEqual([]);
      expect(prismaMock.users.findMany).not.toHaveBeenCalled();
      expect(prismaMock.portfolios.findMany).not.toHaveBeenCalled();
    });
  });
});
