import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { DATABASE_POOL } from '../database/database.constants.js';

type AdminContextRow = {
  roles: string[];
};

type StoreContextRow = {
  store_id: string;
  roles: string[];
};

@Injectable()
export class SessionContextService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getContextsForUser(userId: string) {
    const [adminContexts, storeContexts] = await Promise.all([
      this.getAdminContexts(userId),
      this.getStoreContexts(userId),
    ]);

    return [...adminContexts, ...storeContexts];
  }

  private async getAdminContexts(userId: string) {
    const result = await this.pool.query<AdminContextRow>(
      `
        select array_agg(distinct role_code) as roles
        from (
          select base_role.code as role_code
          from access.admin_memberships am
          join access.roles base_role on base_role.id = am.base_role_id
          where am.user_id = $1
            and am.status = 'active'

          union all

          select bundle_role.code as role_code
          from access.admin_memberships am
          join access.admin_bundle_assignments aba on aba.admin_membership_id = am.id
          join access.roles bundle_role on bundle_role.id = aba.role_id
          where am.user_id = $1
            and am.status = 'active'
        ) role_codes
      `,
      [userId],
    );

    const roles = result.rows[0]?.roles ?? [];
    if (!roles.length) {
      return [];
    }

    return [
      {
        type: 'admin' as const,
        roles,
      },
    ];
  }

  private async getStoreContexts(userId: string) {
    const result = await this.pool.query<StoreContextRow>(
      `
        select
          sm.store_id,
          array_agg(distinct role.code) as roles
        from access.store_memberships sm
        join access.roles role on role.id = sm.role_id
        where sm.user_id = $1
          and sm.status = 'active'
        group by sm.store_id
        order by sm.store_id asc
      `,
      [userId],
    );

    return result.rows.map((row: StoreContextRow) => ({
      type: 'store' as const,
      storeId: row.store_id,
      roles: row.roles ?? [],
    }));
  }
}
