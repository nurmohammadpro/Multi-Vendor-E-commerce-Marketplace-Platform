import { randomBytes, createHash } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { hashPassword } from '@mvp/auth';

import type { AdminAuthContext, AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
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

type CreateStorePayload = {
  storeCode: string;
  name: string;
  nameBn?: string;
  slug: string;
  phone: string;
  email?: string;
  timezone: string;
  locale: 'en' | 'bn';
};

type UpdateStorePayload = {
  name?: string;
  nameBn?: string | null;
  phone?: string;
  email?: string | null;
  status?: 'pending' | 'active' | 'suspended' | 'inactive';
};

type UpdateStoreSettingsPayload = {
  timezone?: string;
  currencyCode?: string;
  locale?: 'en' | 'bn';
  receiptFooter?: string | null;
  invoicePrefix?: string | null;
  allowNegativeStock?: boolean;
  lowStockThresholdDefault?: number | null;
};

type AcceptInvitationPayload = {
  token: string;
  fullName: string;
  password: string;
};

@Injectable()
export class StoreService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  async createStore(session: AuthSession | null, payload: CreateStorePayload) {
    const userId = this.requireUserId(session);
    const tenantId = session?.user.tenantId ?? '';

    const result = await this.pool.query<{
      id: string;
      store_code: string;
      name: string;
      slug: string;
      status: string;
    }>(
      `
        with owner_user as (
          select id, tenant_id
          from identity.users
          where id = $1
          limit 1
        ),
        created_store as (
          insert into store.stores (
            id,
            tenant_id,
            owner_user_id,
            store_code,
            name,
            name_bn,
            slug,
            phone,
            email,
            status,
            subscription_status,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            ou.tenant_id,
            ou.id,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::citext,
            'active',
            'active',
            now(),
            now()
          from owner_user ou
          returning id, tenant_id, owner_user_id, store_code, name, slug, status
        ),
        created_settings as (
          insert into store.store_settings (
            store_id,
            timezone,
            currency_code,
            locale,
            allow_negative_stock,
            created_at,
            updated_at
          )
          select
            cs.id,
            $8,
            'BDT',
            $9,
            false,
            now(),
            now()
          from created_store cs
        ),
        created_membership as (
          insert into access.store_memberships (
            id,
            tenant_id,
            store_id,
            user_id,
            role_id,
            status,
            joined_at,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            cs.tenant_id,
            cs.id,
            cs.owner_user_id,
            r.id,
            'active',
            now(),
            now(),
            now()
          from created_store cs
          join access.roles r on r.code = 'store_owner'
        )
        select id, store_code, name, slug, status
        from created_store
      `,
      [
        userId,
        payload.storeCode,
        payload.name,
        payload.nameBn ?? null,
        payload.slug,
        payload.phone,
        payload.email ?? null,
        payload.timezone,
        payload.locale,
      ],
    );

    const store = result.rows[0];
    await this.auditService.recordUserAction({
      tenantId,
      actorUserId: userId,
      storeId: store.id,
      actionCode: 'store.create',
      resourceType: 'store',
      resourceId: store.id,
      after: store,
    });

    return { store };
  }

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

  async listPlatformStores(authContext: AdminAuthContext | null) {
    this.assertAdminContext(authContext);

    const result = await this.pool.query(
      `
        select
          s.id,
          s.store_code,
          s.name,
          s.slug,
          s.phone,
          s.email,
          s.status,
          s.subscription_status,
          s.created_at,
          s.updated_at,
          ss.timezone,
          ss.currency_code,
          ss.locale,
          u.email as owner_email,
          u.phone as owner_phone,
          up.full_name as owner_name,
          coalesce(count(distinct sm.id), 0)::int as staff_count
        from store.stores s
        left join store.store_settings ss on ss.store_id = s.id
        left join identity.users u on u.id = s.owner_user_id
        left join identity.user_profiles up on up.user_id = u.id
        left join access.store_memberships sm on sm.store_id = s.id and sm.status = 'active'
        group by s.id, ss.store_id, u.id, up.user_id
        order by s.created_at desc
      `,
    );

    return { stores: result.rows };
  }

  async adminUpdateStoreStatus(
    storeId: string,
    authContext: AdminAuthContext | null,
    session: AuthSession | null,
    status: 'pending' | 'active' | 'suspended' | 'inactive',
  ) {
    this.assertAdminContext(authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query<{
      id: string;
      store_code: string;
      name: string;
      status: string;
      updated_at: string;
    }>(
      `
        update store.stores
        set status = $2,
            updated_at = now()
        where id = $1
        returning id, store_code, name, status, updated_at
      `,
      [storeId, status],
    );

    const store = result.rows[0];
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.auditService.recordUserAction({
      tenantId: session?.user.tenantId ?? '',
      actorUserId: userId,
      storeId,
      actionCode: 'platform.store.status.update',
      resourceType: 'store',
      resourceId: storeId,
      after: store,
    });

    return { store };
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

  async updateStore(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: UpdateStorePayload,
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const tenantId = session?.user.tenantId ?? '';

    const result = await this.pool.query<{
      id: string;
      store_code: string;
      name: string;
      slug: string;
      phone: string;
      email: string | null;
      status: string;
      updated_at: string;
    }>(
      `
        update store.stores
        set
          name = coalesce($2, name),
          name_bn = case when $3::text is null then name_bn else $3 end,
          phone = coalesce($4, phone),
          email = case when $5::citext is null then email else $5::citext end,
          status = coalesce($6, status),
          updated_at = now()
        where id = $1
        returning id, store_code, name, slug, phone, email, status, updated_at
      `,
      [
        storeId,
        payload.name ?? null,
        payload.nameBn === undefined ? null : payload.nameBn,
        payload.phone ?? null,
        payload.email === undefined ? null : payload.email,
        payload.status ?? null,
      ],
    );

    const store = result.rows[0];
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.auditService.recordUserAction({
      tenantId,
      actorUserId: userId,
      storeId: store.id,
      actionCode: 'store.update',
      resourceType: 'store',
      resourceId: store.id,
      after: store,
    });

    return { store };
  }

  async getSettings(storeId: string, headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);

    const result = await this.pool.query(
      `
        select
          store_id,
          timezone,
          currency_code,
          locale,
          receipt_footer,
          invoice_prefix,
          allow_negative_stock,
          low_stock_threshold_default
        from store.store_settings
        where store_id = $1
        limit 1
      `,
      [storeId],
    );

    const settings = result.rows[0];
    if (!settings) {
      throw new NotFoundException('Store settings not found');
    }

    return { settings };
  }

  async updateSettings(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: UpdateStoreSettingsPayload,
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const tenantId = session?.user.tenantId ?? '';

    const result = await this.pool.query<{
      store_id: string;
      timezone: string;
      currency_code: string;
      locale: string;
      receipt_footer: string | null;
      invoice_prefix: string | null;
      allow_negative_stock: boolean;
      low_stock_threshold_default: number | null;
      updated_at: string;
    }>(
      `
        update store.store_settings
        set
          timezone = coalesce($2, timezone),
          currency_code = coalesce($3, currency_code),
          locale = coalesce($4, locale),
          receipt_footer = case when $5::text is null then receipt_footer else $5 end,
          invoice_prefix = case when $6::text is null then invoice_prefix else $6 end,
          allow_negative_stock = coalesce($7, allow_negative_stock),
          low_stock_threshold_default = case when $8::integer is null then low_stock_threshold_default else $8 end,
          updated_at = now()
        where store_id = $1
        returning
          store_id,
          timezone,
          currency_code,
          locale,
          receipt_footer,
          invoice_prefix,
          allow_negative_stock,
          low_stock_threshold_default,
          updated_at
      `,
      [
        storeId,
        payload.timezone ?? null,
        payload.currencyCode ?? null,
        payload.locale ?? null,
        payload.receiptFooter === undefined ? null : payload.receiptFooter,
        payload.invoicePrefix === undefined ? null : payload.invoicePrefix,
        payload.allowNegativeStock ?? null,
        payload.lowStockThresholdDefault === undefined ? null : payload.lowStockThresholdDefault,
      ],
    );

    const settings = result.rows[0];
    if (!settings) {
      throw new NotFoundException('Store settings not found');
    }

    await this.auditService.recordUserAction({
      tenantId,
      actorUserId: userId,
      storeId,
      actionCode: 'store.settings.update',
      resourceType: 'store_settings',
      resourceId: storeId,
      after: settings,
    });

    return { settings };
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

    const response = {
      membershipId,
      roleCode: payload.roleCode ?? null,
      status: nextStatus,
      updatedBy: session.user.id,
    };

    await this.auditService.recordUserAction({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      storeId,
      actionCode: 'store.membership.update',
      resourceType: 'store_membership',
      resourceId: membershipId,
      after: response,
    });

    return response;
  }

  async acceptInvitation(payload: AcceptInvitationPayload) {
    const tokenHash = createHash('sha256').update(payload.token).digest('hex');
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const invitationResult = await client.query<{
        id: string;
        tenant_id: string;
        store_id: string;
        invited_email: string | null;
        invited_phone: string | null;
        role_id: string;
        expires_at: string;
        accepted_at: string | null;
      }>(
        `
          select id, tenant_id, store_id, invited_email, invited_phone, role_id, expires_at, accepted_at
          from store.store_invitations
          where token_hash = $1
          limit 1
          for update
        `,
        [tokenHash],
      );

      const invitation = invitationResult.rows[0];
      if (!invitation || invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedException('Invitation expired or invalid');
      }

      const passwordHash = await hashPassword(payload.password);
      const userResult = await client.query<{ id: string }>(
        `
          insert into identity.users (
            id,
            tenant_id,
            email,
            phone,
            password_hash,
            status,
            preferred_locale,
            created_at,
            updated_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2::citext,
            $3,
            $4,
            'active',
            'en',
            now(),
            now()
          )
          on conflict (email) do update set
            phone = coalesce(excluded.phone, identity.users.phone),
            password_hash = excluded.password_hash,
            status = 'active',
            updated_at = now()
          returning id
        `,
        [
          invitation.tenant_id,
          invitation.invited_email,
          invitation.invited_phone,
          passwordHash,
        ],
      );

      const userId = userResult.rows[0].id;

      await client.query(
        `
          insert into identity.user_profiles (
            user_id,
            full_name,
            created_at,
            updated_at
          )
          values ($1, $2, now(), now())
          on conflict (user_id) do update set
            full_name = excluded.full_name,
            updated_at = now()
        `,
        [userId, payload.fullName],
      );

      await client.query(
        `
          insert into access.store_memberships (
            id,
            tenant_id,
            store_id,
            user_id,
            role_id,
            status,
            joined_at,
            created_at,
            updated_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            'active',
            now(),
            now(),
            now()
          )
          on conflict (store_id, user_id) where status in ('active', 'invited', 'suspended')
          do update set
            role_id = excluded.role_id,
            status = 'active',
            joined_at = now(),
            updated_at = now()
        `,
        [invitation.tenant_id, invitation.store_id, userId, invitation.role_id],
      );

      await client.query(
        `
          update store.store_invitations
          set accepted_at = now()
          where id = $1
        `,
        [invitation.id],
      );

      await client.query('commit');
      const response = {
        success: true,
        storeId: invitation.store_id,
        userId,
      };

      await this.auditService.recordUserAction({
        tenantId: invitation.tenant_id,
        actorUserId: userId,
        storeId: invitation.store_id,
        actionCode: 'store.invitation.accept',
        resourceType: 'store_invitation',
        resourceId: invitation.id,
        after: response,
      });

      return response;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
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

  private assertAdminContext(authContext: AdminAuthContext | null) {
    if (!authContext || authContext.type !== 'admin') {
      throw new ForbiddenException('Admin context is required');
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

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    return session.user.id;
  }
}
