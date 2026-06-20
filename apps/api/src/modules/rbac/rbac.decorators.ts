import { SetMetadata } from '@nestjs/common';

import { CONTEXT_TYPE_METADATA_KEY, PERMISSIONS_METADATA_KEY } from './rbac.constants.js';

export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
}

export function RequireContext(type: 'admin' | 'store' | 'customer') {
  return SetMetadata(CONTEXT_TYPE_METADATA_KEY, type);
}
