export type StoreSubscriptionPlan = 'basic' | 'standard' | 'pro' | 'custom';

export type StoreConsoleFeature =
  | 'dashboard'
  | 'catalog'
  | 'inventory'
  | 'pos'
  | 'returns'
  | 'purchases'
  | 'receivables'
  | 'customers'
  | 'reports'
  | 'shipping'
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
  custom: 4,
};

const featurePlanRequirements: Record<StoreConsoleFeature, StoreSubscriptionPlan> = {
  dashboard: 'basic',
  catalog: 'basic',
  inventory: 'basic',
  pos: 'basic',
  returns: 'basic',
  purchases: 'basic',
  receivables: 'basic',
  customers: 'basic',
  reports: 'basic',
  shipping: 'basic',
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
  access: { planCode: StoreSubscriptionPlan; planFeatures?: string[] },
  feature: StoreConsoleFeature | undefined,
) {
  if (!feature) return true;
  // For custom plans, check the features_json array from the backend
  if (access.planCode === 'custom' && access.planFeatures) {
    return access.planFeatures.includes(feature);
  }
  return hasRequiredPlan(access.planCode, feature);
}

export function formatPlanName(planCode: StoreSubscriptionPlan) {
  if (planCode === 'pro') return 'Pro';
  if (planCode === 'standard') return 'Standard';
  if (planCode === 'custom') return 'Custom';
  return 'Basic';
}
