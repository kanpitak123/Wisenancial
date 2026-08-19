export const AUTH_CONSTANTS = {
  bcryptSaltRounds: 12,
  defaultAccessTokenExpiresIn: '15m',
  defaultRefreshTokenExpiresIn: '30d',

  refreshCookieName: 'refresh_token',

  // จำกัด cookie ให้เบราว์เซอร์แนบมาเฉพาะ /auth/* — endpoint อื่นทั้งระบบใช้
  // Authorization: Bearer อยู่แล้ว ไม่มีเหตุผลให้เห็น refresh token เลย
  // ลดพื้นที่เสี่ยง CSRF ไปในตัวด้วย
  refreshCookiePath: '/auth',
} as const;

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  accountAlreadyExists: 'อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานแล้ว',
  unauthorized: 'กรุณาล็อกอินก่อนใช้งาน',
  invalidToken: 'Token หมดอายุหรือไม่ถูกต้อง',
  userNotFound: 'ไม่พบบัญชีผู้ใช้',

  missingRefreshToken: 'ไม่พบ Refresh Token กรุณาล็อกอินใหม่',

  // ใช้ข้อความเดียวกันทุกกรณีที่ refresh ไม่ผ่าน (หมดอายุ / ลายเซ็นผิด / ถูก revoke /
  // ตรวจพบการใช้ซ้ำ) เพื่อไม่บอกใบ้ผู้โจมตีว่า token ที่ถืออยู่ผิดตรงไหน
  invalidRefreshToken: 'Refresh Token หมดอายุหรือไม่ถูกต้อง',
} as const;
