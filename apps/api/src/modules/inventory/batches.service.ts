import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { StockBatch } from '@mvp/types';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class BatchesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Create a stock batch
   */
  async createBatch(
    storeId: string,
    tenantId: string,
    data: {
      batchCode: string;
      supplierId?: string;
      productId: string;
      skuId: string;
      purchaseOrderNumber: string;
      manufactureBatchCode?: string;
      expiryDate?: Date;
      receivedQuantity: number;
      notes?: string;
    },
  ): Promise<StockBatch> {
    // Check if batch code already exists
    const existing = await this.pool.query(
      `SELECT id FROM inventory.stock_batches WHERE store_id = $1 AND batch_code = $2`,
      [storeId, data.batchCode],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException(`Batch code ${data.batchCode} already exists in this store`);
    }

    const result = await this.pool.query(
      `
        INSERT INTO inventory.stock_batches (
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          received_date, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 0, $11, 'active', NOW(), NOW(), NOW()
        )
        RETURNING
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
      `,
      [
        tenantId,
        storeId,
        data.batchCode,
        data.supplierId || null,
        data.productId,
        data.skuId,
        data.purchaseOrderNumber,
        data.manufactureBatchCode || null,
        data.expiryDate || null,
        data.receivedQuantity,
        data.notes || null,
      ],
    );

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * Get batch by ID
   */
  async getBatch(batchId: string, storeId: string): Promise<StockBatch> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
        FROM inventory.stock_batches
        WHERE id = $1 AND store_id = $2
      `,
      [batchId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Stock batch not found');
    }

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * Get batch by code
   */
  async getBatchByCode(batchCode: string, storeId: string): Promise<StockBatch> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
        FROM inventory.stock_batches
        WHERE batch_code = $1 AND store_id = $2
      `,
      [batchCode, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Stock batch not found');
    }

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * List batches with filters
   */
  async listBatches(
    storeId: string,
    filters: {
      status?: string;
      supplierId?: string;
      skuId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ batches: StockBatch[]; total: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let whereClause = 'store_id = $1';
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (filters.status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.supplierId) {
      whereClause += ` AND supplier_id = $${paramIndex}`;
      params.push(filters.supplierId);
      paramIndex++;
    }

    if (filters.skuId) {
      whereClause += ` AND sku_id = $${paramIndex}`;
      params.push(filters.skuId);
      paramIndex++;
    }

    // Get count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inventory.stock_batches WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    // Get results
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
        FROM inventory.stock_batches
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      [...params, limit, offset],
    );

    return {
      batches: result.rows.map(row => this.mapToStockBatch(row)),
      total,
    };
  }

  /**
   * Update batch quantity and serial count
   */
  async updateBatchInventory(
    batchId: string,
    storeId: string,
    quantityChange: number,
    serialCountChange: number,
  ): Promise<StockBatch> {
    const batch = await this.getBatch(batchId, storeId);

    const newQuantity = Math.max(0, batch.currentQuantity + quantityChange);
    const newSerialCount = Math.max(0, batch.serialCount + serialCountChange);

    const result = await this.pool.query(
      `
        UPDATE inventory.stock_batches
        SET
          current_quantity = $1,
          serial_count = $2,
          updated_at = NOW()
        WHERE id = $3 AND store_id = $4
        RETURNING
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
      `,
      [newQuantity, newSerialCount, batchId, storeId],
    );

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * Mark batch as quarantined
   */
  async quarantineBatch(batchId: string, storeId: string, reason: string): Promise<StockBatch> {
    const result = await this.pool.query(
      `
        UPDATE inventory.stock_batches
        SET
          status = 'quarantined',
          recall_reason = $1,
          updated_at = NOW()
        WHERE id = $2 AND store_id = $3
        RETURNING
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
      `,
      [reason, batchId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Stock batch not found');
    }

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * Recall batch
   */
  async recallBatch(batchId: string, storeId: string, reason: string): Promise<StockBatch> {
    const result = await this.pool.query(
      `
        UPDATE inventory.stock_batches
        SET
          status = 'recalled',
          recall_reason = $1,
          updated_at = NOW()
        WHERE id = $2 AND store_id = $3
        RETURNING
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
      `,
      [reason, batchId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Stock batch not found');
    }

    // TODO: Trigger notifications to customers with devices from this batch
    // TODO: Flag warranty claims for this batch

    return this.mapToStockBatch(result.rows[0]);
  }

  /**
   * Mark batch as depleted
   */
  async markBatchDepleted(batchId: string, storeId: string): Promise<StockBatch> {
    const batch = await this.getBatch(batchId, storeId);

    if (batch.currentQuantity > 0) {
      throw new BadRequestException(
        `Batch still has ${batch.currentQuantity} units. Cannot deplete non-empty batch.`,
      );
    }

    const result = await this.pool.query(
      `
        UPDATE inventory.stock_batches
        SET
          status = 'depleted',
          updated_at = NOW()
        WHERE id = $1 AND store_id = $2
        RETURNING
          id, tenant_id, store_id, batch_code, supplier_id, product_id, sku_id,
          purchase_order_number, manufacture_batch_code, expiry_date,
          received_quantity, current_quantity, serial_count, notes, status,
          recall_reason, received_date, created_at, updated_at
      `,
      [batchId, storeId],
    );

    return this.mapToStockBatch(result.rows[0]);
  }

  private mapToStockBatch(row: any): StockBatch {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      batchCode: row.batch_code,
      supplierId: row.supplier_id,
      productId: row.product_id,
      skuId: row.sku_id,
      purchaseOrderNumber: row.purchase_order_number,
      manufactureBatchCode: row.manufacture_batch_code,
      expiryDate: row.expiry_date,
      receivedDate: row.received_date,
      receivedQuantity: row.received_quantity,
      currentQuantity: row.current_quantity,
      serialCount: row.serial_count,
      notes: row.notes,
      status: row.status,
      recallReason: row.recall_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
