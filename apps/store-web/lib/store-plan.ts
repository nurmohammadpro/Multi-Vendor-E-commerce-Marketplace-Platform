export type StoreSubscriptionPlan = 'basic' | 'standard' | 'pro';

export type StoreConsoleFeature =
  | 'dashboard'
  | 'catalog'
  | 'inventory'
  | 'pos'
  | 'customers'
  | 'reports'
  | 'disputes'
  | 'support'
  | 'staff'
  | 'expenses'
  | 'payroll'
  | 'banking'
  | 'billing'
  | 'settings'
  | 'hardware'
  | 'session';

const planPriority: Record<StoreSubscriptionPlan, number> = {
  basic: 1,
  standard: 2,
  pro: 3,
};

const featurePlanRequirements: Record<StoreConsoleFeature, StoreSubscriptionPlan> = {
  dashboard: 'basic',
  catalog: 'basic',
  inventory: 'basic',
  pos: 'basic',
  customers: 'basic',
  reports: 'basic',
  disputes: 'basic',
  support: 'basic',
  staff: 'standard',
  expenses: 'standard',
  payroll: 'pro',
  banking: 'pro',
  billing: 'basic',
  settings: 'basic',
  hardware: 'basic',
  session: 'basic',
};

export function hasRequiredPlan(planCode: StoreSubscriptionPlan, feature: StoreConsoleFeature) {
  return planPriority[planCode] >= planPriority[featurePlanRequirements[feature]];
}

export function canAccessStoreFeature(
  access: { planCode: StoreSubscriptionPlan },
  feature: StoreConsoleFeature | undefined,
) {
  if (!feature) return true;
  return hasRequiredPlan(access.planCode, feature);
}

export function formatPlanName(planCode: StoreSubscriptionPlan) {
  if (planCode === 'pro') return 'Pro';
  if (planCode === 'standard') return 'Standard';
  return 'Basic';
}
