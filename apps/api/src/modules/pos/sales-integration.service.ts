import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.constants.js';
import { DeviceSerialsService } from '../inventory/device-serials.service.js';
import { WarrantyService } from '../catalog/warranty.service.js';

@Injectable()
export class SalesIntegrationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly deviceSerialsService: DeviceSerialsService,
    private readonly warrantyService: WarrantyService,
  ) {}

  /**
   * Create sale with device serial linking and warranty auto-creation
   * This is called from POS when completing a sale
   */
  async createTechProductSale(
    storeId: string,
    tenantId: string,
    data: {
      items: Array<{
        skuId: string;
        quantity: number;
        unitPrice: number;
        deviceSerial?: string;
        deviceImei?: string;
        warrantyPolicyId?: string;
      }>;
      customerId?: string;
      paymentMethod: string;
      subtotal: number;
      tax: number;
      total: number;
    },
  ): Promise<any> {
    // Start transaction
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create sale
      const saleResult = await client.query(
        `
          INSERT INTO sales.sales (
            id, tenant_id, store_id, customer_id, payment_method,
            subtotal, tax, total, status, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW()
          )
          RETURNING id, tenant_id, store_id, customer_id, payment_method, subtotal, tax, total, status, created_at
        `,
        [
          tenantId,
          storeId,
          data.customerId || null,
          data.paymentMethod,
          data.subtotal,
          data.tax,
          data.total,
        ],
      );

      const sale = saleResult.rows[0];

      // Process each item
      const saleItems = [];
      for (const item of data.items) {
        for (let i = 0; i < item.quantity; i++) {
          // Create sale item
          const saleItemResult = await client.query(
            `
              INSERT INTO sales.sale_items (
                id, tenant_id, store_id, sale_id, sku_id, quantity,
                unit_price, total_price, device_serial_id, status, created_at
              )
              VALUES (
                gen_random_uuid(), $1, $2, $3, $4, 1, $5, $6, $7, 'completed', NOW()
              )
              RETURNING id, sku_id, quantity, unit_price, total_price, device_serial_id
            `,
            [
              tenantId,
              storeId,
              sale.id,
              item.skuId,
              item.unitPrice,
              item.unitPrice, // total_price for quantity 1
              item.deviceSerial ? await this.getSerialId(item.deviceSerial, storeId) : null,
            ],
          );

          const saleItem = saleItemResult.rows[0];
          saleItems.push(saleItem);

          // Update device serial status if provided
          if (item.deviceSerial) {
            const serialId = await this.getSerialId(item.deviceSerial, storeId);

            if (serialId) {
              await client.query(
                `
                  UPDATE inventory.device_serials
                  SET status = 'sold', assigned_to_sale_id = $1, updated_at = NOW()
                  WHERE id = $2 AND store_id = $3
                `,
                [sale.id, serialId, storeId],
              );

              // Auto-create warranty if category requires it
              const categoryResult = await client.query(
                `
                  SELECT pc.requires_warranty, pc.id as category_id
                  FROM catalog.products p
                  JOIN catalog.product_categories pc ON p.product_category_id = pc.id
                  JOIN catalog.skus s ON p.id = s.product_id
                  WHERE s.id = $1
                `,
                [item.skuId],
              );

              if (categoryResult.rows.length > 0 && categoryResult.rows[0].requires_warranty) {
                const category = categoryResult.rows[0];

                // Get default warranty policy for this category
                const policyResult = await client.query(
                  `
                    SELECT id FROM catalog.warranty_policies
                    WHERE store_id = $1 AND $2::uuid[] @> applies_to_category_ids
                    AND is_default_policy = true AND status = 'active'
                    LIMIT 1
                  `,
                  [storeId, [category.category_id]],
                );

                if (policyResult.rows.length > 0) {
                  const warrantyPolicyId = policyResult.rows[0].id;

                  // Create warranty
                  const warrantyResult = await client.query(
                    `
                      INSERT INTO sales.sale_warranties (
                        id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
                        warranty_policy_id, warranty_reference_number, warranty_start_date,
                        warranty_end_date, status, created_at, updated_at
                      )
                      SELECT
                        gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                        'WAR-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' ||
                        substring(md5(random()::text), 1, 8),
                        NOW(),
                        NOW() + (wp.duration_months || ' months')::interval,
                        'active', NOW(), NOW()
                      FROM catalog.warranty_policies wp
                      WHERE wp.id = $6
                      RETURNING id, warranty_reference_number, warranty_start_date, warranty_end_date
                    `,
                    [
                      tenantId,
                      storeId,
                      sale.id,
                      saleItem.id,
                      serialId,
                      warrantyPolicyId,
                    ],
                  );

                  if (warrantyResult.rows.length > 0) {
                    // Mark serial as warranty linked
                    await client.query(
                      `
                        UPDATE inventory.device_serials
                        SET warranty_linked = true, updated_at = NOW()
                        WHERE id = $1
                      `,
                      [serialId],
                    );
                  }
                }
              }
            }
          }
        }
      }

      await client.query('COMMIT');

      return {
        saleId: sale.id,
        items: saleItems,
        subtotal: sale.subtotal,
        tax: sale.tax,
        total: sale.total,
        createdAt: sale.created_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get serial ID by serial number
   */
  private async getSerialId(serialNumber: string, storeId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT id FROM inventory.device_serials WHERE serial_number = $1 AND store_id = $2`,
      [serialNumber, storeId],
    );

    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  /**
   * Get sale details with serial and warranty info
   */
  async getSaleWithDetails(saleId: string, storeId: string): Promise<any> {
    const saleResult = await this.pool.query(
      `
        SELECT
          s.id, s.customer_id, s.payment_method, s.subtotal, s.tax, s.total,
          s.status, s.created_at, s.updated_at
        FROM sales.sales s
        WHERE s.id = $1 AND s.store_id = $2
      `,
      [saleId, storeId],
    );

    if (saleResult.rows.length === 0) {
      throw new Error('Sale not found');
    }

    const sale = saleResult.rows[0];

    // Get sale items with serial and warranty info
    const itemsResult = await this.pool.query(
      `
        SELECT
          si.id, si.sku_id, si.quantity, si.unit_price, si.total_price,
          ds.serial_number, ds.imei_number, ds.device_model,
          sw.warranty_reference_number, sw.warranty_start_date, sw.warranty_end_date,
          wp.warranty_type, wp.coverage_scope
        FROM sales.sale_items si
        LEFT JOIN inventory.device_serials ds ON si.device_serial_id = ds.id
        LEFT JOIN sales.sale_warranties sw ON si.id = sw.sale_item_id
        LEFT JOIN catalog.warranty_policies wp ON sw.warranty_policy_id = wp.id
        WHERE si.sale_id = $1 AND si.store_id = $2
      `,
      [saleId, storeId],
    );

    return {
      ...sale,
      items: itemsResult.rows,
    };
  }

  /**
   * Print receipt data - prepare data for receipt printer
   */
  async getReceiptData(saleId: string, storeId: string): Promise<any> {
    const saleDetails = await this.getSaleWithDetails(saleId, storeId);

    return {
      title: 'Sale Receipt',
      orderNumber: saleId,
      date: new Date(saleDetails.created_at),
      items: saleDetails.items.map((item: any) => ({
        description: item.device_model || 'Product',
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total_price,
      })),
      subtotal: saleDetails.subtotal,
      tax: saleDetails.tax,
      total: saleDetails.total,
      paymentMethod: saleDetails.payment_method,
      deviceSerial: saleDetails.items[0]?.serial_number,
      deviceImei: saleDetails.items[0]?.imei_number,
      warrantyInfo: saleDetails.items[0]?.warranty_reference_number
        ? {
            warrantyNumber: saleDetails.items[0].warranty_reference_number,
            expiryDate: new Date(saleDetails.items[0].warranty_end_date),
            coverage: saleDetails.items[0].coverage_scope,
          }
        : undefined,
    };
  }
}
