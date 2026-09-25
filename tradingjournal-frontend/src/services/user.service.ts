import type { AxiosError } from 'axios';
import { api } from 'boot/axios';
import { AUTH_ENDPOINTS } from 'src/constants/auth.constants';
import { USERS_API_PATH } from 'src/constants/user.constants';
import type {
  ApiErrorResponse,
  ChangePasswordPayload,
  ChangePasswordResponse,
  PublicProfile,
  RemoveAvatarResponse,
  UpdateUserPayload,
  UpdateUserResponse,
  UserDataExport,
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

  /**
   * โปรไฟล์สาธารณะของผู้ใช้คนอื่น
   *
   * 404 = ไม่มี username นี้ / 403 = เจ้าตัวตั้งเป็นส่วนตัว — สองกรณีนี้ต้องแยกกัน
   * ที่หน้าจอ ปล่อย error ออกไปให้ผู้เรียกเช็ค status เอง
   */
  async getPublicProfile(username: string): Promise<PublicProfile> {
    const { data } = await api.get<PublicProfile>(
      `${USERS_API_PATH}/profile/${encodeURIComponent(username)}`,
    );

    return data;
  },

  /**
   * เปลี่ยนรหัสผ่าน — 400 = รหัสปัจจุบันผิด/รหัสใหม่ไม่ผ่านกฎ ปล่อย error ออกไปให้ store
   * แปลงเป็นข้อความ (ตั้งใจให้หลังบ้านตอบ 400 ไม่ใช่ 401 จะได้ไม่เข้า flow force-logout)
   */
  async changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    const { data } = await api.post<ChangePasswordResponse>(AUTH_ENDPOINTS.changePassword, payload);

    return data;
  },

  async exportMyData(): Promise<UserDataExport> {
    const { data } = await api.get<UserDataExport>(`${USERS_API_PATH}/me/export`);

    return data;
  },

  async removeAvatar(): Promise<RemoveAvatarResponse> {
    const { data } = await api.delete<RemoveAvatarResponse>(`${USERS_API_PATH}/me/avatar`);

    return data;
  },
};
