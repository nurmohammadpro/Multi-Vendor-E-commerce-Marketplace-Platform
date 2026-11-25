import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createSessionToken, hashPassword, normalizeLoginIdentifier, verifyPassword } from '@mvp/auth';
import type { Pool, PoolClient } from 'pg';

import { DATABASE_POOL } from '../database/database.constants.js';
import { RbacService } from '../rbac/rbac.service.js';
import { SessionContextService } from './session-context.service.js';
import type { AuthSession } from './auth.types.js';

type LoginPayload = {
  email?: string;
  phone?: string;
  password: string;
};

type SelectContextPayload = {
  type: 'admin' | 'store' | 'customer';
  storeId?: string;
};

type ForgotPasswordPayload = {
  email?: string;
  phone?: string;
};

type ResetPasswordPayload = {
  token: string;
  password: string;
};

type VerifyMfaPayload = {
  email?: string;
  phone?: string;
  methodType: 'totp' | 'sms' | 'email';
  code: string;
};

type DbUserRow = {
  id: string;
  tenant_id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  status: string;
  preferred_locale: string;
  full_name: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly rbacService: RbacService,
    private readonly sessionContextService: SessionContextService,
  ) {}

  async login(payload: LoginPayload) {
    const identifier = normalizeLoginIdentifier(payload);
    const user = await this.findUserByIdentifier(identifier.email, identifier.phone);

    if (!user || !user.password_hash || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await verifyPassword(payload.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionToken = createSessionToken();
    const sessionTokenHash = createHash('sha256').update(sessionToken).digest('hex');

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

    await this.pool.query(
      `
        insert into identity.user_sessions (
          id,
          user_id,
          refresh_token_hash,
          device_label,
          expires_at,
          created_at
        ) values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now()
        )
      `,
      [user.id, sessionTokenHash, 'primary-session', expiresAt.toISOString()],
    );

    await this.pool.query(
      `
        update identity.users
        set last_login_at = now()
        where id = $1
      `,
      [user.id],
    );

    const contexts = await this.sessionContextService.getContextsForUser(user.id);

    return {
      tokenType: 'Bearer',
      accessToken: sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        phone: user.phone,
        fullName: user.full_name,
        preferredLocale: user.preferred_locale,
      },
      contexts,
    };
  }

  async getContextsBySessionToken(sessionToken: string) {
    const session = await this.getActiveSession(sessionToken);
    const contexts = await this.sessionContextService.getContextsForUser(session.userId);
    return { contexts };
  }

  async getSessionProfile(sessionToken: string): Promise<AuthSession> {
    const session = await this.getActiveSession(sessionToken);
    const user = await this.findUserById(session.userId);
    const contexts = await this.sessionContextService.getContextsForUser(session.userId);
    const permissions = this.rbacService.expandPermissionsFromRoles(
      contexts.flatMap((context) => context.roles),
    );

    return {
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        phone: user.phone,
        fullName: user.full_name,
        preferredLocale: user.preferred_locale,
        status: user.status,
      },
      contexts,
      permissions,
      session: {
        expiresAt: session.expiresAt,
      },
    };
  }

  async selectContext(sessionToken: string, payload: SelectContextPayload) {
    const session = await this.getActiveSession(sessionToken);
    const contexts = await this.sessionContextService.getContextsForUser(session.userId);
    const matchedContext = contexts.find((context) => {
      if (context.type !== payload.type) return false;
      if (payload.type === 'store') {
        return context.type === 'store' && context.storeId === payload.storeId;
      }
      return true;
    });

    if (!matchedContext) {
      throw new UnauthorizedException('Requested context is not available for this user');
    }

    return {
      activeContext: matchedContext,
    };
  }

  async logout(sessionToken: string) {
    const sessionTokenHash = createHash('sha256').update(sessionToken).digest('hex');

    await this.pool.query(
      `
        update identity.user_sessions
        set revoked_at = now()
        where refresh_token_hash = $1
          and revoked_at is null
      `,
      [sessionTokenHash],
    );

    return { success: true };
  }

  async refresh(sessionToken: string) {
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentSession = await this.getActiveSession(sessionToken, client, true);
      const nextToken = createSessionToken();
      const nextTokenHash = createHash('sha256').update(nextToken).digest('hex');
      const nextExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

      await client.query(
        `
          update identity.user_sessions
          set refresh_token_hash = $2,
              expires_at = $3
          where id = $1
        `,
        [currentSession.id, nextTokenHash, nextExpiresAt],
      );

      await client.query('commit');

      const profile = await this.getSessionProfile(nextToken);
      return {
        tokenType: 'Bearer',
        accessToken: nextToken,
        expiresAt: nextExpiresAt,
        user: profile.user,
        contexts: profile.contexts,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async forgotPassword(payload: ForgotPasswordPayload) {
    const identifier = normalizeLoginIdentifier(payload);
    const user = await this.findUserByIdentifier(identifier.email, identifier.phone);

    if (!user) {
      return {
        success: true,
        resetToken: null,
      };
    }

    const resetToken = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    const deliveryChannel = identifier.email ? 'email' : 'sms';
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    await this.pool.query(
      `
        insert into identity.password_reset_tokens (
          id,
          user_id,
          token_hash,
          delivery_channel,
          expires_at,
          created_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now()
        )
      `,
      [user.id, tokenHash, deliveryChannel, expiresAt],
    );

    return {
      success: true,
      deliveryChannel,
      expiresAt,
      resetToken,
    };
  }

  async resetPassword(payload: ResetPasswordPayload) {
    const tokenHash = createHash('sha256').update(payload.token).digest('hex');
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const tokenResult = await client.query<{
        id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>(
        `
          select id, user_id, expires_at, used_at
          from identity.password_reset_tokens
          where token_hash = $1
          limit 1
          for update
        `,
        [tokenHash],
      );

      const tokenRow = tokenResult.rows[0];
      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedException('Reset token expired or invalid');
      }

      const passwordHash = await hashPassword(payload.password);

      await client.query(
        `
          update identity.users
          set password_hash = $2,
              updated_at = now()
          where id = $1
        `,
        [tokenRow.user_id, passwordHash],
      );

      await client.query(
        `
          update identity.password_reset_tokens
          set used_at = now()
          where id = $1
        `,
        [tokenRow.id],
      );

      await client.query(
        `
          update identity.user_sessions
          set revoked_at = now()
          where user_id = $1
            and revoked_at is null
        `,
        [tokenRow.user_id],
      );

      await client.query('commit');
      return { success: true };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyMfa(payload: VerifyMfaPayload) {
    const identifier = normalizeLoginIdentifier(payload);
    const user = await this.findUserByIdentifier(identifier.email, identifier.phone);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const codeHash = createHash('sha256').update(payload.code).digest('hex');
    const result = await this.pool.query<{
      id: string;
      expires_at: string;
      verified_at: string | null;
    }>(
      `
        select id, expires_at, verified_at
        from identity.auth_mfa_challenges
        where user_id = $1
          and method_type = $2
          and code_hash = $3
        order by created_at desc
        limit 1
      `,
      [user.id, payload.methodType, codeHash],
    );

    const challenge = result.rows[0];
    if (!challenge || challenge.verified_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('MFA code expired or invalid');
    }

    await this.pool.query(
      `
        update identity.auth_mfa_challenges
        set verified_at = now()
        where id = $1
      `,
      [challenge.id],
    );

    return { success: true };
  }

  private async findUserByIdentifier(email?: string, phone?: string) {
    const result = await this.pool.query<DbUserRow>(
      `
        select
          u.id,
          u.tenant_id,
          u.email,
          u.phone,
          u.password_hash,
          u.status,
          u.preferred_locale,
          up.full_name
        from identity.users u
        left join identity.user_profiles up on up.user_id = u.id
        where
          ($1::citext is not null and u.email = $1::citext)
          or ($2::varchar is not null and u.phone = $2::varchar)
        limit 1
      `,
      [email ?? null, phone ?? null],
    );

    return result.rows[0] ?? null;
  }

  private async findUserById(userId: string) {
    const result = await this.pool.query<DbUserRow>(
      `
        select
          u.id,
          u.tenant_id,
          u.email,
          u.phone,
          u.password_hash,
          u.status,
          u.preferred_locale,
          up.full_name
        from identity.users u
        left join identity.user_profiles up on up.user_id = u.id
        where u.id = $1
        limit 1
      `,
      [userId],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async getActiveSession(sessionToken: string, executor: Pool | PoolClient = this.pool, lock = false) {
    const sessionTokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const result = await executor.query<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        select id, user_id, expires_at, revoked_at
        from identity.user_sessions
        where refresh_token_hash = $1
        limit 1
        ${lock ? 'for update' : ''}
      `,
      [sessionTokenHash],
    );

    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    return {
      id: session.id,
      userId: session.user_id,
      expiresAt: session.expires_at,
    };
  }
}
