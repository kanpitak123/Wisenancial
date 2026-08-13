import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useCommunityStore } from '../stores/CommunityStore';
import type { CreatePostPayload, PostsQuery, UpdatePostPayload } from '../types/community.types';

export function useCommunity() {
  const store = useCommunityStore();

  const { posts, selectedPost, pagination, filters, isLoading, isSubmitting, error } =
    storeToRefs(store);

  const traderPosts = computed(() => store.traderPosts);

  const investorPosts = computed(() => store.investorPosts);

  const hasPosts = computed(() => store.hasPosts);

  const fetchPosts = (query: Partial<PostsQuery> = {}) => store.fetchPosts(query);

  const fetchPost = (postId: number) => store.fetchPost(postId);

  const createPost = (payload: CreatePostPayload) => store.createPost(payload);

  const updatePost = (postId: number, payload: UpdatePostPayload) =>
    store.updatePost(postId, payload);

  const deletePost = (postId: number) => store.deletePost(postId);

  const toggleLikePost = (postId: number) => store.toggleLikePost(postId);

  const addComment = (postId: number, content: string) => store.addComment(postId, content);

  return {
    posts,
    selectedPost,
    pagination,
    filters,
    isLoading,
    isSubmitting,
    error,

    traderPosts,
    investorPosts,
    hasPosts,

    fetchPosts,
    fetchPost,
    createPost,
    updatePost,
    deletePost,
    toggleLikePost,
    addComment,
    setFilters: (filters: Partial<PostsQuery>) => store.setFilters(filters),
    resetFilters: () => store.resetFilters(),
    clearError: () => store.clearError(),
  };
}
