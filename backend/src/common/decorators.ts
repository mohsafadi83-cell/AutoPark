import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './enums';
import { Permission } from './permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks an endpoint as not requiring authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** Requires ALL listed permissions. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const ANY_PERMISSIONS_KEY = 'anyPermissions';
/** Requires AT LEAST ONE of the listed permissions. */
export const RequireAnyPermission = (...perms: Permission[]) => SetMetadata(ANY_PERMISSIONS_KEY, perms);

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest();
  return {
    ip: (req.ip as string) ?? null,
    userAgent: (req.headers?.['user-agent'] as string)?.slice(0, 500) ?? null,
  };
});
