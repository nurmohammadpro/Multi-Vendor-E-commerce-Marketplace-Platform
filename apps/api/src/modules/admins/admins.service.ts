import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';

import { hashPassword } from '@mvp/auth';

import { DATABASE_POOL } from '../database/database.constants.js';

type AdminRow = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  base_role_code: string;
  bundle_role_codes: string[] | null;
  created_at: string;
};

type CreateAdminPayload = {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
};

@Injectable()
export class AdminsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listAdmins(tenantId: string) {
    const result = await this.pool.query<AdminRow>(
      `
        select
          am.id as membership_id,
          u.id as user_id,
          p.full_name,
          u.email,
          u.phone,
          am.status,
          base_role.code as base_role_code,
          array_remove(array_agg(distinct bundle_role.code), null) as bundle_role_codes,
          am.created_at
        from access.admin_memberships am
        join identity.users u on u.id = am.user_id
        left join identity.user_profiles p on p.user_id = u.id
        join access.roles base_role on base_role.id = am.base_role_id
        left join access.admin_bundle_assignments aba on aba.admin_membership_id = am.id
        left join access.roles bundle_role on bundle_role.id = aba.role_id
        where am.tenant_id = $1
        group by am.id, u.id, p.full_name, u.email, u.phone, am.status, base_role.code, am.created_at
        order by am.created_at desc
      `,
      [tenantId],
    );

    return {
      admins: result.rows.map((row) => ({
        membershipId: row.membership_id,
        userId: row.user_id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        baseRoleCode: row.base_role_code,
        bundleRoleCodes: row.bundle_role_codes ?? [],
        createdAt: row.created_at,
      })),
    };
  }

  async createAdmin(tenantId: string, payload: CreateAdminPayload) {
    const fullName = payload.fullName.trim();
    const email = payload.email.trim().toLowerCase();
    const phone = payload.phone?.trim() || '';
    const password = payload.password;

    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    if (password.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    const passwordHash = await hashPassword(password);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const userResult = await client.query<{
        id: string;
        tenant_id: string;
      }>(
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
          on conflict (email)
          do update set
            phone = excluded.phone,
            password_hash = excluded.password_hash,
            status = 'active',
            updated_at = now()
          returning id, tenant_id
        `,
        [tenantId, email, phone || null, passwordHash],
      );

      const user = userResult.rows[0];
      if (!user) {
        throw new BadRequestException('Unable to create admin user');
      }

      await client.query(
        `
          insert into identity.user_profiles (
            user_id,
            full_name,
            created_at,
            updated_at
          )
          values (
            $1,
            $2,
            now(),
            now()
          )
          on conflict (user_id)
          do update set
            full_name = excluded.full_name,
            updated_at = now()
        `,
        [user.id, fullName],
      );

      const roleResult = await client.query<{ id: string }>(
        `
          select id
          from access.roles
          where code = 'regular_admin'
          limit 1
        `,
      );

      const baseRoleId = roleResult.rows[0]?.id;
      if (!baseRoleId) {
        throw new BadRequestException('Regular admin role is missing');
      }

      const membershipResult = await client.query<{
        id: string;
      }>(
        `
          insert into access.admin_memberships (
            id,
            tenant_id,
            user_id,
            base_role_id,
            status,
            created_at,
            updated_at
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            'active',
            now(),
            now()
          )
          on conflict (tenant_id, user_id)
          do update set
            base_role_id = excluded.base_role_id,
            status = 'active',
            updated_at = now()
          returning id
        `,
        [tenantId, user.id, baseRoleId],
      );

      await client.query('commit');

      return {
        admin: {
          membershipId: membershipResult.rows[0]?.id ?? null,
          userId: user.id,
          fullName,
          email,
          phone: phone || null,
          baseRoleCode: 'regular_admin',
          status: 'active',
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
