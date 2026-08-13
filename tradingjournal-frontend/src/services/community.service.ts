import axios, { type AxiosError } from 'axios';
import { COMMUNITY_API_PATH } from '../constants/community.constants';
import type {
  ApiErrorResponse,
  Comment,
  CreatePostPayload,
  DeletePostResponse,
  LikeResponse,
  Post,
  PostsQuery,
  PostsResponse,
  UpdatePostPayload,
} from '../types/community.types';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

function getAccessToken(): string {
  let token = localStorage.getItem('access_token') ?? localStorage.getItem('token');

  if (!token) {
    throw new Error('ไม่พบ Token กรุณาเข้าสู่ระบบใหม่');
  }

  token = token.replace(/^"(.*)"$/, '$1');

  return token;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

function toFormData(payload: CreatePostPayload): FormData {
  const formData = new FormData();

  formData.append('portfolio_id', String(payload.portfolio_id));

  formData.append('content', payload.content);

  if (payload.asset_symbol) {
    formData.append('asset_symbol', payload.asset_symbol);
  }

  if (payload.sentiment) {
    formData.append('sentiment', payload.sentiment);
  }

  if (payload.post_type) {
    formData.append('post_type', payload.post_type);
  }

  if (payload.visibility) {
    formData.append('visibility', payload.visibility);
  }

  if (payload.reference_type) {
    formData.append('reference_type', payload.reference_type);
  }

  if (payload.reference_id !== undefined) {
    formData.append('reference_id', String(payload.reference_id));
  }

  if (payload.imageFile) {
    formData.append('image', payload.imageFile);
  }

  return formData;
}

export function getCommunityErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? 'เกิดข้อผิดพลาด';
}

export const communityService = {
  async fetchPosts(query: PostsQuery): Promise<PostsResponse> {
    const response = await api.get<PostsResponse>(COMMUNITY_API_PATH, {
      params: query,
      headers: authHeaders(),
    });

    return response.data;
  },

  async fetchPost(postId: number): Promise<Post> {
    const response = await api.get<Post>(`${COMMUNITY_API_PATH}/${postId}`, {
      headers: authHeaders(),
    });

    return response.data;
  },

  async createPost(payload: CreatePostPayload): Promise<Post> {
    const response = await api.post<Post>(COMMUNITY_API_PATH, toFormData(payload), {
      headers: authHeaders(),
    });

    return response.data;
  },

  async updatePost(postId: number, payload: UpdatePostPayload): Promise<Post> {
    const response = await api.patch<Post>(`${COMMUNITY_API_PATH}/${postId}`, payload, {
      headers: authHeaders(),
    });

    return response.data;
  },

  async deletePost(postId: number): Promise<DeletePostResponse> {
    const response = await api.delete<DeletePostResponse>(`${COMMUNITY_API_PATH}/${postId}`, {
      headers: authHeaders(),
    });

    return response.data;
  },

  async toggleLike(postId: number): Promise<LikeResponse> {
    const response = await api.post<LikeResponse>(
      `${COMMUNITY_API_PATH}/${postId}/like`,
      {},
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },

  async addComment(postId: number, content: string): Promise<Comment> {
    const response = await api.post<Comment>(
      `${COMMUNITY_API_PATH}/${postId}/comments`,
      {
        content,
      },
      {
        headers: authHeaders(),
      },
    );

    return response.data;
  },
};
