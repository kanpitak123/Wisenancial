import { Role } from '@prisma/client';

export interface AuthUser {
  userId: number;
  email: string;
  username: string;
  role: Role;
}

export interface JwtAccessPayload {
  sub: number;
  userId: number;
  email: string;
  username: string;
  role: Role;
}

/**
 * payload ของ refresh token — เซ็นด้วย JWT_REFRESH_SECRET (คนละดอกกับ access token)
 * เก็บข้อมูลให้น้อยที่สุดเท่าที่ตรวจสอบได้ ไม่ใส่ email/role เพราะข้อมูลพวกนั้น
 * อาจเปลี่ยนระหว่างอายุ 30 วันของ token ได้ ตอน refresh จึงอ่านจาก DB สดทุกครั้ง
 */
export interface JwtRefreshPayload {
  sub: number;
  /** คีย์ที่ใช้ค้นหา row ในตาราง refresh_tokens */
  jti: string;
  /** token family — token ที่ rotate ต่อกันมาทั้งสายใช้ค่าเดียวกัน */
  fam: string;
}

export interface AuthenticatedRequest {
  user: AuthUser;
}
