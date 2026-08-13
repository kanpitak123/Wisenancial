import type { AxiosError } from 'axios';
import { api } from 'boot/axios';
import { USERS_API_PATH } from 'src/constants/user.constants';
import type {
  ApiErrorResponse,
  RemoveAvatarResponse,
  UpdateUserPayload,
  UpdateUserResponse,
  UserProfile,
} from 'src/types/user.types';

export function getUserErrorMessage(
  error: unknown,
  fallback = 'เกิดข้อผิดพลาดในระบบผู้ใช้',
): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

export const userService = {
  async getMe(): Promise<UserProfile> {
    const { data } = await api.get<UserProfile>(`${USERS_API_PATH}/me`);

    return data;
  },

  async updateMe(payload: UpdateUserPayload): Promise<UpdateUserResponse> {
    const { data } = await api.patch<UpdateUserResponse>(`${USERS_API_PATH}/me`, payload);

    return data;
  },

  async removeAvatar(): Promise<RemoveAvatarResponse> {
    const { data } = await api.delete<RemoveAvatarResponse>(`${USERS_API_PATH}/me/avatar`);

    return data;
  },
};
