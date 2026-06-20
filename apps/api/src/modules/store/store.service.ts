import { randomBytes, createHash } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type InviteStaffPayload = {
  invitedEmail?: string;
  invitedPhone?: string;
  roleCode: 'store_owner' | 'store_manager' | 'store_salesman';
};

type UpdateMembershipPayload = {
  status?: 'active' | 'suspended' | 'removed';
  roleCode?: 'store_owner' | 'store_manager' | 'store_salesman';
};

@Injectable()
export class StoreService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getMyStores(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    const result = await this.pool.query(
      `
        select
          s.id,
          s.store_code,
          s.name,
          s.slug,
          s.status,
          array_agg(distinct r.code order by r.code) as roles
        from access.store_memberships sm
        join store.stores s on s.id = sm.store_id
        join access.roles r on r.id = sm.role_id
        where sm.user_id = $1
          and sm.status = 'active'
        group by s.id, s.store_code, s.name, s.slug, s.status
        order by s.name asc
      `,
      [session.user.id],
    );

    return {
      stores: result.rows,
    };
  }

  async getStore(storeId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          s.id,
          s.store_code,
          s.name,
          s.name_bn,
          s.slug,
          s.phone,
          s.email,
          s.status,
          s.subscription_status,
          ss.timezone,
          ss.currency_code,
          ss.locale,
          ss.allow_negative_stock,
          ss.low_stock_threshold_default
        from store.stores s
        left join store.store_settings ss on ss.store_id = s.id
        where s.id = $1
        limit 1
      `,
      [storeId],
    );

    const store = result.rows[0];
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return { store };
  }

  async getStaff(storeId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          sm.id,
          sm.user_id,
          sm.status,
          sm.joined_at,
          sm.created_at,
          r.code as role_code,
          u.email,
          u.phone,
          up.full_name
        from access.store_memberships sm
        join access.roles r on r.id = sm.role_id
        join identity.users u on u.id = sm.user_id
        left join identity.user_profiles up on up.user_id = u.id
        where sm.store_id = $1
        order by sm.created_at asc
      `,
      [storeId],
    );

    return {
      staff: result.rows,
    };
  }

  async inviteStaff(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: InviteStaffPayload,
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    const roleId = await this.findRoleId(payload.roleCode);
    const invitationToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(invitationToken).digest('hex');

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    const result = await this.pool.query(
      `
        insert into store.store_invitations (
          id,
          tenant_id,
          store_id,
          invited_email,
          invited_phone,
          role_id,
          token_hash,
          expires_at,
          created_by,
          created_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2::citext,
          $3,
          $4,
          $5,
          $6,
          $7,
          now()
        from store.stores s
        where s.id = $1
        returning id, invited_email, invited_phone, expires_at
      `,
      [
        storeId,
        payload.invitedEmail ?? null,
        payload.invitedPhone ?? null,
        roleId,
        tokenHash,
        expiresAt.toISOString(),
        session.user.id,
      ],
    );

    return {
      invitation: result.rows[0],
      invitationToken,
    };
  }

  async updateMembership(
    storeId: string,
    membershipId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: UpdateMembershipPayload,
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    const membership = await this.pool.query<{
      id: string;
      user_id: string;
      role_id: string;
      status: string;
    }>(
      `
        select id, user_id, role_id, status
        from access.store_memberships
        where id = $1
          and store_id = $2
        limit 1
      `,
      [membershipId, storeId],
    );

    const currentMembership = membership.rows[0];
    if (!currentMembership) {
      throw new NotFoundException('Store membership not found');
    }

    const nextRoleId = payload.roleCode ? await this.findRoleId(payload.roleCode) : currentMembership.role_id;
    const nextStatus = payload.status ?? currentMembership.status;

    await this.pool.query(
      `
        update access.store_memberships
        set role_id = $2,
            status = $3,
            updated_at = now()
        where id = $1
      `,
      [membershipId, nextRoleId, nextStatus],
    );

    return {
      membershipId,
      roleCode: payload.roleCode ?? null,
      status: nextStatus,
      updatedBy: session.user.id,
    };
  }

  private assertStoreAccess(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
  ) {
    if (!authContext || authContext.type !== 'store') {
      throw new ForbiddenException('Store context is required');
    }

    if (authContext.storeId !== storeId) {
      throw new ForbiddenException('Store context does not match route');
    }

    if (headerStoreId && headerStoreId !== storeId) {
      throw new ForbiddenException('Store header does not match route');
    }
  }

  private async findRoleId(roleCode: string) {
    const result = await this.pool.query<{ id: string }>(
      `
        select id
        from access.roles
        where code = $1
        limit 1
      `,
      [roleCode],
    );

    const role = result.rows[0];
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    return role.id;
  }
}
