import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import type { AdminAuthContext, AuthSession } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type PlatformSettingsPayload = {
  accessPolicy: {
    ownerControlsDestructiveActions: boolean;
    managerCanManageSalesmen: boolean;
    managerCanRemoveSalesmen: boolean;
  };
  defaults: {
    operatingHours: string;
    notificationsEmail: string;
    reportWindowDays: number;
  };
  governance: {
    requireConfirmationForDeletes: boolean;
    auditRetentionDays: number;
    changeReviewMinutes: number;
  };
};

type PlatformSettingsUpdatePayload = {
  accessPolicy?: Partial<PlatformSettingsPayload['accessPolicy']>;
  defaults?: Partial<PlatformSettingsPayload['defaults']>;
  governance?: Partial<PlatformSettingsPayload['governance']>;
};

const defaultSettings: PlatformSettingsPayload = {
  accessPolicy: {
    ownerControlsDestructiveActions: true,
    managerCanManageSalesmen: true,
    managerCanRemoveSalesmen: false,
  },
  defaults: {
    operatingHours: '09:00-18:00',
    notificationsEmail: 'ops@example.com',
    reportWindowDays: 30,
  },
  governance: {
    requireConfirmationForDeletes: true,
    auditRetentionDays: 365,
    changeReviewMinutes: 15,
  },
};

@Injectable()
export class PlatformSettingsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getSettingsForSession(authContext: AdminAuthContext | null, session: AuthSession | null) {
    this.assertAdminContext(authContext);
    const tenantId = this.requireTenantId(session);
    const settings = await this.readSettings(tenantId);
    return { settings };
  }

  async updateSettings(
    authContext: AdminAuthContext | null,
    session: AuthSession | null,
    payload: PlatformSettingsUpdatePayload,
  ) {
    this.assertAdminContext(authContext);
    const tenantId = this.requireTenantId(session);
    const nextSettings = this.mergeSettings(await this.readSettings(tenantId), payload);

    await this.pool.query(
      `
        insert into platform.settings (tenant_id, key, value_json, updated_by, created_at, updated_at)
        values ($1, 'admin_console', $2::jsonb, $3, now(), now())
        on conflict (tenant_id, key) do update set
          value_json = excluded.value_json,
          updated_by = excluded.updated_by,
          updated_at = now()
      `,
      [tenantId, JSON.stringify(nextSettings), session?.user.id ?? null],
    );

    return { settings: nextSettings };
  }

  private async readSettings(tenantId: string) {
    const result = await this.pool.query<{ value_json: PlatformSettingsPayload }>(
      `
        select value_json
        from platform.settings
        where tenant_id = $1
          and key = 'admin_console'
        limit 1
      `,
      [tenantId],
    );

    const settings = result.rows[0]?.value_json;
    return this.mergeSettings(defaultSettings, settings ?? {});
  }

  private mergeSettings(
    base: PlatformSettingsPayload,
    override: PlatformSettingsUpdatePayload,
  ): PlatformSettingsPayload {
    return {
      accessPolicy: {
        ...base.accessPolicy,
        ...override.accessPolicy,
      },
      defaults: {
        ...base.defaults,
        ...override.defaults,
      },
      governance: {
        ...base.governance,
        ...override.governance,
      },
    };
  }

  private assertAdminContext(authContext: AdminAuthContext | null) {
    if (!authContext || authContext.type !== 'admin') {
      throw new ForbiddenException('Admin context is required');
    }
  }

  private requireTenantId(session: AuthSession | null) {
    if (!session) {
      throw new ForbiddenException('Session is required');
    }

    return session.user.tenantId;
  }
}
