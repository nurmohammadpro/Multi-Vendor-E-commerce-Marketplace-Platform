import { Injectable } from '@nestjs/common';
import { permissionGroups } from '@mvp/rbac';

const roleToPermissions: Record<string, string[]> = {
  store_owner: [
    'inventory.adjust.direct',
    'inventory.adjust.request',
    'inventory.adjust.approve',
    'inventory.view',
    'catalog.manage',
    'sales.pos.create',
    'sales.report.view',
    'store.settings.manage',
    'store.staff.manage',
    'billing.subscription.manage',
    'payment.gateway.manage',
  ],
  store_manager: [
    'inventory.adjust.request',
    'inventory.view',
    'catalog.manage',
    'sales.pos.create',
    'sales.report.view',
    'store.staff.manage',
  ],
  store_salesman: ['inventory.view', 'sales.pos.create', 'sales.report.view'],
  platform_owner: [
    'platform.store.review',
    'platform.payment.monitor',
    'platform.support.manage',
    'platform.notification.manage',
    'platform.broadcast.send',
    'platform.settings.manage',
    'platform.admin.manage',
    'platform.report.view',
  ],
  regular_admin: [
    'platform.store.review',
    'platform.payment.monitor',
    'platform.support.manage',
    'platform.notification.manage',
    'platform.report.view',
  ],
  operations_admin: ['platform.store.review'],
  finance_admin: ['platform.payment.monitor'],
  support_admin: ['platform.support.manage', 'platform.notification.manage'],
  marketing_admin: ['platform.notification.manage', 'platform.broadcast.send'],
};

@Injectable()
export class RbacService {
  hasPermission(userPermissions: string[], requiredPermission: string) {
    return userPermissions.includes(requiredPermission);
  }

  hasAllPermissions(userPermissions: string[], requiredPermissions: string[]) {
    return requiredPermissions.every((permission) => this.hasPermission(userPermissions, permission));
  }

  expandPermissionsFromRoles(roleCodes: string[]) {
    const permissions = new Set<string>();

    for (const roleCode of roleCodes) {
      for (const permission of roleToPermissions[roleCode] ?? []) {
        permissions.add(permission);
      }
    }

    return Array.from(permissions);
  }

  getPermissionGroups() {
    return permissionGroups;
  }
}
