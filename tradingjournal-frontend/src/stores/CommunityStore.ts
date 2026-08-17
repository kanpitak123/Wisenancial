import { defineStore } from 'pinia';
import { DEFAULT_PAGINATION, DEFAULT_POSTS_QUERY } from '../constants/community.constants';
import { communityService, getCommunityErrorMessage } from '../services/community.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  CreatePostPayload,
  Pagination,
  Post,
  PostsQuery,
  UpdatePostPayload,
} from '../types/community.types';

export const useCommunityStore = defineStore('community', {
  state: () => ({
    posts: [] as Post[],
    selectedPost: null as Post | null,
    pagination: {
      ...DEFAULT_PAGINATION,
    } as Pagination,
    filters: {
      ...DEFAULT_POSTS_QUERY,
    } as PostsQuery,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    traderPosts: (state) => state.posts.filter((post) => post.portfolio_type === 'TRADER'),

    investorPosts: (state) => state.posts.filter((post) => post.portfolio_type === 'INVESTOR'),

    hasPosts: (state) => state.posts.length > 0,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    setFilters(filters: Partial<PostsQuery>) {
      const hasFilterChange =
        filters.portfolio_id !== undefined ||
        filters.portfolio_type !== undefined ||
        filters.asset_symbol !== undefined ||
        filters.reference_type !== undefined ||
        filters.sentiment !== undefined;

      const nextPage = filters.page ?? (hasFilterChange ? 1 : this.filters.page);

      this.filters = {
        ...this.filters,
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)),
        ...(nextPage !== undefined ? { page: nextPage } : {}),
      } as PostsQuery;
    },

    resetFilters() {
      this.filters = {
        ...DEFAULT_POSTS_QUERY,
      };
    },

    async fetchPosts(query: Partial<PostsQuery> = {}) {
      this.isLoading = true;
      this.error = null;

      try {
        const params = {
          ...this.filters,
          // feed ต้องเป็นของโหมดที่ active อยู่เท่านั้น (backend รองรับ portfolio_type อยู่แล้ว)
          // ผู้เรียกที่ส่ง portfolio_type มาเองยังชนะ เผื่ออยากดูข้ามโหมด
          portfolio_type: usePortfolioStore().activeType,
          ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)),
        } as PostsQuery;

        const result = await communityService.fetchPosts(params);

        this.posts = result.data;
        this.pagination = result.pagination;
        this.filters = params;

        return result;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchPost(postId: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const post = await communityService.fetchPost(postId);

        this.selectedPost = post;
        this.upsertPost(post);

        return post;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async createPost(payload: CreatePostPayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const post = await communityService.createPost(payload);

        this.posts.unshift(post);
        this.pagination.total += 1;

        return post;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async updatePost(postId: number, payload: UpdatePostPayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const post = await communityService.updatePost(postId, payload);

        this.upsertPost(post);

        if (this.selectedPost?.id === postId) {
          this.selectedPost = post;
        }

        return post;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async deletePost(postId: number) {
      this.error = null;

      try {
        await communityService.deletePost(postId);

        this.posts = this.posts.filter((post) => post.id !== postId);

        if (this.selectedPost?.id === postId) {
          this.selectedPost = null;
        }

        this.pagination.total = Math.max(0, this.pagination.total - 1);
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      }
    },

    async toggleLikePost(postId: number) {
      this.error = null;

      try {
        const result = await communityService.toggleLike(postId);

        this.applyPostPatch(postId, {
          isLiked: result.liked,
          likes_count: result.likes_count,
        });

        return result;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      }
    },

    async addComment(postId: number, content: string) {
      const trimmed = content.trim();

      if (!trimmed) {
        return null;
      }

      this.error = null;

      try {
        const comment = await communityService.addComment(postId, trimmed);

        const post = this.posts.find((item) => item.id === postId);

        if (post) {
          post.comments.push(comment);
          post.comments_count += 1;
        }

        if (this.selectedPost?.id === postId) {
          this.selectedPost.comments.push(comment);
          this.selectedPost.comments_count += 1;
        }

        return comment;
      } catch (error) {
        this.error = getCommunityErrorMessage(error);
        throw error;
      }
    },

    upsertPost(post: Post) {
      const index = this.posts.findIndex((item) => item.id === post.id);

      if (index >= 0) {
        this.posts[index] = post;
        return;
      }

      this.posts.unshift(post);
    },

    applyPostPatch(postId: number, patch: Partial<Post>) {
      const post = this.posts.find((item) => item.id === postId);

      if (post) {
        Object.assign(post, patch);
      }

      if (this.selectedPost?.id === postId) {
        Object.assign(this.selectedPost, patch);
      }
    },
  },
});
