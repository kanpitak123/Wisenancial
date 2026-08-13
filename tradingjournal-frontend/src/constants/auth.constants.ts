export const AUTH_STORAGE_KEYS = {
  accessToken: 'access_token',
  user: 'auth_user',
} as const;

export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
  me: '/auth/me',
} as const;

export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001/api';
