import type { Request } from 'express';
import type { User } from '../generated/prisma/client.js';
import { permissionsFor } from './admin-roles.js';

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  email: string;
  role: 'customer' | 'shop' | 'admin';
  adminRole?: string;
  permissions: string[];
  shopName?: string;
  shopStatus?: string;
  avatar?: string;
}

export type AuthedRequest = Request & { user: SessionUser };

export function toSessionUser(u: User): SessionUser {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    ...(u.role === 'admin' && { adminRole: u.adminRole ?? 'staff' }),
    permissions: u.role === 'admin' ? permissionsFor(u.adminRole ?? 'staff') : [],
    ...(u.role === 'shop' && { shopName: u.shopName ?? '', shopStatus: u.shopStatus ?? 'pending' }),
    ...(u.avatar && { avatar: u.avatar }),
  };
}
