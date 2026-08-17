export const AUTH_STORAGE_KEYS = {
  accessToken: 'access_token',
  user: 'auth_user',
} as const;

export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
  me: '/auth/me',
} as const;

// backend ฟังที่พอร์ต 3000 (main.ts) และไม่มี global prefix
// ('/api' คือ route ของ Swagger UI ไม่ใช่ prefix ของ API)
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, '')
  : 'http://localhost:3000';
