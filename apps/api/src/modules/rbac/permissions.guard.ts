import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SessionAuthService } from '../auth/session-auth.service.js';
import { CONTEXT_TYPE_METADATA_KEY, PERMISSIONS_METADATA_KEY } from './rbac.constants.js';
import { RbacService } from './rbac.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionAuthService: SessionAuthService,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const requiredContextType =
      this.reflector.getAllAndOverride<'admin' | 'store' | 'customer'>(CONTEXT_TYPE_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermissions.length && !requiredContextType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const session = await this.sessionAuthService.requireSessionFromAuthorizationHeader(
      request.headers.authorization,
    );

    if (requiredContextType) {
      const matchingContext = session.contexts.find((authContext) => {
        if (authContext.type !== requiredContextType) {
          return false;
        }

        if (requiredContextType === 'store') {
          const headerStoreId = request.headers['x-store-id'];
          return typeof headerStoreId === 'string'
            ? authContext.type === 'store' && authContext.storeId === headerStoreId
            : true;
        }

        return true;
      });

      if (!matchingContext) {
        throw new ForbiddenException(`Required ${requiredContextType} context is missing`);
      }

      request.authContext = matchingContext;
    }

    if (requiredPermissions.length) {
      const hasPermissions = this.rbacService.hasAllPermissions(session.permissions, requiredPermissions);
      if (!hasPermissions) {
        throw new ForbiddenException('Missing required permissions');
      }
    }

    request.authSession = session;
    return true;
  }
}
