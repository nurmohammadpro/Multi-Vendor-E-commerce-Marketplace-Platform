import { fetchStoreApi, getStoreApiConfig } from './api';
import { canAccessStoreFeature, formatPlanName, type StoreConsoleFeature, type StoreSubscriptionPlan } from './store-plan';
export type { StoreConsoleFeature, StoreSubscriptionPlan } from './store-plan';

type StoreSessionContext = {
  type?: string;
  roles?: string[];
  permissions?: string[];
};

export type StoreSessionProfile = {
  user?: {
    id?: string;
    email?: string | null;
    phone?: string | null;
    fullName?: string | null;
    preferredLocale?: string;
    status?: string;
  };
  contexts?: StoreSessionContext[];
  permissions?: string[];
};

export type StoreConsoleAccess = {
  role: 'owner' | 'manager' | 'salesman' | 'unknown';
  roles: string[];
  permissions: string[];
  planCode: StoreSubscriptionPlan;
  planName: string;
  subscriptionStatus: string | null;
  storeName: string | null;
  storeLogoUrl: string | null;
  storeStatus: string | null;
  planFeatures: string[];
  userName: string | null;
  userEmail: string | null;
  canManageCatalog: boolean;
  canViewInventory: boolean;
  canAdjustInventory: boolean;
  canDirectAdjustInventory: boolean;
  canRequestAdjustInventory: boolean;
  canApproveInventory: boolean;
  canUsePos: boolean;
  canUsePurchases: boolean;
  canUseReceivables: boolean;
  canViewReports: boolean;
  canManageShipping: boolean;
  canManageBilling: boolean;
  canManageSettings: boolean;
  canManageStaff: boolean;
  canUseDailyExpense: boolean;
  canUsePayroll: boolean;
  canUseAdvancedReports: boolean;
  canUseBankingReconciliation: boolean;
  canUseSupport: boolean;
  canUseDisputes: boolean;
};

type StoreSubscriptionSummary = {
  subscription?: {
    plan_code?: StoreSubscriptionPlan;
    plan_name?: string;
    status?: string;
    features_json?: string[] | Record<string, unknown> | null;
  } | null;
};

type StoreSummaryPayload = {
  store?: {
    name?: string | null;
    logo_url?: string | null;
    status?: string | null;
    subscription_status?: string | null;
  } | null;
};

const rolePriority: Array<'owner' | 'manager' | 'salesman'> = ['owner', 'manager', 'salesman'];
function toRole(roleCode: string | undefined) {
  if (roleCode === 'store_owner') return 'owner';
  if (roleCode === 'store_manager') return 'manager';
  if (roleCode === 'store_salesman') return 'salesman';
  return null;
}

export function deriveStoreConsoleAccess(
  profile: StoreSessionProfile | null | undefined,
  options?: {
    planCode?: StoreSubscriptionPlan;
    planName?: string;
    planFeatures?: string[];
    subscriptionStatus?: string | null;
    storeName?: string | null;
    storeLogoUrl?: string | null;
    storeStatus?: string | null;
    userName?: string | null;
    userEmail?: string | null;
  },
): StoreConsoleAccess {
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
  const planCode = options?.planCode ?? 'basic';
  const planFeatures = options?.planFeatures ?? [];
  const isOwner = role === 'owner';
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const canDirectAdjustInventory = permissionSet.has('inventory.adjust.direct') && canAccessStoreFeature({ planCode, planFeatures }, 'inventory');
  const canRequestAdjustInventory =
    permissionSet.has('inventory.adjust.request')
    && canAccessStoreFeature({ planCode, planFeatures }, 'inventory');

  return {
    role,
    roles,
    permissions,
    planCode,
    planName: options?.planName ?? formatPlanName(planCode),
    planFeatures,
    subscriptionStatus: options?.subscriptionStatus ?? null,
    storeName: options?.storeName ?? null,
    storeLogoUrl: options?.storeLogoUrl ?? null,
    storeStatus: options?.storeStatus ?? null,
    userName: options?.userName ?? null,
    userEmail: options?.userEmail ?? null,
    canManageCatalog: permissionSet.has('catalog.manage') && canAccessStoreFeature({ planCode, planFeatures }, 'catalog'),
    canViewInventory: permissionSet.has('inventory.view') && canAccessStoreFeature({ planCode, planFeatures }, 'inventory'),
    canAdjustInventory: canRequestAdjustInventory,
    canDirectAdjustInventory,
    canRequestAdjustInventory,
    canApproveInventory: permissionSet.has('inventory.adjust.approve') && canAccessStoreFeature({ planCode, planFeatures }, 'inventory'),
    canUsePos: permissionSet.has('sales.pos.create') && canAccessStoreFeature({ planCode, planFeatures }, 'pos'),
    canUsePurchases:
      (permissionSet.has('procurement.manage') || isOwnerOrManager)
      && canAccessStoreFeature({ planCode, planFeatures }, 'purchases'),
    canUseReceivables: permissionSet.has('sales.report.view') && canAccessStoreFeature({ planCode, planFeatures }, 'receivables'),
    canViewReports: permissionSet.has('sales.report.view') && canAccessStoreFeature({ planCode, planFeatures }, 'reports'),
    canManageShipping: permissionSet.has('sales.pos.create') && canAccessStoreFeature({ planCode, planFeatures }, 'shipping'),
    canManageBilling: permissionSet.has('billing.subscription.manage') && canAccessStoreFeature({ planCode, planFeatures }, 'billing'),
    canManageSettings: permissionSet.has('store.settings.manage') && canAccessStoreFeature({ planCode, planFeatures }, 'settings'),
    canManageStaff: permissionSet.has('store.staff.manage') && canAccessStoreFeature({ planCode, planFeatures }, 'staff'),
    canUseDailyExpense: isOwnerOrManager && canAccessStoreFeature({ planCode, planFeatures }, 'expenses'),
    canUsePayroll: isOwner && canAccessStoreFeature({ planCode, planFeatures }, 'payroll'),
    canUseAdvancedReports: isOwnerOrManager && (planCode === 'pro' || (planCode === 'custom' && planFeatures.includes('reports'))),
    canUseBankingReconciliation: isOwner && canAccessStoreFeature({ planCode, planFeatures }, 'banking'),
    canUseSupport: permissionSet.has('sales.report.view') && canAccessStoreFeature({ planCode, planFeatures }, 'support'),
    canUseDisputes: permissionSet.has('sales.report.view') && canAccessStoreFeature({ planCode, planFeatures }, 'disputes'),
  };
}

export async function getStoreConsoleAccess() {
  const [{ storeId }, profile] = await Promise.all([
    getStoreApiConfig(),
    fetchStoreApi<StoreSessionProfile>('/auth/me'),
  ]);

  const [subscriptionPayload, storePayload] = await Promise.all([
    fetchStoreApi<StoreSubscriptionSummary>('/billing/subscription/summary'),
    storeId ? fetchStoreApi<StoreSummaryPayload>(`/stores/${storeId}`) : Promise.resolve(null),
  ]);

  const rawFeatures = subscriptionPayload?.subscription?.features_json;
  const planFeatures = Array.isArray(rawFeatures) ? rawFeatures
    : rawFeatures && typeof rawFeatures === 'object'
      ? Object.keys(rawFeatures).filter((k) => Boolean((rawFeatures as Record<string, unknown>)[k]))
      : [];

  return deriveStoreConsoleAccess(profile, {
    planCode: subscriptionPayload?.subscription?.plan_code ?? 'basic',
    planName:
      subscriptionPayload?.subscription?.plan_name
      ?? formatPlanName(subscriptionPayload?.subscription?.plan_code ?? 'basic'),
    planFeatures,
    subscriptionStatus:
      subscriptionPayload?.subscription?.status ?? storePayload?.store?.subscription_status ?? null,
    storeName: storePayload?.store?.name ?? null,
    storeLogoUrl: storePayload?.store?.logo_url ?? null,
    storeStatus: storePayload?.store?.status ?? null,
    userName: profile?.user?.fullName ?? null,
    userEmail: profile?.user?.email ?? null,
  });
}
