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

export interface AuthenticatedRequest {
  user: AuthUser;
}
