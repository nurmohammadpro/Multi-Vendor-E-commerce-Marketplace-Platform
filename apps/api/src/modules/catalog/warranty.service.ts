import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { WarrantyPolicy, SaleWarranty, WarrantyClaim, WarrantyClaimStatus } from '@mvp/types';
import { DATABASE_POOL } from '../database/database.constants.js';

@Injectable()
export class WarrantyService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  /**
   * List active warranty policies for a store
   */
  async getWarrantyPolicies(storeId: string): Promise<WarrantyPolicy[]> {
    const result = await this.pool.query(
      `
        SELECT id, tenant_id, store_id, code, name, warranty_type, duration_months,
          coverage_scope, applies_to_category_ids, cost_price, cost_to_store,
          is_default, terms_text, exclusions_text, claim_process_text,
          status, created_at, updated_at
        FROM catalog.warranty_policies
        WHERE store_id = $1 AND status = 'active'
        ORDER BY is_default DESC, duration_months ASC
      `,
      [storeId],
    );
    return result.rows.map((row) => this.mapToWarrantyPolicy(row));
  }

  /**
   * Search registered sale warranties by serial, IMEI, customer, phone,
   * sale number, or warranty reference.
   */
  async listSaleWarranties(
    storeId: string,
    filters: { q?: string; status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ warranties: any[]; total: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const q = filters.q?.trim() || null;

    const result = await this.pool.query(
      `
        select
          sw.id, sw.warranty_reference_number, sw.warranty_start_date,
          sw.warranty_end_date, sw.warranty_purchased_price, sw.status, sw.notes,
          sw.created_at,
          wp.name as policy_name, wp.warranty_type as policy_type,
          wp.duration_months as policy_duration_months,
          ds.id as device_serial_id, ds.serial_number, ds.imei_number,
          ds.device_model, ds.color, ds.status as serial_status,
          s.id as sale_id, s.sale_no, s.invoice_no, s.customer_name,
          s.customer_phone, s.created_at as sold_at,
          si.product_name_snapshot, si.sku_code_snapshot,
          count(*) over()::int as total_count
        from sales.sale_warranties sw
        join catalog.warranty_policies wp on wp.id = sw.warranty_policy_id
        join inventory.device_serials ds on ds.id = sw.device_serial_id
        join sales.sales s on s.id = sw.sale_id
        join sales.sale_items si on si.id = sw.sale_item_id
        where sw.store_id = $1
          and ($2::text is null or sw.status = $2::text)
          and (
            $3::text is null
            or ds.serial_number ilike '%' || $3::text || '%'
            or coalesce(ds.imei_number, '') ilike '%' || $3::text || '%'
            or coalesce(s.customer_name, '') ilike '%' || $3::text || '%'
            or coalesce(s.customer_phone, '') ilike '%' || $3::text || '%'
            or s.sale_no ilike '%' || $3::text || '%'
            or coalesce(s.invoice_no, '') ilike '%' || $3::text || '%'
            or sw.warranty_reference_number ilike '%' || $3::text || '%'
            or coalesce(si.product_name_snapshot, '') ilike '%' || $3::text || '%'
          )
        order by sw.created_at desc
        limit $4 offset $5
      `,
      [storeId, filters.status ?? null, q, limit, offset],
    );

    const total = result.rows[0]?.total_count ?? 0;
    return { warranties: result.rows, total: Number(total) };
  }

  /**
   * Search sold serials that can still be registered under a warranty,
   * by serial, IMEI, customer, phone, or sale number.
   */
  async searchWarrantyEligibleSerials(
    storeId: string,
    filters: { q?: string; limit?: number } = {},
  ): Promise<{ serials: any[] }> {
    const q = filters.q?.trim() || null;
    if (!q) return { serials: [] };
    const limit = filters.limit || 20;

    const result = await this.pool.query(
      `
        select
          ds.id as device_serial_id, ds.serial_number, ds.imei_number,
          ds.device_model, ds.color,
          s.id as sale_id, s.sale_no, s.invoice_no, s.customer_name,
          s.customer_phone, s.created_at as sold_at,
          si.id as sale_item_id, si.product_name_snapshot, si.sku_code_snapshot,
          si.unit_price
        from inventory.device_serials ds
        join inventory.device_serial_sales dss on dss.device_serial_id = ds.id
        join sales.sales s on s.id = dss.sale_id
        join sales.sale_items si on si.id = dss.sale_item_id
        where ds.store_id = $1
          and ds.status = 'sold'
          and not exists (
            select 1 from sales.sale_warranties sw
            where sw.device_serial_id = ds.id and sw.status in ('active', 'claimed')
          )
          and (
            ds.serial_number ilike '%' || $2::text || '%'
            or coalesce(ds.imei_number, '') ilike '%' || $2::text || '%'
            or coalesce(s.customer_name, '') ilike '%' || $2::text || '%'
            or coalesce(s.customer_phone, '') ilike '%' || $2::text || '%'
            or s.sale_no ilike '%' || $2::text || '%'
            or coalesce(si.product_name_snapshot, '') ilike '%' || $2::text || '%'
          )
        order by s.created_at desc
        limit $3
      `,
      [storeId, q, limit],
    );

    return { serials: result.rows };
  }

  /**
   * Create a warranty policy
   */
  async createWarrantyPolicy(
    storeId: string,
    tenantId: string,
    data: {
      code: string;
      name: string;
      warrantyType: string;
      durationMonths: number;
      coverageScope: string;
      appliesToCategoryIds: string[];
      costPrice?: number;
      costToStore?: number;
      isDefaultPolicy?: boolean;
      termsText: string;
      exclusionsText?: string;
      claimProcessText?: string;
    },
  ): Promise<WarrantyPolicy> {
    // Check if code already exists
    const existing = await this.pool.query(
      `SELECT id FROM catalog.warranty_policies WHERE store_id = $1 AND code = $2`,
      [storeId, data.code],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException(`Warranty policy with code ${data.code} already exists`);
    }

    const result = await this.pool.query(
      `
        INSERT INTO catalog.warranty_policies (
          id, tenant_id, store_id, code, name, warranty_type, duration_months,
          coverage_scope, applies_to_category_ids, cost_price, cost_to_store,
          is_default, terms_text, exclusions_text, claim_process_text,
          status, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10, $11, $12, $13, $14, 'active', NOW(), NOW()
        )
        RETURNING
          id, tenant_id, store_id, code, name, warranty_type, duration_months,
          coverage_scope, applies_to_category_ids, cost_price, cost_to_store,
          is_default, terms_text, exclusions_text, claim_process_text,
          status, created_at, updated_at
      `,
      [
        tenantId,
        storeId,
        data.code,
        data.name,
        data.warrantyType,
        data.durationMonths,
        data.coverageScope,
        data.appliesToCategoryIds ?? [],
        data.costPrice || null,
        data.costToStore || null,
        data.isDefaultPolicy || false,
        data.termsText,
        data.exclusionsText || null,
        data.claimProcessText || null,
      ],
    );

    return this.mapToWarrantyPolicy(result.rows[0]);
  }

  /**
   * Create a warranty for a sale (auto-called when product sold)
   */
  async createSaleWarranty(
    storeId: string,
    tenantId: string,
    data: {
      saleId: string;
      saleItemId: string;
      deviceSerialId: string;
      warrantyPolicyId: string;
      warrantyStartDate: Date;
      warrantyPurchasedPrice?: number;
    },
  ): Promise<SaleWarranty> {
    // Get warranty policy to calculate end date
    const policyResult = await this.pool.query<{ duration_months: number }>(
      `SELECT duration_months FROM catalog.warranty_policies WHERE id = $1`,
      [data.warrantyPolicyId],
    );

    if (policyResult.rows.length === 0) {
      throw new NotFoundException('Warranty policy not found');
    }

    const durationMonths = policyResult.rows[0].duration_months;
    const warrantyEndDate = new Date(data.warrantyStartDate);
    warrantyEndDate.setMonth(warrantyEndDate.getMonth() + durationMonths);

    // Generate warranty reference number
    const referenceNumber = `WAR-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const result = await this.pool.query(
      `
        INSERT INTO sales.sale_warranties (
          id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
          warranty_policy_id, warranty_reference_number, warranty_start_date,
          warranty_end_date, warranty_purchased_price, status, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW(), NOW()
        )
        RETURNING
          id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
          warranty_policy_id, warranty_reference_number, warranty_start_date,
          warranty_end_date, warranty_purchased_price, status, notes, created_at, updated_at
      `,
      [
        tenantId,
        storeId,
        data.saleId,
        data.saleItemId,
        data.deviceSerialId,
        data.warrantyPolicyId,
        referenceNumber,
        data.warrantyStartDate,
        warrantyEndDate,
        data.warrantyPurchasedPrice || null,
      ],
    );

    return this.mapToSaleWarranty(result.rows[0]);
  }

  /**
   * Get warranty by serial
   */
  async getWarrantyBySerial(
    deviceSerialId: string,
    storeId: string,
  ): Promise<SaleWarranty | null> {
    const result = await this.pool.query(
      `
        SELECT
          id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
          warranty_policy_id, warranty_reference_number, warranty_start_date,
          warranty_end_date, warranty_purchased_price, status, notes, created_at, updated_at
        FROM sales.sale_warranties
        WHERE device_serial_id = $1 AND store_id = $2 AND status = 'active'
      `,
      [deviceSerialId, storeId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToSaleWarranty(result.rows[0]);
  }

  /**
   * Submit a warranty claim
   */
  async submitWarrantyClaim(
    storeId: string,
    tenantId: string,
    data: {
      saleWarrantyId: string;
      deviceSerialId: string;
      claimType: string;
      issueDescription: string;
      issueDate: Date;
      complainerName?: string;
      complainerPhone?: string;
      complainerRelation?: string;
    },
  ): Promise<WarrantyClaim> {
    // Validate warranty is active and not expired
    const warranty = await this.pool.query<{ warranty_end_date: Date; status: string }>(
      `
        SELECT warranty_end_date, status FROM sales.sale_warranties
        WHERE id = $1 AND store_id = $2
      `,
      [data.saleWarrantyId, storeId],
    );

    if (warranty.rows.length === 0) {
      throw new NotFoundException('Warranty not found');
    }

    const warrantyRow = warranty.rows[0];
    if (warrantyRow.status !== 'active') {
      throw new BadRequestException('Warranty is not active');
    }

    if (new Date() > new Date(warrantyRow.warranty_end_date)) {
      throw new BadRequestException('Warranty has expired');
    }

    // Generate claim reference number
    const claimRefNumber = `CLM-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const result = await this.pool.query(
      `
        INSERT INTO sales.warranty_claims (
          id, tenant_id, store_id, sale_warranty_id, device_serial_id,
          claim_type, issue_description, issue_date, claim_submitted_date,
          claim_reference_number, status, complainer_name, complainer_phone,
          complainer_relation, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, 'submitted', $9, $10, $11, NOW(), NOW()
        )
        RETURNING
          id, tenant_id, store_id, sale_warranty_id, device_serial_id,
          claim_type, issue_description, issue_date, claim_submitted_date,
          claim_reference_number, status, complainer_name, complainer_phone,
          complainer_relation, rejection_reason, approval_notes,
          approved_by_user_id, approved_at, resolution_type, replacement_serial_id,
          created_at, updated_at
      `,
      [
        tenantId,
        storeId,
        data.saleWarrantyId,
        data.deviceSerialId,
        data.claimType,
        data.issueDescription,
        data.issueDate,
        claimRefNumber,
        data.complainerName || null,
        data.complainerPhone || null,
        data.complainerRelation || 'customer',
      ],
    );

    // A submitted claim moves the warranty into 'claimed' until the claim is resolved
    await this.pool.query(
      `UPDATE sales.sale_warranties SET status = 'claimed', updated_at = NOW() WHERE id = $1`,
      [data.saleWarrantyId],
    );

    return this.mapToWarrantyClaim(result.rows[0]);
  }

  /**
   * Approve or reject a warranty claim
   */
  async resolveWarrantyClaim(
    claimId: string,
    storeId: string,
    data: {
      status: WarrantyClaimStatus;
      rejectionReason?: string;
      approvalNotes?: string;
      resolutionType?: string;
      replacementSerialId?: string;
      approvedByUserId: string;
    },
  ): Promise<WarrantyClaim> {
    if (!['approved', 'rejected', 'completed', 'cancelled'].includes(data.status)) {
      throw new BadRequestException('Invalid claim status');
    }

    const result = await this.pool.query(
      `
        UPDATE sales.warranty_claims
        SET
          status = $1,
          rejection_reason = $2,
          approval_notes = $3,
          resolution_type = $4,
          replacement_serial_id = $5,
          approved_by_user_id = $6,
          approved_at = NOW(),
          updated_at = NOW()
        WHERE id = $7 AND store_id = $8
        RETURNING
          id, tenant_id, store_id, sale_warranty_id, device_serial_id,
          claim_type, issue_description, issue_date, claim_submitted_date,
          claim_reference_number, status, rejection_reason, approval_notes,
          approved_by_user_id, approved_at, resolution_type, replacement_serial_id,
          created_at, updated_at
      `,
      [
        data.status,
        data.rejectionReason || null,
        data.approvalNotes || null,
        data.resolutionType || null,
        data.replacementSerialId || null,
        data.approvedByUserId,
        claimId,
        storeId,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Warranty claim not found');
    }

    // Resolved claims (rejected/cancelled/completed) release the warranty back to 'active'
    if (['rejected', 'cancelled', 'completed'].includes(data.status)) {
      await this.pool.query(
        `UPDATE sales.sale_warranties SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [result.rows[0].sale_warranty_id],
      );
    }

    return this.mapToWarrantyClaim(result.rows[0]);
  }

  /**
   * Get warranty claims for dashboard
   */
  async getWarrantyClaims(
    storeId: string,
    filters: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ claims: any[]; total: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let whereClause = 'wc.store_id = $1';
    const params: any[] = [storeId];

    if (filters.status) {
      whereClause += ` AND wc.status = $${params.length + 1}`;
      params.push(filters.status);
    }

    // Get count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sales.warranty_claims wc WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    // Get results with warranty/device/sale context for the claims workspace
    const result = await this.pool.query(
      `
        SELECT
          wc.id, wc.tenant_id, wc.store_id, wc.sale_warranty_id, wc.device_serial_id,
          wc.claim_type, wc.issue_description, wc.issue_date, wc.claim_submitted_date,
          wc.claim_reference_number, wc.status, wc.complainer_name, wc.complainer_phone,
          wc.complainer_relation, wc.rejection_reason, wc.approval_notes,
          wc.approved_by_user_id, wc.approved_at, wc.resolution_type, wc.replacement_serial_id,
          wc.created_at, wc.updated_at,
          sw.warranty_reference_number, sw.warranty_end_date,
          ds.serial_number, ds.imei_number, ds.device_model,
          s.sale_no, s.customer_name, s.customer_phone
        FROM sales.warranty_claims wc
        LEFT JOIN sales.sale_warranties sw ON sw.id = wc.sale_warranty_id
        LEFT JOIN inventory.device_serials ds ON ds.id = wc.device_serial_id
        LEFT JOIN sales.sales s ON s.id = sw.sale_id
        WHERE ${whereClause}
        ORDER BY wc.claim_submitted_date DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    );

    return {
      claims: result.rows.map((row) => ({
        ...this.mapToWarrantyClaim(row),
        warrantyReferenceNumber: row.warranty_reference_number,
        warrantyEndDate: row.warranty_end_date,
        serialNumber: row.serial_number,
        imeiNumber: row.imei_number,
        deviceModel: row.device_model,
        saleNo: row.sale_no,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
      })),
      total,
    };
  }

  /**
   * Manually transition a sale warranty's status (expire, void, transfer, reactivate)
   */
  async updateSaleWarrantyStatus(
    warrantyId: string,
    storeId: string,
    data: { status: string; note?: string },
  ): Promise<SaleWarranty> {
    if (!['active', 'claimed', 'expired', 'voided', 'transferred'].includes(data.status)) {
      throw new BadRequestException('Invalid warranty status');
    }

    const result = await this.pool.query(
      `
        UPDATE sales.sale_warranties
        SET status = $1, notes = $2, updated_at = NOW()
        WHERE id = $3 AND store_id = $4
        RETURNING
          id, tenant_id, store_id, sale_id, sale_item_id, device_serial_id,
          warranty_policy_id, warranty_reference_number, warranty_start_date,
          warranty_end_date, warranty_purchased_price, status, notes, created_at, updated_at
      `,
      [data.status, data.note ?? null, warrantyId, storeId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Warranty not found');
    }

    return this.mapToSaleWarranty(result.rows[0]);
  }

  private mapToWarrantyPolicy(row: any): WarrantyPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      code: row.code,
      name: row.name,
      warrantyType: row.warranty_type,
      durationMonths: row.duration_months,
      coverageScope: row.coverage_scope,
      appliesToCategoryIds: row.applies_to_category_ids,
      costPrice: row.cost_price,
      costToStore: row.cost_to_store,
      isDefaultPolicy: row.is_default,
      termsText: row.terms_text,
      exclusionsText: row.exclusions_text,
      claimProcessText: row.claim_process_text,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToSaleWarranty(row: any): SaleWarranty {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      saleId: row.sale_id,
      saleItemId: row.sale_item_id,
      deviceSerialId: row.device_serial_id,
      warrantyPolicyId: row.warranty_policy_id,
      warrantyReferenceNumber: row.warranty_reference_number,
      warrantyStartDate: row.warranty_start_date,
      warrantyEndDate: row.warranty_end_date,
      warrantyPurchasedPrice: row.warranty_purchased_price,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToWarrantyClaim(row: any): WarrantyClaim {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      storeId: row.store_id,
      saleWarrantyId: row.sale_warranty_id,
      deviceSerialId: row.device_serial_id,
      claimType: row.claim_type,
      issueDescription: row.issue_description,
      issueDate: row.issue_date,
      claimSubmittedDate: row.claim_submitted_date,
      claimReferenceNumber: row.claim_reference_number,
      status: row.status,
      complainerName: row.complainer_name,
      complainerPhone: row.complainer_phone,
      complainerRelation: row.complainer_relation,
      rejectionReason: row.rejection_reason,
      approvalNotes: row.approval_notes,
      approvedByUserId: row.approved_by_user_id,
      approvedAt: row.approved_at,
      resolutionType: row.resolution_type,
      replacementSerialId: row.replacement_serial_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
