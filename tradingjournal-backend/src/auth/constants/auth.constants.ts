export const AUTH_CONSTANTS = {
  bcryptSaltRounds: 12,
  defaultAccessTokenExpiresIn: '15m',
} as const;

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  accountAlreadyExists: 'อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานแล้ว',
  unauthorized: 'กรุณาล็อกอินก่อนใช้งาน',
  invalidToken: 'Token หมดอายุหรือไม่ถูกต้อง',
  userNotFound: 'ไม่พบบัญชีผู้ใช้',
} as const;
