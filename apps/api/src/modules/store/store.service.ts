import { randomBytes, createHash } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { hashPassword } from '@mvp/auth';

import type { AdminAuthContext, AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type InviteStaffPayload = {
  invitedEmail?: string;
  invitedPhone?: string;
  roleCode: 'store_owner' | 'store_manager' | 'store_salesman';
};

type UpdateMembershipPayload = {
  status?: 'active' | 'suspended' | 'removed';
  roleCode?: 'store_owner' | 'store_manager' | 'store_salesman';
  locationId?: string | null;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  password?: string;
  address?: string | null;
  joinDate?: string;
  monthlySalary?: number;
  employmentStatus?: 'active' | 'inactive' | 'terminated';
  employmentType?: string;
  designation?: string;
  department?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salaryPaymentMode?: 'cash' | 'bank_transfer' | 'mobile_banking';
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  mobileBankingType?: string;
  mobileBankingNumber?: string;
  educationSummary?: string;
  experienceSummary?: string;
  trainingSummary?: string;
  note?: string | null;
};

type StaffEmploymentProfilePayload = {
  joinDate?: string;
  monthlySalary?: number;
  employmentStatus?: 'active' | 'inactive' | 'terminated';
  employmentType?: string;
  designation?: string;
  department?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salaryPaymentMode?: 'cash' | 'bank_transfer' | 'mobile_banking';
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  mobileBankingType?: string;
  mobileBankingNumber?: string;
  educationSummary?: string;
  experienceSummary?: string;
  trainingSummary?: string;
  note?: string | null;
};

type CreateStaffMemberPayload = StaffEmploymentProfilePayload & {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  address: string;
  roleCode: 'store_manager' | 'store_salesman';
  locationId?: string;
};

type CreateStorePayload = {
  name: string;
  nameBn?: string;
  logoUrl?: string;
  address?: string;
  phone: string;
  email?: string;
  timezone: string;
  locale: 'en' | 'bn';
  storeCode?: string;
  slug?: string;
};

type AdminCreateStorePayload = CreateStorePayload & {
  ownerFullName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerPassword: string;
  planCode?: string;
};

type UpdateStorePayload = {
  name?: string;
  nameBn?: string | null;
  logoUrl?: string | null;
  address?: string | null;
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
  receiptType?: 'pos' | 'a5' | 'a4';
  allowNegativeStock?: boolean;
  lowStockThresholdDefault?: number | null;
};

type AcceptInvitationPayload = {
  token: string;
  fullName: string;
  password: string;
};

type StoreStaffRole = 'store_owner' | 'store_manager' | 'store_salesman';

@Injectable()
export class StoreService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
  ) {}

  async createStore(session: AuthSession | null, payload: CreateStorePayload) {
    const userId = this.requireUserId(session);
    const tenantId = session?.user.tenantId ?? '';
    const storeCode = await this.resolveStoreCode(tenantId, payload.storeCode, payload.name);
    const slug = await this.resolveStoreSlug(payload.slug, payload.name);

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
            logo_url,
            address_text,
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
            $7,
            $8,
            $9::citext,
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
            $10,
            'BDT',
            $11,
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
        storeCode,
        payload.name,
        payload.nameBn ?? null,
        payload.logoUrl ?? null,
        payload.address ?? null,
        slug,
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

  async adminCreateStore(session: AuthSession | null, payload: AdminCreateStorePayload) {
    const userId = this.requireUserId(session);
    const tenantId = session?.user.tenantId ?? '';
    const storeCode = await this.resolveStoreCode(tenantId, payload.storeCode, payload.name);
    const slug = await this.resolveStoreSlug(payload.slug, payload.name);
    const ownerFullName = payload.ownerFullName.trim();
    const ownerEmail = payload.ownerEmail?.trim().toLowerCase() || null;
    const ownerPhone = payload.ownerPhone?.trim() || null;
    const ownerPassword = payload.ownerPassword;
    const passwordHash = await hashPassword(ownerPassword);

    const client = await this.pool.connect();

    try {
      await client.query('begin');

      let ownerUserId: string | null = null;

      if (ownerEmail) {
        const existingUser = await client.query<{ id: string }>(
          `select id from identity.users where email = $1::citext limit 1`,
          [ownerEmail],
        );
        ownerUserId = existingUser.rows[0]?.id ?? null;
      }

      if (!ownerUserId && ownerPhone) {
        const existingUser = await client.query<{ id: string }>(
          `select id from identity.users where phone = $1 limit 1`,
          [ownerPhone],
        );
        ownerUserId = existingUser.rows[0]?.id ?? null;
      }

      if (ownerUserId) {
        await client.query(
          `
            update identity.users
            set email = coalesce($2::citext, email),
                phone = coalesce($3, phone),
                password_hash = $4,
                status = 'active',
                updated_at = now()
            where id = $1
          `,
          [ownerUserId, ownerEmail, ownerPhone, passwordHash],
        );
      } else {
        const insertResult = await client.query<{ id: string }>(
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
            returning id
          `,
          [tenantId, ownerEmail, ownerPhone, passwordHash],
        );
        ownerUserId = insertResult.rows[0]?.id ?? null;
      }

      if (!ownerUserId) {
        throw new Error('Unable to create store owner');
      }

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
        [ownerUserId, ownerFullName],
      );

      const storeResult = await client.query<{
        id: string;
        store_code: string;
        name: string;
        logo_url: string | null;
        address_text: string | null;
        slug: string;
        status: string;
      }>(
        `
          insert into store.stores (
            id,
            tenant_id,
            owner_user_id,
            store_code,
            name,
            name_bn,
            logo_url,
            address_text,
            slug,
            phone,
            email,
            status,
            subscription_status,
            created_at,
            updated_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::citext,
            'active',
            'active',
            now(),
            now()
          )
          returning id, store_code, name, logo_url, address_text, slug, status
        `,
        [
          tenantId,
          ownerUserId,
          storeCode,
          payload.name,
          payload.nameBn ?? null,
          payload.logoUrl ?? null,
          payload.address ?? null,
          slug,
          payload.phone,
          payload.email ?? null,
        ],
      );

      const store = storeResult.rows[0];

      await client.query(
        `
          insert into store.store_settings (
            store_id,
            timezone,
            currency_code,
            locale,
            allow_negative_stock,
            created_at,
            updated_at
          )
          values (
            $1,
            $2,
            'BDT',
            $3,
            false,
            now(),
            now()
          )
        `,
        [store.id, payload.timezone, payload.locale],
      );

      const roleResult = await client.query<{ id: string }>(
        `select id from access.roles where code = 'store_owner' limit 1`,
      );
      const roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        throw new Error('Store owner role is missing');
      }

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
        [tenantId, store.id, ownerUserId, roleId],
      );

      // Create subscription for the selected plan (defaults to 'basic').
      const planCode = payload.planCode || 'basic';
      const planResult = await client.query<{ id: string }>(
        `select id from billing.plans where tenant_id = $1 and code = $2 and status = 'active' limit 1`,
        [tenantId, planCode],
      );
      const planId = planResult.rows[0]?.id;
      if (planId) {
        const now = new Date();
        const renewalAt = new Date(now);
        renewalAt.setMonth(renewalAt.getMonth() + 1);
        await client.query(
          `
            insert into billing.subscriptions (
              id, tenant_id, store_id, plan_id, status,
              start_at, renewal_at, auto_renew, created_at, updated_at
            )
            values (
              gen_random_uuid(), $1, $2, $3, 'active',
              $4, $5, true, now(), now()
            )
          `,
          [tenantId, store.id, planId, now.toISOString(), renewalAt.toISOString()],
        );
      }

      await client.query('commit');

      await this.auditService.recordUserAction({
        tenantId,
        actorUserId: userId,
        storeId: store.id,
        actionCode: 'platform.store.create',
        resourceType: 'store',
        resourceId: store.id,
        after: {
          ...store,
          ownerFullName,
          ownerEmail,
          ownerPhone,
        },
      });

      return {
        store,
        owner: {
          userId: ownerUserId,
          fullName: ownerFullName,
          email: ownerEmail,
          phone: ownerPhone,
        },
        login: {
          identifier: ownerEmail || ownerPhone,
          password: ownerPassword,
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
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
          s.logo_url,
          s.address_text,
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
          coalesce(count(distinct sm.id), 0)::int as staff_count,
          sub.id as subscription_id,
          sub.status as billing_status,
          sub.plan_code,
          sub.plan_name,
          sub.start_at as subscription_start_at,
          sub.end_at as subscription_end_at,
          sub.renewal_at as billing_due_at,
          sub.auto_renew as subscription_auto_renew,
          case
            when coalesce(sub.renewal_at, sub.end_at) is null then null
            else coalesce(sub.renewal_at, sub.end_at) + interval '3 months'
          end as deactivation_review_at,
          case
            when coalesce(sub.renewal_at, sub.end_at) is null then null
            else coalesce(sub.renewal_at, sub.end_at) + interval '6 months'
          end as delete_eligible_at,
          case
            when s.status = 'inactive'
              and coalesce(sub.renewal_at, sub.end_at) is not null
              and now() >= coalesce(sub.renewal_at, sub.end_at) + interval '6 months'
            then true
            else false
          end as can_delete,
          case
            when s.status <> 'inactive'
              and coalesce(sub.renewal_at, sub.end_at) is not null
              and now() >= coalesce(sub.renewal_at, sub.end_at) + interval '3 months'
            then true
            else false
          end as should_deactivate_review,
          coalesce(sales_count.cnt, 0) > 0 as has_sales,
          coalesce(sales_count.cnt, 0) = 0 as can_force_delete
        from store.stores s
        left join store.store_settings ss on ss.store_id = s.id
        left join identity.users u on u.id = s.owner_user_id
        left join identity.user_profiles up on up.user_id = u.id
        left join access.store_memberships sm on sm.store_id = s.id and sm.status = 'active'
        left join lateral (
          select
            sub.id,
            sub.status,
            sub.start_at,
            sub.end_at,
            sub.renewal_at,
            sub.auto_renew,
            p.code as plan_code,
            p.name as plan_name
          from billing.subscriptions sub
          join billing.plans p on p.id = sub.plan_id
          where sub.store_id = s.id
          order by coalesce(sub.renewal_at, sub.end_at, sub.start_at) desc nulls last, sub.created_at desc
          limit 1
        ) sub on true
        left join lateral (
          select count(*)::int as cnt
          from sales.sales sal
          where sal.store_id = s.id
        ) sales_count on true
        group by
          s.id,
          ss.store_id,
          u.id,
          up.user_id,
          sub.id,
          sub.status,
          sub.start_at,
          sub.end_at,
          sub.renewal_at,
          sub.auto_renew,
          p.code,
          p.name,
          sales_count.cnt
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

  async adminUpdateStore(
    storeId: string,
    authContext: AdminAuthContext | null,
    session: AuthSession | null,
    payload: UpdateStorePayload,
  ) {
    this.assertAdminContext(authContext);
    const userId = this.requireUserId(session);

    const result = await this.pool.query<{
      id: string;
      store_code: string;
      name: string;
      logo_url: string | null;
      address_text: string | null;
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
          logo_url = case when $4::text is null then logo_url else $4 end,
          address_text = case when $5::text is null then address_text else $5 end,
          phone = coalesce($6, phone),
          email = case when $7::citext is null then email else $7::citext end,
          status = coalesce($8, status),
          updated_at = now()
        where id = $1
        returning id, store_code, name, logo_url, address_text, slug, phone, email, status, updated_at
      `,
      [
        storeId,
        payload.name ?? null,
        payload.nameBn === undefined ? null : payload.nameBn,
        payload.logoUrl === undefined ? null : payload.logoUrl,
        payload.address === undefined ? null : payload.address,
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
      tenantId: session?.user.tenantId ?? '',
      actorUserId: userId,
      storeId,
      actionCode: 'platform.store.update',
      resourceType: 'store',
      resourceId: storeId,
      after: store,
    });

    return { store };
  }

  async adminDeleteStore(storeId: string, authContext: AdminAuthContext | null, session: AuthSession | null, force = false) {
    this.assertAdminContext(authContext);
    const userId = this.requireUserId(session);

    const storeResult = await this.pool.query<{
      id: string;
      tenant_id: string;
      store_code: string;
      name: string;
      status: string;
      subscription_status: string;
      delete_eligible_at: string | null;
      deactivation_review_at: string | null;
      billing_due_at: string | null;
      has_sales: boolean;
    }>(
      `
        select
          s.id,
          s.tenant_id,
          s.store_code,
          s.name,
          s.status,
          s.subscription_status,
          case
            when coalesce(sub.renewal_at, sub.end_at) is null then null
            else coalesce(sub.renewal_at, sub.end_at) + interval '6 months'
          end as delete_eligible_at,
          case
            when coalesce(sub.renewal_at, sub.end_at) is null then null
            else coalesce(sub.renewal_at, sub.end_at) + interval '3 months'
          end as deactivation_review_at,
          coalesce(sub.renewal_at, sub.end_at) as billing_due_at,
          coalesce(sales_count.cnt, 0) > 0 as has_sales
        from store.stores s
        left join lateral (
          select
            sub.end_at,
            sub.renewal_at
          from billing.subscriptions sub
          where sub.store_id = s.id
          order by coalesce(sub.renewal_at, sub.end_at, sub.start_at) desc nulls last, sub.created_at desc
          limit 1
        ) sub on true
        left join lateral (
          select count(*)::int as cnt
          from sales.sales sal
          where sal.store_id = s.id
        ) sales_count on true
        where s.id = $1
        limit 1
      `,
      [storeId],
    );

    const store = storeResult.rows[0];
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (force) {
      // Force delete: only allowed for stores with no sales data
      if (store.has_sales) {
        throw new ForbiddenException('Cannot force-delete a store that has sales data. Deactivate and wait for the standard deletion window instead.');
      }
    } else {
      // Standard deletion: must be inactive + 6 months overdue
      if (store.status !== 'inactive') {
        throw new ForbiddenException('Store must be inactive before deletion');
      }

      if (!store.delete_eligible_at) {
        throw new ForbiddenException('Store does not have a deletion window yet');
      }

      if (new Date(store.delete_eligible_at).getTime() > Date.now()) {
        throw new ForbiddenException('Store is not yet eligible for deletion');
      }
    }

    await this.pool.query('delete from store.stores where id = $1', [storeId]);

    await this.auditService.recordUserAction({
      tenantId: store.tenant_id,
      actorUserId: userId,
      storeId,
      actionCode: force ? 'platform.store.force_delete' : 'platform.store.delete',
      resourceType: 'store',
      resourceId: storeId,
      after: {
        storeId,
        storeCode: store.store_code,
        storeName: store.name,
        force,
        deletedAt: new Date().toISOString(),
      },
    });

    return {
      deleted: true,
      storeId,
      force,
      canDeleteAt: store.delete_eligible_at,
      deactivationReviewAt: store.deactivation_review_at,
      billingDueAt: store.billing_due_at,
    };
  }

  async adminResetStoreOwnerPassword(
    storeId: string,
    authContext: AdminAuthContext | null,
    session: AuthSession | null,
    payload: { password: string },
  ) {
    this.assertAdminContext(authContext);
    const userId = this.requireUserId(session);
    const passwordHash = await hashPassword(payload.password);

    const result = await this.pool.query<{
      store_id: string;
      owner_user_id: string;
      owner_email: string | null;
      owner_phone: string | null;
    }>(
      `
        update identity.users u
        set password_hash = $2,
            updated_at = now()
        from store.stores s
        where s.id = $1
          and u.id = s.owner_user_id
        returning s.id as store_id, u.id as owner_user_id, u.email as owner_email, u.phone as owner_phone
      `,
      [storeId, passwordHash],
    );

    const record = result.rows[0];
    if (!record) {
      throw new NotFoundException('Store owner not found');
    }

    await this.auditService.recordUserAction({
      tenantId: session?.user.tenantId ?? '',
      actorUserId: userId,
      storeId,
      actionCode: 'platform.store.owner_password.reset',
      resourceType: 'store_owner',
      resourceId: record.owner_user_id,
      after: {
        storeId,
        ownerUserId: record.owner_user_id,
        ownerEmail: record.owner_email,
        ownerPhone: record.owner_phone,
        rotatedAt: new Date().toISOString(),
      },
    });

    return {
      storeId,
      ownerUserId: record.owner_user_id,
      ownerEmail: record.owner_email,
      ownerPhone: record.owner_phone,
      password: payload.password,
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
          s.logo_url,
          s.address_text,
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
      logo_url: string | null;
      address_text: string | null;
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
          logo_url = case when $4::text is null then logo_url else $4 end,
          address_text = case when $5::text is null then address_text else $5 end,
          phone = coalesce($6, phone),
          email = case when $7::citext is null then email else $7::citext end,
          status = coalesce($8, status),
          updated_at = now()
        where id = $1
        returning id, store_code, name, logo_url, address_text, slug, phone, email, status, updated_at
      `,
      [
        storeId,
        payload.name ?? null,
        payload.nameBn === undefined ? null : payload.nameBn,
        payload.logoUrl === undefined ? null : payload.logoUrl,
        payload.address === undefined ? null : payload.address,
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
          receipt_type,
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
      receipt_type: 'pos' | 'a5' | 'a4';
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
          receipt_type = coalesce($9, receipt_type),
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
          receipt_type,
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
        payload.receiptType ?? null,
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

  async getStaff(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    const actorRole = this.requireStoreActorRole(authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            sm.id,
            sm.user_id,
            sm.status,
            sm.joined_at,
            sm.created_at,
            sm.location_id,
            r.code as role_code,
            u.email,
            u.phone,
            up.full_name,
            up.address_text,
            he.id as employee_id,
            he.employee_number,
            he.designation,
            he.department,
            he.employment_status,
            he.monthly_salary,
            il.name as location_name,
            count(*) over()::int as total_count
          from access.store_memberships sm
          join access.roles r on r.id = sm.role_id
          join identity.users u on u.id = sm.user_id
          left join identity.user_profiles up on up.user_id = u.id
          left join hr.employees he on he.store_id = sm.store_id and he.user_id = sm.user_id
          left join inventory.locations il on il.id = sm.location_id
          where sm.store_id = $1
            and (
              $2::text is null
              or coalesce(up.full_name, '') ilike '%' || $2::text || '%'
              or coalesce(u.email, '') ilike '%' || $2::text || '%'
              or coalesce(u.phone, '') ilike '%' || $2::text || '%'
              or coalesce(he.employee_number, '') ilike '%' || $2::text || '%'
              or coalesce(he.designation, '') ilike '%' || $2::text || '%'
              or coalesce(he.department, '') ilike '%' || $2::text || '%'
              or r.code ilike '%' || $2::text || '%'
            )
          order by sm.created_at asc
          limit $3
          offset $4
        ) staff
      `,
      [storeId, search, limit, offset],
    );
    const { items, total } = stripPaginationTotal(result.rows);

    return {
      staff: items,
      actorRole,
      capabilities: this.getStaffCapabilities(actorRole),
      pagination: { page, limit, total },
    };
  }

  async createStaffMember(
    storeId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: CreateStaffMemberPayload,
  ) {
    this.assertStoreAccess(storeId, headerStoreId, authContext);
    const actorUserId = this.requireUserId(session);
    const actorRole = this.requireStoreActorRole(authContext);
    this.assertCanInviteStaff(actorRole, payload.roleCode);
    await this.billingService.checkUserLimit(storeId);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const storeContext = await client.query<{ tenant_id: string }>(
        `
          select tenant_id
          from store.stores
          where id = $1
          limit 1
          for update
        `,
        [storeId],
      );

      const tenantId = storeContext.rows[0]?.tenant_id;
      if (!tenantId) {
        throw new NotFoundException('Store not found');
      }

      await this.assertUniqueUserIdentity(client, payload.email, payload.phone);

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
          returning id
        `,
        [tenantId, payload.email, payload.phone, passwordHash],
      );

      const userId = userResult.rows[0]?.id;
      if (!userId) {
        throw new Error('Unable to create store user');
      }

      await client.query(
        `
          insert into identity.user_profiles (
            user_id,
            full_name,
            address_text,
            created_at,
            updated_at
          )
          values ($1, $2, $3, now(), now())
        `,
        [userId, payload.fullName, payload.address],
      );

      const roleId = await this.findRoleIdWithClient(client, payload.roleCode);

      if (payload.roleCode === 'store_manager') {
        if (!payload.locationId) {
          throw new ForbiddenException('A location must be assigned when creating a manager.');
        }
        const location = await client.query<{ id: string }>(
          `select id from inventory.locations where id = $1 and store_id = $2 and status = 'active' limit 1`,
          [payload.locationId, storeId],
        );
        if (!location.rows[0]) {
          throw new NotFoundException('Assigned location not found or is not active.');
        }
      }

      await client.query(
        `
          insert into access.store_memberships (
            id,
            tenant_id,
            store_id,
            user_id,
            role_id,
            location_id,
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
            $5,
            'active',
            now(),
            now(),
            now()
          )
        `,
        [tenantId, storeId, userId, roleId, payload.locationId ?? null],
      );

      const employee = await this.upsertLinkedEmployee(client, {
        storeId,
        tenantId,
        userId,
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        roleCode: payload.roleCode,
        address: payload.address,
        membershipStatus: 'active',
        profile: payload,
      });

      await client.query('commit');

      const response = {
        userId,
        employeeId: employee.id,
        employeeNumber: employee.employee_number,
        roleCode: payload.roleCode,
        email: payload.email,
        phone: payload.phone,
      };

      await this.auditService.recordUserAction({
        tenantId,
        actorUserId,
        storeId,
        actionCode: 'store.staff.create',
        resourceType: 'store_membership',
        resourceId: userId,
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

    const actorRole = this.requireStoreActorRole(authContext);
    this.assertCanInviteStaff(actorRole, payload.roleCode);
    await this.billingService.checkUserLimit(storeId);

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

    const actorRole = this.requireStoreActorRole(authContext);

    const membership = await this.pool.query<{
      id: string;
      user_id: string;
      role_id: string;
      status: string;
      tenant_id: string;
      location_id: string | null;
    }>(
      `
        select id, user_id, role_id, status, tenant_id, location_id
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

    const targetRole = await this.getRoleCodeById(currentMembership.role_id);
    this.assertCanUpdateMembership(actorRole, targetRole, payload);

    const nextRoleId = payload.roleCode ? await this.findRoleId(payload.roleCode) : currentMembership.role_id;
    const nextStatus = payload.status ?? currentMembership.status;
    const nextRoleCode = payload.roleCode ?? targetRole;

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      if (payload.email !== undefined || payload.phone !== undefined) {
        await this.assertUniqueUserIdentity(
          client,
          payload.email ?? null,
          payload.phone ?? null,
          currentMembership.user_id,
        );
      }

      const passwordHash = payload.password ? await hashPassword(payload.password) : null;

      if (
        payload.email !== undefined
        || payload.phone !== undefined
        || passwordHash
      ) {
        await client.query(
          `
            update identity.users
            set
              email = case when $2::citext is null then email else $2::citext end,
              phone = case when $3::varchar is null then phone else $3::varchar end,
              password_hash = coalesce($4, password_hash),
              updated_at = now()
            where id = $1
          `,
          [
            currentMembership.user_id,
            payload.email === undefined ? null : payload.email,
            payload.phone === undefined ? null : payload.phone,
            passwordHash,
          ],
        );
      }

      if (
        payload.fullName
        || payload.address !== undefined
      ) {
        await client.query(
          `
            update identity.user_profiles
            set
              full_name = coalesce($2, full_name),
              address_text = case when $3::text is null then address_text else $3::text end,
              updated_at = now()
            where user_id = $1
          `,
          [
            currentMembership.user_id,
            payload.fullName ?? null,
            payload.address === undefined ? null : payload.address,
          ],
        );
      }

      const nextLocationId = payload.locationId !== undefined ? payload.locationId : currentMembership.location_id ?? null;

      if (nextRoleCode === 'store_manager' && !nextLocationId) {
        throw new ForbiddenException('A location must be assigned when the role is manager.');
      }

      await client.query(
        `
          update access.store_memberships
          set role_id = $2,
              status = $3,
              location_id = $4,
              updated_at = now()
          where id = $1
        `,
        [membershipId, nextRoleId, nextStatus, nextLocationId ?? null],
      );

      const userSnapshot = await client.query<{
        full_name: string | null;
        email: string | null;
        phone: string | null;
        address_text: string | null;
      }>(
        `
          select up.full_name, u.email::text, u.phone, up.address_text
          from identity.users u
          left join identity.user_profiles up on up.user_id = u.id
          where u.id = $1
          limit 1
        `,
        [currentMembership.user_id],
      );

      const profileRow = userSnapshot.rows[0];
      await this.upsertLinkedEmployee(client, {
        storeId,
        tenantId: currentMembership.tenant_id,
        userId: currentMembership.user_id,
        fullName: payload.fullName ?? profileRow?.full_name ?? 'Store Employee',
        phone: payload.phone === undefined ? profileRow?.phone ?? null : payload.phone,
        email: payload.email === undefined ? profileRow?.email ?? null : payload.email,
        roleCode: nextRoleCode,
        address: payload.address === undefined ? profileRow?.address_text ?? null : payload.address,
        membershipStatus: nextStatus as 'active' | 'invited' | 'suspended' | 'removed',
        profile: payload,
      });

      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const response = {
      membershipId,
      roleCode: nextRoleCode,
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

  private async findRoleIdWithClient(client: PoolClient, roleCode: string) {
    const result = await client.query<{ id: string }>(
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

  private async assertUniqueUserIdentity(
    client: PoolClient,
    email: string | null | undefined,
    phone: string | null | undefined,
    excludeUserId?: string,
  ) {
    const result = await client.query<{ id: string; email: string | null; phone: string | null }>(
      `
        select id, email::text, phone
        from identity.users
        where (
          ($1::citext is not null and email = $1::citext)
          or ($2::varchar is not null and phone = $2::varchar)
        )
          and ($3::uuid is null or id <> $3::uuid)
        limit 1
      `,
      [email ?? null, phone ?? null, excludeUserId ?? null],
    );

    const existing = result.rows[0];
    if (!existing) {
      return;
    }

    if (email && existing.email?.toLowerCase() === email.toLowerCase()) {
      throw new ForbiddenException('A user with this email already exists');
    }

    if (phone && existing.phone === phone) {
      throw new ForbiddenException('A user with this phone already exists');
    }
  }

  private async generateEmployeeNumber(client: PoolClient, storeId: string) {
    const storeResult = await client.query<{ store_code: string }>(
      `
        select store_code
        from store.stores
        where id = $1
        limit 1
      `,
      [storeId],
    );

    const storeCode = storeResult.rows[0]?.store_code ?? 'STORE';
    const prefix = this.normalizeStoreCodeFragment(storeCode).replace(/-/g, '').slice(0, 6) || 'STORE';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const countResult = await client.query<{ total: string }>(
        `
          select count(*)::text as total
          from hr.employees
          where store_id = $1
        `,
        [storeId],
      );

      const nextNumber = Number(countResult.rows[0]?.total ?? '0') + 1 + attempt;
      const candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
      const existing = await client.query<{ id: string }>(
        `
          select id
          from hr.employees
          where store_id = $1
            and employee_number = $2
          limit 1
        `,
        [storeId, candidate],
      );

      if (!existing.rows[0]) {
        return candidate;
      }
    }

    return `${prefix}-${upperHex(randomBytes(2))}`;
  }

  private mapMembershipToEmploymentStatus(
    membershipStatus: 'active' | 'invited' | 'suspended' | 'removed',
    explicitStatus?: 'active' | 'inactive' | 'terminated',
  ) {
    if (membershipStatus === 'removed') return 'terminated';
    if (membershipStatus === 'suspended') return 'inactive';
    return explicitStatus ?? 'active';
  }

  private async upsertLinkedEmployee(
    client: PoolClient,
    payload: {
      storeId: string;
      tenantId: string;
      userId: string;
      fullName: string;
      phone?: string | null;
      email?: string | null;
      roleCode: string;
      address?: string | null;
      membershipStatus: 'active' | 'invited' | 'suspended' | 'removed';
      profile: StaffEmploymentProfilePayload & { note?: string | null };
    },
  ) {
    const existingEmployee = await client.query<{ id: string; employee_number: string | null }>(
      `
        select id, employee_number
        from hr.employees
        where store_id = $1
          and user_id = $2
        limit 1
      `,
      [payload.storeId, payload.userId],
    );

    const employeeNumber = existingEmployee.rows[0]?.employee_number ?? await this.generateEmployeeNumber(client, payload.storeId);
    const employmentStatus = this.mapMembershipToEmploymentStatus(payload.membershipStatus, payload.profile.employmentStatus);
    const joinDate = payload.profile.joinDate ?? new Date().toISOString().slice(0, 10);

    if (!existingEmployee.rows[0]) {
      const insertResult = await client.query(
        `
          insert into hr.employees (
            id,
            tenant_id,
            store_id,
            user_id,
            employee_number,
            full_name,
            mobile_no,
            email,
            role_code,
            employment_status,
            join_date,
            monthly_salary,
            address_text,
            employment_type,
            designation,
            department,
            emergency_contact_name,
            emergency_contact_phone,
            salary_payment_mode,
            bank_name,
            bank_account_name,
            bank_account_number,
            mobile_banking_type,
            mobile_banking_number,
            education_summary,
            experience_summary,
            training_summary,
            note,
            created_at,
            updated_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::citext,
            $8,
            $9,
            $10::date,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23,
            $24,
            $25,
            $26,
            $27,
            now(),
            now()
          )
          returning *
        `,
        [
          payload.tenantId,
          payload.storeId,
          payload.userId,
          employeeNumber,
          payload.fullName,
          payload.phone ?? null,
          payload.email ?? null,
          payload.roleCode,
          employmentStatus,
          joinDate,
          payload.profile.monthlySalary ?? 0,
          payload.address ?? null,
          payload.profile.employmentType ?? 'permanent',
          payload.profile.designation ?? null,
          payload.profile.department ?? null,
          payload.profile.emergencyContactName ?? null,
          payload.profile.emergencyContactPhone ?? null,
          payload.profile.salaryPaymentMode ?? null,
          payload.profile.bankName ?? null,
          payload.profile.bankAccountName ?? null,
          payload.profile.bankAccountNumber ?? null,
          payload.profile.mobileBankingType ?? null,
          payload.profile.mobileBankingNumber ?? null,
          payload.profile.educationSummary ?? null,
          payload.profile.experienceSummary ?? null,
          payload.profile.trainingSummary ?? null,
          payload.profile.note ?? null,
        ],
      );

      return insertResult.rows[0];
    }

    const updateResult = await client.query(
      `
        update hr.employees
        set
          full_name = coalesce($3, full_name),
          mobile_no = case when $4::varchar is null then mobile_no else $4::varchar end,
          email = case when $5::citext is null then email else $5::citext end,
          role_code = coalesce($6, role_code),
          employment_status = coalesce($7, employment_status),
          join_date = coalesce($8::date, join_date),
          monthly_salary = coalesce($9, monthly_salary),
          address_text = case when $10::text is null then address_text else $10::text end,
          employment_type = coalesce($11, employment_type),
          designation = case when $12::varchar is null then designation else $12::varchar end,
          department = case when $13::varchar is null then department else $13::varchar end,
          emergency_contact_name = case when $14::varchar is null then emergency_contact_name else $14::varchar end,
          emergency_contact_phone = case when $15::varchar is null then emergency_contact_phone else $15::varchar end,
          salary_payment_mode = case when $16::varchar is null then salary_payment_mode else $16::varchar end,
          bank_name = case when $17::varchar is null then bank_name else $17::varchar end,
          bank_account_name = case when $18::varchar is null then bank_account_name else $18::varchar end,
          bank_account_number = case when $19::varchar is null then bank_account_number else $19::varchar end,
          mobile_banking_type = case when $20::varchar is null then mobile_banking_type else $20::varchar end,
          mobile_banking_number = case when $21::varchar is null then mobile_banking_number else $21::varchar end,
          education_summary = case when $22::text is null then education_summary else $22::text end,
          experience_summary = case when $23::text is null then experience_summary else $23::text end,
          training_summary = case when $24::text is null then training_summary else $24::text end,
          note = case when $25::text is null then note else $25::text end,
          updated_at = now()
        where store_id = $1
          and user_id = $2
        returning *
      `,
      [
        payload.storeId,
        payload.userId,
        payload.fullName,
        payload.phone === undefined ? null : payload.phone,
        payload.email === undefined ? null : payload.email,
        payload.roleCode,
        employmentStatus,
        payload.profile.joinDate ?? null,
        payload.profile.monthlySalary ?? null,
        payload.address === undefined ? null : payload.address,
        payload.profile.employmentType ?? null,
        payload.profile.designation ?? null,
        payload.profile.department ?? null,
        payload.profile.emergencyContactName ?? null,
        payload.profile.emergencyContactPhone ?? null,
        payload.profile.salaryPaymentMode ?? null,
        payload.profile.bankName ?? null,
        payload.profile.bankAccountName ?? null,
        payload.profile.bankAccountNumber ?? null,
        payload.profile.mobileBankingType ?? null,
        payload.profile.mobileBankingNumber ?? null,
        payload.profile.educationSummary ?? null,
        payload.profile.experienceSummary ?? null,
        payload.profile.trainingSummary ?? null,
        payload.profile.note === undefined ? null : payload.profile.note,
      ],
    );

    return updateResult.rows[0];
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

  private async getRoleCodeById(roleId: string) {
    const result = await this.pool.query<{ code: string }>(
      `
        select code
        from access.roles
        where id = $1
        limit 1
      `,
      [roleId],
    );

    const role = result.rows[0];
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role.code as StoreStaffRole;
  }

  private requireStoreActorRole(authContext: StoreAuthContext | null): StoreStaffRole {
    if (!authContext || authContext.type !== 'store') {
      throw new ForbiddenException('Store context is required');
    }

    if (authContext.roles.includes('store_owner')) {
      return 'store_owner';
    }

    if (authContext.roles.includes('store_manager')) {
      return 'store_manager';
    }

    return 'store_salesman';
  }

  private getStaffCapabilities(actorRole: StoreStaffRole) {
    return {
      canInviteManager: actorRole === 'store_owner',
      canInviteSalesman: actorRole === 'store_owner' || actorRole === 'store_manager',
      canUpdateManager: actorRole === 'store_owner',
      canUpdateSalesman: actorRole === 'store_owner' || actorRole === 'store_manager',
      canRemoveManager: actorRole === 'store_owner',
      canRemoveSalesman: actorRole === 'store_owner' || actorRole === 'store_manager',
    };
  }

  private assertCanInviteStaff(actorRole: StoreStaffRole, inviteRole: 'store_owner' | 'store_manager' | 'store_salesman') {
    if (inviteRole === 'store_owner') {
      throw new ForbiddenException('Store owner invitations are not allowed');
    }

    if (actorRole === 'store_manager' && inviteRole !== 'store_salesman') {
      throw new ForbiddenException('Managers can only invite salesmen');
    }
  }

  private assertCanUpdateMembership(
    actorRole: StoreStaffRole,
    targetRole: StoreStaffRole,
    payload: UpdateMembershipPayload,
  ) {
    if (targetRole === 'store_owner') {
      throw new ForbiddenException('Store owner membership cannot be changed here');
    }

    if (actorRole === 'store_manager') {
      if (targetRole !== 'store_salesman') {
        throw new ForbiddenException('Managers can only manage salesmen');
      }

      if (payload.roleCode && payload.roleCode !== 'store_salesman') {
        throw new ForbiddenException('Managers can only keep salesmen as salesmen');
      }

    }
  }

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }

    return session.user.id;
  }

  private normalizeStoreCodeFragment(input: string) {
    const fragment = input
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return fragment || 'STORE';
  }

  private normalizeSlugFragment(input: string) {
    const fragment = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    return fragment || 'store';
  }

  private buildStoreCode(name: string) {
    const fragment = this.normalizeStoreCodeFragment(name).slice(0, 18);
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `${fragment}-${suffix}`.slice(0, 50);
  }

  private buildStoreSlug(name: string) {
    const fragment = this.normalizeSlugFragment(name).slice(0, 180);
    const suffix = randomBytes(2).toString('hex').toLowerCase();
    return `${fragment}-${suffix}`.slice(0, 200);
  }

  private async resolveStoreCode(tenantId: string, requestedCode: string | undefined, name: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = (requestedCode?.trim() || this.buildStoreCode(name)).slice(0, 50);
      const existing = await this.pool.query<{ id: string }>(
        `
          select id
          from store.stores
          where tenant_id = $1
            and store_code = $2
          limit 1
        `,
        [tenantId, candidate],
      );

      if (!existing.rowCount) {
        return candidate;
      }
      requestedCode = undefined;
    }

    throw new Error('Unable to generate a unique store code');
  }

  private async resolveStoreSlug(requestedSlug: string | undefined, name: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = (requestedSlug?.trim() || this.buildStoreSlug(name)).slice(0, 200);
      const existing = await this.pool.query<{ id: string }>(
        `
          select id
          from store.stores
          where slug = $1
          limit 1
        `,
        [candidate],
      );

      if (!existing.rowCount) {
        return candidate;
      }
      requestedSlug = undefined;
    }

    throw new Error('Unable to generate a unique store slug');
  }
}

function upperHex(buffer: Buffer) {
  return buffer.toString('hex').toUpperCase();
}
