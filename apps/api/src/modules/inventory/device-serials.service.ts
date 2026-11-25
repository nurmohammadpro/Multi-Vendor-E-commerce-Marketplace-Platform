import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { DeviceSerial } from '@mvp/types';
import { DATABASE_POOL } from '../database/database.constants.js';
import type { StoreAuthContext } from '../auth/auth.types.js';

@Injectable()
export class DeviceSerialsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Create a new device serial record
   */
  async createDeviceSerial(
    storeId: string,
    tenantId: string,
    data: {
      skuId: string;
      serialNumber: string;
      imeiNumber?: string;
      deviceModel: string;
      color?: string;
      manufactureDateDate?: Date;
      batchCode: string;
      currentLocationId?: string;
      specificationsJson?: Record<string, any>;
      trackingValues?: Record<string, string>;
      trackingProfileId?: string;
    },
  ): Promise<DeviceSerial> {
    // Validate serial uniqueness within store
    const existingSerial = await this.pool.query(
      `
        SELECT id FROM inventory.device_serials
        WHERE store_id = $1 AND serial_number = $2
      `,
      [storeId, data.serialNumber],
    );

    if (existingSerial.rows.length > 0) {
      throw new ConflictException(
        `Serial number ${data.serialNumber} already exists in this store`,
      );
    }

    // Validate global IMEI uniqueness
    if (data.imeiNumber) {
      const existingImei = await this.pool.query(
        `
          SELECT id FROM inventory.device_serials
          WHERE imei_number = $1
        `,
        [data.imeiNumber],
      );

      if (existingImei.rows.length > 0) {
        throw new ConflictException(
          `IMEI ${data.imeiNumber} already exists in the system`,
        );
      }
    }

    const trackingValues = data.trackingValues || {};

    const result = await this.pool.query(
      `
        INSERT INTO inventory.device_serials (
          id,
          tenant_id,
          store_id,
          sku_id,
          serial_number,
          imei_number,
          device_model,
          color,
          manufacture_date,
          batch_code,
          current_location_id,
          status,
          warranty_linked,
          specifications_json,
          tracking_values,
          tracking_profile_id,
          received_date,
          created_at,
          updated_at
        )
        VALUES (
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
          $10,
          'in_stock',
          false,
          $11,
          $12,
          $13,
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING
          id,
          tenant_id,
          store_id,
          sku_id,
          serial_number,
          imei_number,
          device_model,
          color,
          manufacture_date,
          batch_code,
          current_location_id,
          status,
          warranty_linked,
          specifications_json,
          tracking_values,
          tracking_profile_id,
          received_date,
          assigned_to_sale_id,
          created_at,
          updated_at
      `,
      [
        tenantId,
        storeId,
        data.skuId,
        data.serialNumber,
        data.imeiNumber || null,
        data.deviceModel,
        data.color || null,
        data.manufactureDateDate || null,
        data.batchCode,
        data.currentLocationId || null,
        data.specificationsJson ? JSON.stringify(data.specificationsJson) : null,
        JSON.stringify(trackingValues),
        data.trackingProfileId || null,
      ],
    );

    return this.mapToDeviceSerial(result.rows[0]);
  }

  /**
   * Bulk import device serials from CSV data
   */
  async bulkImportSerials(
    storeId: string,
    tenantId: string,
    serials: Array<{
      serialNumber: string;
      imeiNumber?: string;
      deviceModel: string;
      skuId: string;
      batchCode: string;
      color?: string;
      specifications?: Record<string, any>;
      trackingValues?: Record<string, string>;
      trackingProfileId?: string;
    }>,
  ): Promise<{ imported: number; failed: number; errors: Array<{ serial: string; error: string }> }> {
    const errors: Array<{ serial: string; error: string }> = [];
    let imported = 0;

    for (const serial of serials) {
      try {
        await this.createDeviceSerial(storeId, tenantId, {
          skuId: serial.skuId,
          serialNumber: serial.serialNumber,
          imeiNumber: serial.imeiNumber,
          deviceModel: serial.deviceModel,
          batchCode: serial.batchCode,
          color: serial.color,
          specificationsJson: serial.specifications,
          trackingValues: serial.trackingValues,
          trackingProfileId: serial.trackingProfileId,
        });
        imported++;
      } catch (error) {
        errors.push({
          serial: serial.serialNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { imported, failed: errors.length, errors };
  }

  /**
   * Get device serial by ID
   */
  async getDeviceSerial(
    serialId: string,
    storeId: string,
  ): Promise<DeviceSerial> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, sku_id, serial_number, imei_number,
          device_model, color, manufacture_date, batch_code, current_location_id,
          status, warranty_linked, specifications_json, tracking_values, tracking_profile_id,
          assigned_to_sale_id, received_date, created_at, updated_at
        FROM inventory.device_serials
        WHERE id = $1 AND store_id = $2
      `,
      [serialId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Device serial not found');
    }

    return this.mapToDeviceSerial(result.rows[0]);
  }

  /**
   * Search device serials by various criteria
   */
  async searchSerials(
    storeId: string,
    filters: {
      serialNumber?: string;
      imeiNumber?: string;
      batchCode?: string;
      status?: string;
      skuId?: string;
    },
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ serials: DeviceSerial[]; total: number }> {
    const conditions: string[] = ['store_id = $1'];
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (filters.serialNumber) {
      conditions.push(`serial_number ILIKE $${paramIndex}`);
      params.push(`%${filters.serialNumber}%`);
      paramIndex++;
    }

    if (filters.imeiNumber) {
      conditions.push(`imei_number = $${paramIndex}`);
      params.push(filters.imeiNumber);
      paramIndex++;
    }

    if (filters.batchCode) {
      conditions.push(`batch_code = $${paramIndex}`);
      params.push(filters.batchCode);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.skuId) {
      conditions.push(`sku_id = $${paramIndex}`);
      params.push(filters.skuId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inventory.device_serials WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, sku_id, serial_number, imei_number,
          device_model, color, manufacture_date, batch_code, current_location_id,
          status, warranty_linked, specifications_json, tracking_values, tracking_profile_id,
          assigned_to_sale_id, received_date, created_at, updated_at
        FROM inventory.device_serials
        WHERE ${whereClause}
        ORDER BY received_date ASC NULLS LAST, created_at ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      [...params, limit, offset],
    );

    return {
      serials: result.rows.map(row => this.mapToDeviceSerial(row)),
      total,
    };
  }

  /**
   * Update device serial status (e.g., mark as sold, damaged, etc.)
   */
  async updateDeviceSerialStatus(
    serialId: string,
    storeId: string,
    newStatus: string,
    assignedToSaleId?: string,
  ): Promise<DeviceSerial> {
    const result = await this.pool.query(
      `
        UPDATE inventory.device_serials
        SET
          status = $1,
          assigned_to_sale_id = $2,
          updated_at = NOW()
        WHERE id = $3 AND store_id = $4
        RETURNING
          id, tenant_id, store_id, sku_id, serial_number, imei_number,
          device_model, color, manufacture_date, batch_code, current_location_id,
          status, warranty_linked, specifications_json, tracking_values, tracking_profile_id,
          assigned_to_sale_id, received_date, created_at, updated_at
      `,
      [newStatus, assignedToSaleId || null, serialId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Device serial not found');
    }

    return this.mapToDeviceSerial(result.rows[0]);
  }

  /**
   * Mark warranty as linked
   */
  async markWarrantyLinked(serialId: string, storeId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE inventory.device_serials
        SET warranty_linked = true, updated_at = NOW()
        WHERE id = $1 AND store_id = $2
      `,
      [serialId, storeId],
    );
  }

  /**
   * Get all serials by batch code
   */
  async getSerialsByBatchCode(
    batchCode: string,
    storeId: string,
  ): Promise<DeviceSerial[]> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, sku_id, serial_number, imei_number,
          device_model, color, manufacture_date, batch_code, current_location_id,
          status, warranty_linked, specifications_json, tracking_values, tracking_profile_id,
          assigned_to_sale_id, received_date, created_at, updated_at
        FROM inventory.device_serials
        WHERE batch_code = $1 AND store_id = $2
        ORDER BY created_at ASC
      `,
      [batchCode, storeId],
    );

    return result.rows.map(row => this.mapToDeviceSerial(row));
  }

  private mapToDeviceSerial(row: any): DeviceSerial {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      skuId: row.sku_id,
      serialNumber: row.serial_number,
      imeiNumber: row.imei_number,
      deviceModel: row.device_model,
      specificationsJson: row.specifications_json,
      color: row.color,
      manufactureDateDate: row.manufacture_date,
      batchCode: row.batch_code,
      receivedDate: row.received_date,
      currentLocationId: row.current_location_id,
      status: row.status,
      assignedToSaleId: row.assigned_to_sale_id,
      warrantyLinked: row.warranty_linked,
      trackingValues: row.tracking_values || {},
      trackingProfileId: row.tracking_profile_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
