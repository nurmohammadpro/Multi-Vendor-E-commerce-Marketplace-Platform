import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async recordUserAction(payload: {
    tenantId: string;
    actorUserId: string | null;
    storeId?: string | null;
    actionCode: string;
    resourceType: string;
    resourceId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }) {
    await this.pool.query(
      `
        insert into audit.logs (
          id,
          tenant_id,
          actor_user_id,
          actor_type,
          store_id,
          action_code,
          resource_type,
          resource_id,
          before_json,
          after_json,
          created_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          'user',
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::jsonb,
          now()
        )
      `,
      [
        payload.tenantId,
        payload.actorUserId,
        payload.storeId ?? null,
        payload.actionCode,
        payload.resourceType,
        payload.resourceId ?? null,
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
      ],
    );
  }
}
