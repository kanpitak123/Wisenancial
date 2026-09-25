export const AUTH_STORAGE_KEYS = {
  accessToken: 'access_token',
  user: 'auth_user',
} as const;

export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
  me: '/auth/me',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  // อยู่ใต้ /auth เพราะ refresh cookie ถูกจำกัด path ไว้ที่ /auth — หลังบ้านต้องเห็น cookie
  // นั้นเพื่อรู้ว่า "เครื่องนี้" คือสายไหนแล้วเก็บไว้ตอนไล่เครื่องอื่นออก
  changePassword: '/auth/change-password',
  // ลืมรหัสผ่าน / ยืนยันอีเมล — สามตัวแรกไม่ต้องล็อกอิน (ตัวยืนยันคือ token ในลิงก์อีเมล)
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  verifyEmail: '/auth/verify-email',
  sendVerification: '/auth/send-verification',
} as const;

// รอ /auth/logout ได้นานสุดเท่านี้ — เกินก็ล้าง session ในเครื่องแล้วไปต่อ ไม่ให้ปุ่ม Sign out ค้าง
export const LOGOUT_TIMEOUT_MS = 5000;

// backend ฟังที่พอร์ต 3000 (main.ts) และไม่มี global prefix
// ('/api' คือ route ของ Swagger UI ไม่ใช่ prefix ของ API)
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, '')
  : 'http://localhost:3000';
