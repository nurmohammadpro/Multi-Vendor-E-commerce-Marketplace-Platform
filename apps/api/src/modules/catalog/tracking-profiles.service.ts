import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TrackingProfile, TrackingField } from '@mvp/types';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class TrackingProfilesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Resolve tenantId from storeId
   */
  async resolveTenantId(storeId: string | undefined): Promise<string | undefined> {
    if (!storeId) return undefined;
    const result = await this.pool.query<{ tenant_id: string }>(
      'select tenant_id from store.stores where id = $1 limit 1',
      [storeId],
    );
    return result.rows[0]?.tenant_id;
  }

  /**
   * List all tracking profiles for a tenant
   */
  async listProfiles(tenantId: string | undefined): Promise<TrackingProfile[]> {
    if (!tenantId) return [];
    const result = await this.pool.query(
      `
        SELECT tp.*,
          json_agg(
            json_build_object(
              'id', tf.id,
              'profileId', tf.profile_id,
              'fieldKey', tf.field_key,
              'fieldLabel', tf.field_label,
              'fieldType', tf.field_type,
              'isRequired', tf.is_required,
              'isUnique', tf.is_unique,
              'validationRules', tf.validation_rules,
              'sortOrder', tf.sort_order,
              'createdAt', tf.created_at
            ) ORDER BY tf.sort_order
          ) FILTER (WHERE tf.id IS NOT NULL) as fields
        FROM catalog.tracking_profiles tp
        LEFT JOIN catalog.tracking_fields tf ON tf.profile_id = tp.id
        WHERE tp.tenant_id = $1
        GROUP BY tp.id
        ORDER BY tp.name
      `,
      [tenantId],
    );

    return result.rows.map(this.mapProfile);
  }

  /**
   * Get tracking profile for a specific category (falls back to global profile)
   */
  async getProfileByCategoryId(tenantId: string | undefined, categoryId: string): Promise<TrackingProfile | null> {
    if (!tenantId) return null;
    // First try category-specific profile
    const categoryResult = await this.pool.query(
      `
        SELECT tp.*,
          json_agg(
            json_build_object(
              'id', tf.id,
              'profileId', tf.profile_id,
              'fieldKey', tf.field_key,
              'fieldLabel', tf.field_label,
              'fieldType', tf.field_type,
              'isRequired', tf.is_required,
              'isUnique', tf.is_unique,
              'validationRules', tf.validation_rules,
              'sortOrder', tf.sort_order,
              'createdAt', tf.created_at
            ) ORDER BY tf.sort_order
          ) FILTER (WHERE tf.id IS NOT NULL) as fields
        FROM catalog.tracking_profiles tp
        LEFT JOIN catalog.tracking_fields tf ON tf.profile_id = tp.id
        WHERE tp.tenant_id = $1 AND tp.category_id = $2 AND tp.status = 'active'
        GROUP BY tp.id
        LIMIT 1
      `,
      [tenantId, categoryId],
    );

    if (categoryResult.rows.length > 0) {
      return this.mapProfile(categoryResult.rows[0]);
    }

    // Fallback to global profile
    const globalResult = await this.pool.query(
      `
        SELECT tp.*,
          json_agg(
            json_build_object(
              'id', tf.id,
              'profileId', tf.profile_id,
              'fieldKey', tf.field_key,
              'fieldLabel', tf.field_label,
              'fieldType', tf.field_type,
              'isRequired', tf.is_required,
              'isUnique', tf.is_unique,
              'validationRules', tf.validation_rules,
              'sortOrder', tf.sort_order,
              'createdAt', tf.created_at
            ) ORDER BY tf.sort_order
          ) FILTER (WHERE tf.id IS NOT NULL) as fields
        FROM catalog.tracking_profiles tp
        LEFT JOIN catalog.tracking_fields tf ON tf.profile_id = tp.id
        WHERE tp.tenant_id = $1 AND tp.is_global = true AND tp.status = 'active'
        GROUP BY tp.id
        LIMIT 1
      `,
      [tenantId],
    );

    if (globalResult.rows.length > 0) {
      return this.mapProfile(globalResult.rows[0]);
    }

    return null;
  }

  /**
   * Get a single tracking profile by ID
   */
  async getProfile(tenantId: string | undefined, profileId: string): Promise<TrackingProfile> {
    if (!tenantId) throw new NotFoundException('Tracking profile not found');
    const result = await this.pool.query(
      `
        SELECT tp.*,
          json_agg(
            json_build_object(
              'id', tf.id,
              'profileId', tf.profile_id,
              'fieldKey', tf.field_key,
              'fieldLabel', tf.field_label,
              'fieldType', tf.field_type,
              'isRequired', tf.is_required,
              'isUnique', tf.is_unique,
              'validationRules', tf.validation_rules,
              'sortOrder', tf.sort_order,
              'createdAt', tf.created_at
            ) ORDER BY tf.sort_order
          ) FILTER (WHERE tf.id IS NOT NULL) as fields
        FROM catalog.tracking_profiles tp
        LEFT JOIN catalog.tracking_fields tf ON tf.profile_id = tp.id
        WHERE tp.tenant_id = $1 AND tp.id = $2
        GROUP BY tp.id
      `,
      [tenantId, profileId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Tracking profile ${profileId} not found`);
    }

    return this.mapProfile(result.rows[0]);
  }

  /**
   * Create a new tracking profile with optional fields
   */
  async createProfile(
    tenantId: string | undefined,
    data: {
      name: string;
      categoryId?: string;
      isGlobal?: boolean;
      fields?: {
        fieldKey: string;
        fieldLabel: string;
        fieldType: string;
        isRequired?: boolean;
        isUnique?: boolean;
        validationRules?: Record<string, any>;
        sortOrder?: number;
      }[];
    },
  ): Promise<TrackingProfile> {
    if (!tenantId) throw new Error('Tenant ID is required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const profileResult = await client.query<{ id: string }>(
        `
          INSERT INTO catalog.tracking_profiles (tenant_id, name, category_id, is_global)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [tenantId, data.name, data.categoryId || null, data.isGlobal || false],
      );

      const profile = profileResult.rows[0];

      // Insert fields if provided
      if (data.fields && data.fields.length > 0) {
        for (const field of data.fields) {
          await client.query(
            `
              INSERT INTO catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, validation_rules, sort_order)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              profile.id,
              field.fieldKey,
              field.fieldLabel,
              field.fieldType,
              field.isRequired ?? false,
              field.isUnique ?? true,
              JSON.stringify(field.validationRules || {}),
              field.sortOrder ?? 0,
            ],
          );
        }
      }

      await client.query('COMMIT');

      return this.getProfile(tenantId, profile.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a tracking profile
   */
  async updateProfile(
    tenantId: string | undefined,
    profileId: string,
    data: {
      name?: string;
      categoryId?: string | null;
      isGlobal?: boolean;
      status?: string;
    },
  ): Promise<TrackingProfile> {
    const existing = await this.getProfile(tenantId, profileId);

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${paramIndex++}`);
      values.push(data.categoryId);
    }
    if (data.isGlobal !== undefined) {
      fields.push(`is_global = $${paramIndex++}`);
      values.push(data.isGlobal);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = now()`);
    values.push(tenantId, profileId);

    await this.pool.query(
      `UPDATE catalog.tracking_profiles SET ${fields.join(', ')} WHERE tenant_id = $${paramIndex++} AND id = $${paramIndex}`,
      values,
    );

    return this.getProfile(tenantId, profileId);
  }

  /**
   * Delete a tracking profile (soft delete by setting status to inactive)
   */
  async deleteProfile(tenantId: string | undefined, profileId: string): Promise<void> {
    if (!tenantId) throw new Error('Tenant ID is required');
    await this.getProfile(tenantId, profileId);

    await this.pool.query(
      `UPDATE catalog.tracking_profiles SET status = 'inactive', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, profileId],
    );
  }

  /**
   * Add a tracking field to a profile
   */
  async addField(
    tenantId: string | undefined,
    profileId: string,
    data: {
      fieldKey: string;
      fieldLabel: string;
      fieldType: string;
      isRequired?: boolean;
      isUnique?: boolean;
      validationRules?: Record<string, any>;
      sortOrder?: number;
    },
  ): Promise<TrackingField> {
    await this.getProfile(tenantId, profileId);

    const result = await this.pool.query(
      `
        INSERT INTO catalog.tracking_fields (profile_id, field_key, field_label, field_type, is_required, is_unique, validation_rules, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        profileId,
        data.fieldKey,
        data.fieldLabel,
        data.fieldType,
        data.isRequired ?? false,
        data.isUnique ?? true,
        JSON.stringify(data.validationRules || {}),
        data.sortOrder ?? 0,
      ],
    );

    return this.mapField(result.rows[0]);
  }

  /**
   * Update a tracking field
   */
  async updateField(
    tenantId: string | undefined,
    fieldId: string,
    data: {
      fieldLabel?: string;
      fieldType?: string;
      isRequired?: boolean;
      isUnique?: boolean;
      validationRules?: Record<string, any>;
      sortOrder?: number;
    },
  ): Promise<TrackingField> {
    // Verify the field exists and belongs to the tenant
    const existing = await this.pool.query(
      `
        SELECT tf.* FROM catalog.tracking_fields tf
        JOIN catalog.tracking_profiles tp ON tp.id = tf.profile_id
        WHERE tp.tenant_id = $1 AND tf.id = $2
      `,
      [tenantId, fieldId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException(`Tracking field ${fieldId} not found`);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.fieldLabel !== undefined) {
      fields.push(`field_label = $${paramIndex++}`);
      values.push(data.fieldLabel);
    }
    if (data.fieldType !== undefined) {
      fields.push(`field_type = $${paramIndex++}`);
      values.push(data.fieldType);
    }
    if (data.isRequired !== undefined) {
      fields.push(`is_required = $${paramIndex++}`);
      values.push(data.isRequired);
    }
    if (data.isUnique !== undefined) {
      fields.push(`is_unique = $${paramIndex++}`);
      values.push(data.isUnique);
    }
    if (data.validationRules !== undefined) {
      fields.push(`validation_rules = $${paramIndex++}`);
      values.push(JSON.stringify(data.validationRules));
    }
    if (data.sortOrder !== undefined) {
      fields.push(`sort_order = $${paramIndex++}`);
      values.push(data.sortOrder);
    }

    if (fields.length === 0) {
      return this.mapField(existing.rows[0]);
    }

    values.push(fieldId);

    const result = await this.pool.query(
      `UPDATE catalog.tracking_fields SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return this.mapField(result.rows[0]);
  }

  /**
   * Delete a tracking field
   */
  async deleteField(tenantId: string | undefined, fieldId: string): Promise<void> {
    if (!tenantId) throw new Error('Tenant ID is required');
    const existing = await this.pool.query(
      `
        SELECT tf.* FROM catalog.tracking_fields tf
        JOIN catalog.tracking_profiles tp ON tp.id = tf.profile_id
        WHERE tp.tenant_id = $1 AND tf.id = $2
      `,
      [tenantId, fieldId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException(`Tracking field ${fieldId} not found`);
    }

    await this.pool.query(
      `DELETE FROM catalog.tracking_fields WHERE id = $1`,
      [fieldId],
    );
  }

  private mapProfile(row: any): TrackingProfile {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      categoryId: row.category_id,
      isGlobal: row.is_global,
      status: row.status,
      fields: row.fields || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapField(row: any): TrackingField {
    return {
      id: row.id,
      profileId: row.profile_id,
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      fieldType: row.field_type,
      isRequired: row.is_required,
      isUnique: row.is_unique,
      validationRules: row.validation_rules || {},
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    };
  }
}
