export const permissionGroups = {
  inventory: [
    'inventory.adjust.direct',
    'inventory.adjust.request',
    'inventory.adjust.approve',
    'inventory.view',
  ],
  sales: ['sales.pos.create', 'sales.report.view'],
  billing: ['billing.subscription.manage'],
} as const;

export function hasPermission(permissions: string[], required: string) {
  return permissions.includes(required);
}
