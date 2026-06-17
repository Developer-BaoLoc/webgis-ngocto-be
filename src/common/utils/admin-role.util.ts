import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../types/api.types';

const ADMIN_ROLES = new Set([
  'super_admin',
  'admin_phuong',
  'admin',
  'tenant_admin',
]);

export function isAdminUser(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) => ADMIN_ROLES.has(role)) ?? false;
}

export function assertAdminUser(user: AuthenticatedUser) {
  if (isAdminUser(user)) return;
  throw new ForbiddenException('Chỉ admin được cấu hình relationship field');
}
