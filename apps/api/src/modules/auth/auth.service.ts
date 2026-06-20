import { createHash } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createSessionToken, normalizeLoginIdentifier, verifyPassword } from '@mvp/auth';
import type { Pool } from 'pg';

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

type DbUserRow = {
  id: string;
  tenant_id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  status: string;
  preferred_locale: string;
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

  private async findUserByIdentifier(email?: string, phone?: string) {
    const result = await this.pool.query<DbUserRow>(
      `
        select
          id,
          tenant_id,
          email,
          phone,
          password_hash,
          status,
          preferred_locale
        from identity.users
        where
          ($1::citext is not null and email = $1::citext)
          or ($2::varchar is not null and phone = $2::varchar)
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
          id,
          tenant_id,
          email,
          phone,
          password_hash,
          status,
          preferred_locale
        from identity.users
        where id = $1
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

  private async getActiveSession(sessionToken: string) {
    const sessionTokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const result = await this.pool.query<{
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        select user_id, expires_at, revoked_at
        from identity.user_sessions
        where refresh_token_hash = $1
        limit 1
      `,
      [sessionTokenHash],
    );

    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    return {
      userId: session.user_id,
      expiresAt: session.expires_at,
    };
  }
}
