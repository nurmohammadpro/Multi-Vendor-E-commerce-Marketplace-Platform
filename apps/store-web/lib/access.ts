import { fetchStoreApi } from './api';

type StoreSessionContext = {
  type?: string;
  roles?: string[];
  permissions?: string[];
};

export type StoreSessionProfile = {
  contexts?: StoreSessionContext[];
  permissions?: string[];
};

export type StoreConsoleAccess = {
  role: 'owner' | 'manager' | 'salesman' | 'unknown';
  roles: string[];
  permissions: string[];
  canManageCatalog: boolean;
  canViewInventory: boolean;
  canAdjustInventory: boolean;
  canApproveInventory: boolean;
  canUsePos: boolean;
  canViewReports: boolean;
  canManageShipping: boolean;
  canManageBilling: boolean;
  canManageSettings: boolean;
  canManageStaff: boolean;
};

const rolePriority: Array<'owner' | 'manager' | 'salesman'> = ['owner', 'manager', 'salesman'];

function toRole(roleCode: string | undefined) {
  if (roleCode === 'store_owner') return 'owner';
  if (roleCode === 'store_manager') return 'manager';
  if (roleCode === 'store_salesman') return 'salesman';
  return null;
}

export function deriveStoreConsoleAccess(profile: StoreSessionProfile | null | undefined): StoreConsoleAccess {
  const roles = Array.from(
    new Set(
      (profile?.contexts ?? [])
        .flatMap((context) => context.roles ?? [])
        .map((roleCode) => toRole(roleCode))
        .filter((role): role is NonNullable<typeof role> => Boolean(role)),
    ),
  );

  const permissions = Array.from(new Set([
    ...(profile?.permissions ?? []),
    ...(profile?.contexts ?? []).flatMap((context) => context.permissions ?? []),
  ]));
  const permissionSet = new Set(permissions);

  const role = rolePriority.find((candidate) => roles.includes(candidate)) ?? 'unknown';

  return {
    role,
    roles,
    permissions,
    canManageCatalog: permissionSet.has('catalog.manage'),
    canViewInventory: permissionSet.has('inventory.view'),
    canAdjustInventory: permissionSet.has('inventory.adjust.request') || permissionSet.has('inventory.adjust.direct'),
    canApproveInventory: permissionSet.has('inventory.adjust.approve'),
    canUsePos: permissionSet.has('sales.pos.create'),
    canViewReports: permissionSet.has('sales.report.view'),
    canManageShipping: permissionSet.has('sales.pos.create'),
    canManageBilling: permissionSet.has('billing.subscription.manage'),
    canManageSettings: permissionSet.has('store.settings.manage'),
    canManageStaff: permissionSet.has('store.staff.manage'),
  };
}

export async function getStoreConsoleAccess() {
  const profile = await fetchStoreApi<StoreSessionProfile>('/auth/me');
  return deriveStoreConsoleAccess(profile);
}
