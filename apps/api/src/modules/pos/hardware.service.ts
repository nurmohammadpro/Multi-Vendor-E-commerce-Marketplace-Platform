import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HardwareDevice, PrintJob, PrintJobStatus } from '@mvp/types';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class HardwareService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Register a USB hardware device
   */
  async registerHardwareDevice(
    storeId: string,
    tenantId: string,
    data: {
      deviceType: string;
      vendorId: string;
      productId: string;
      deviceName: string;
      protocol: string;
      interfaceType: string;
      configurationJson: Record<string, any>;
    },
  ): Promise<HardwareDevice> {
    // Check if device already registered
    const existing = await this.pool.query(
      `
        SELECT id FROM pos.hardware_devices
        WHERE store_id = $1 AND vendor_id = $2 AND product_id = $3 AND device_type = $4
      `,
      [storeId, data.vendorId, data.productId, data.deviceType],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException(
        `Hardware device (${data.deviceType}) with vendor ID ${data.vendorId} and product ID ${data.productId} already registered`,
      );
    }

    const result = await this.pool.query(
      `
        INSERT INTO pos.hardware_devices (
          id, tenant_id, store_id, device_type, vendor_id, product_id,
          device_name, protocol, interface_type, configuration_json,
          status, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW(), NOW()
        )
        RETURNING
          id, tenant_id, store_id, device_type, vendor_id, product_id,
          device_name, protocol, interface_type, configuration_json,
          status, last_status_check, created_at, updated_at
      `,
      [
        tenantId,
        storeId,
        data.deviceType,
        data.vendorId,
        data.productId,
        data.deviceName,
        data.protocol,
        data.interfaceType,
        JSON.stringify(data.configurationJson),
      ],
    );

    return this.mapToHardwareDevice(result.rows[0]);
  }

  /**
   * List hardware devices for a store
   */
  async listHardwareDevices(storeId: string): Promise<HardwareDevice[]> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, device_type, vendor_id, product_id,
          device_name, protocol, interface_type, configuration_json,
          status, last_status_check, created_at, updated_at
        FROM pos.hardware_devices
        WHERE store_id = $1 AND status = 'active'
        ORDER BY device_type, created_at
      `,
      [storeId],
    );

    return result.rows.map(row => this.mapToHardwareDevice(row));
  }

  /**
   * Get specific hardware device
   */
  async getHardwareDevice(deviceId: string, storeId: string): Promise<HardwareDevice> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, device_type, vendor_id, product_id,
          device_name, protocol, interface_type, configuration_json,
          status, last_status_check, created_at, updated_at
        FROM pos.hardware_devices
        WHERE id = $1 AND store_id = $2
      `,
      [deviceId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Hardware device not found');
    }

    return this.mapToHardwareDevice(result.rows[0]);
  }

  /**
   * Update hardware device configuration
   */
  async updateHardwareDevice(
    deviceId: string,
    storeId: string,
    data: {
      deviceName?: string;
      configurationJson?: Record<string, any>;
      status?: string;
    },
  ): Promise<HardwareDevice> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.deviceName !== undefined) {
      updates.push(`device_name = $${paramIndex}`);
      params.push(data.deviceName);
      paramIndex++;
    }

    if (data.configurationJson !== undefined) {
      updates.push(`configuration_json = $${paramIndex}`);
      params.push(JSON.stringify(data.configurationJson));
      paramIndex++;
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(data.status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getHardwareDevice(deviceId, storeId);
    }

    updates.push(`updated_at = NOW()`);

    const result = await this.pool.query(
      `
        UPDATE pos.hardware_devices
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND store_id = $${paramIndex + 1}
        RETURNING
          id, tenant_id, store_id, device_type, vendor_id, product_id,
          device_name, protocol, interface_type, configuration_json,
          status, last_status_check, created_at, updated_at
      `,
      [...params, deviceId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Hardware device not found');
    }

    return this.mapToHardwareDevice(result.rows[0]);
  }

  /**
   * Deregister hardware device
   */
  async deregisterHardwareDevice(deviceId: string, storeId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE pos.hardware_devices
        SET status = 'inactive', updated_at = NOW()
        WHERE id = $1 AND store_id = $2
      `,
      [deviceId, storeId],
    );
  }

  /**
   * Queue a print job
   */
  async queuePrintJob(
    storeId: string,
    tenantId: string,
    data: {
      hardwareDeviceId: string;
      jobType: string;
      referenceId: string;
      contentJson: Record<string, any>;
      tsplCommand?: string;
    },
  ): Promise<PrintJob> {
    const result = await this.pool.query(
      `
        INSERT INTO pos.print_jobs (
          id, tenant_id, store_id, hardware_device_id, job_type,
          reference_id, content_json, tspl_command, status, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'queued', NOW()
        )
        RETURNING
          id, tenant_id, store_id, hardware_device_id, job_type,
          reference_id, content_json, tspl_command, status,
          error_message, created_at, completed_at
      `,
      [
        tenantId,
        storeId,
        data.hardwareDeviceId,
        data.jobType,
        data.referenceId,
        JSON.stringify(data.contentJson),
        data.tsplCommand || null,
      ],
    );

    return this.mapToPrintJob(result.rows[0]);
  }

  /**
   * Get print queue
   */
  async getPrintQueue(storeId: string, limit: number = 50): Promise<PrintJob[]> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, hardware_device_id, job_type,
          reference_id, content_json, tspl_command, status,
          error_message, created_at, completed_at
        FROM pos.print_jobs
        WHERE store_id = $1 AND status = 'queued'
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [storeId, limit],
    );

    return result.rows.map(row => this.mapToPrintJob(row));
  }

  /**
   * Update print job status
   */
  async updatePrintJobStatus(
    jobId: string,
    storeId: string,
    status: PrintJobStatus,
    errorMessage?: string,
  ): Promise<PrintJob> {
    const completedAt = status === 'completed' ? 'NOW()' : 'null';

    const result = await this.pool.query(
      `
        UPDATE pos.print_jobs
        SET
          status = $1,
          error_message = $2,
          completed_at = ${completedAt}
        WHERE id = $3 AND store_id = $4
        RETURNING
          id, tenant_id, store_id, hardware_device_id, job_type,
          reference_id, content_json, tspl_command, status,
          error_message, created_at, completed_at
      `,
      [status, errorMessage || null, jobId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Print job not found');
    }

    return this.mapToPrintJob(result.rows[0]);
  }

  /**
   * Update hardware device status check timestamp
   */
  async updateDeviceStatusCheck(deviceId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE pos.hardware_devices
        SET last_status_check = NOW()
        WHERE id = $1
      `,
      [deviceId],
    );
  }

  private mapToHardwareDevice(row: any): HardwareDevice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      deviceType: row.device_type,
      vendorId: row.vendor_id,
      productId: row.product_id,
      deviceName: row.device_name,
      protocol: row.protocol,
      interfaceType: row.interface_type,
      configurationJson: row.configuration_json,
      status: row.status,
      lastStatusCheck: row.last_status_check,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToPrintJob(row: any): PrintJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      hardwareDeviceId: row.hardware_device_id,
      jobType: row.job_type,
      referenceId: row.reference_id,
      contentJson: row.content_json,
      tsplCommand: row.tspl_command,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
