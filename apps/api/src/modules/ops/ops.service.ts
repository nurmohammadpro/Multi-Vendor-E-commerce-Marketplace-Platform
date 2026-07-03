import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';

import { CommsService } from '../comms/comms.service.js';
import { DATABASE_POOL } from '../database/database.constants.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class OpsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly storageService: StorageService,
    private readonly commsService: CommsService,
  ) {}

  async listOutbox(status?: string, limit = 100) {
    const result = await this.pool.query(
      `select id, tenant_id, aggregate_type, aggregate_id, event_type, status, available_at, published_at, created_at
       from integration.outbox_events where ($1::text is null or status = $1::text) order by created_at desc limit $2`,
      [status ?? null, Math.max(1, Math.min(limit, 500))],
    );
    return { events: result.rows };
  }

  async processOutboxBatch() {
    const result = await this.pool.query(
      `update integration.outbox_events set status = 'published', published_at = now()
       where id in (select id from integration.outbox_events where status = 'pending' and available_at <= now() order by created_at asc limit 100)
       returning id, event_type, aggregate_type, aggregate_id, published_at`,
    );
    return { processedCount: result.rowCount ?? 0, events: result.rows };
  }

  async listExportJobs(status?: string) {
    const result = await this.pool.query(
      `select id, tenant_id, requested_by, export_type, filter_json, file_path, status, created_at, completed_at
       from reporting.export_jobs where ($1::text is null or status = $1::text) order by created_at desc`,
      [status ?? null],
    );
    return { exportJobs: result.rows };
  }

  async processExportJob(jobId: string) {
    const updateToProcessing = await this.pool.query<{
      id: string; tenant_id: string; requested_by: string; export_type: 'sales' | 'inventory' | 'billing' | 'support';
      status: string; filter_json: Record<string, unknown>;
    }>(
      `update reporting.export_jobs set status = 'processing' where id = $1 and status = 'queued'
       returning id, tenant_id, requested_by, export_type, status, filter_json`,
      [jobId],
    );
    const job = updateToProcessing.rows[0];
    if (!job) throw new NotFoundException('Queued export job not found');
    const csvContent = await this.buildExportCsv(job.export_type, job.filter_json ?? {});
    const storage = await this.storageService.writeTextFile(`exports/${job.export_type}/${jobId}.csv`, csvContent);
    const result = await this.pool.query(
      `update reporting.export_jobs set status = 'completed', file_path = $2, completed_at = now()
       where id = $1 returning id, export_type, status, file_path, completed_at`,
      [jobId, `/${storage.relativePath}`],
    );
    return { exportJob: result.rows[0] };
  }

  async listNotifications(status?: string, limit = 100) {
    const result = await this.pool.query(
      `select id, tenant_id, recipient_user_id, channel, template_code, title, body, status, sent_at, read_at, created_at
       from comms.notifications where ($1::text is null or status = $1::text) order by created_at desc limit $2`,
      [status ?? null, Math.max(1, Math.min(limit, 500))],
    );
    return { notifications: result.rows };
  }

  /** Delegate notification delivery to CommsService for actual email/SMS sending. */
  async processNotificationsBatch() {
    return this.commsService.processBatch(100);
  }

  async processBroadcast(broadcastId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const broadcastResult = await client.query<{
        id: string; tenant_id: string; audience_type: 'all_stores' | 'selected_stores' | 'admins';
        channel: 'in_app' | 'email' | 'sms'; title: string | null; body: string; status: string;
      }>(
        `select id, tenant_id, audience_type, channel, title, body, status from comms.broadcasts where id = $1 limit 1 for update`,
        [broadcastId],
      );
      const broadcast = broadcastResult.rows[0];
      if (!broadcast) throw new NotFoundException('Broadcast not found');
      if (broadcast.status === 'sent') { await client.query('commit'); return { broadcast, notificationsCreated: 0 }; }

      let q = `select u.id as user_id from identity.users u where u.tenant_id = $1 and u.status = 'active'`;
      if (broadcast.audience_type === 'admins') {
        q += ` and exists (select 1 from access.admin_memberships am where am.user_id = u.id and am.status = 'active')`;
      } else {
        q += ` and exists (select 1 from access.store_memberships sm where sm.user_id = u.id and sm.status = 'active')`;
      }
      const recipients = await client.query<{ user_id: string }>(q, [broadcast.tenant_id]);
      for (const r of recipients.rows) {
        await client.query(
          `insert into comms.notifications (id, tenant_id, recipient_user_id, channel, template_code, title, body, status, reference_type, reference_id, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, 'broadcast', $4, $5, 'queued', 'broadcast', $6, now(), now())`,
          [broadcast.tenant_id, r.user_id, broadcast.channel, broadcast.title, broadcast.body, broadcast.id],
        );
      }
      await client.query(`update comms.broadcasts set status = 'sent', updated_at = now() where id = $1`, [broadcast.id]);
      await client.query('commit');
      return { broadcastId: broadcast.id, notificationsCreated: recipients.rowCount ?? 0 };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async buildExportCsv(exportType: 'sales' | 'inventory' | 'billing' | 'support', _: Record<string, unknown>) {
    if (exportType === 'inventory') {
      const r = await this.pool.query(
        `select l.store_id, l.name as loc, sk.sku_code, p.name as prod, b.on_hand_qty, b.available_qty, b.updated_at
         from inventory.balances b join inventory.locations l on l.id=b.location_id join catalog.skus sk on sk.id=b.sku_id join catalog.products p on p.id=sk.product_id order by b.updated_at desc limit 1000`,
      );
      return this.csv(['store_id','loc','sku_code','prod','on_hand_qty','available_qty','updated_at'], r.rows);
    }
    if (exportType === 'billing') {
      const r = await this.pool.query(`select invoice_no, invoice_type, total_amount, status, issued_at, paid_at from billing.invoices order by created_at desc limit 1000`);
      return this.csv(['invoice_no','invoice_type','total_amount','status','issued_at','paid_at'], r.rows);
    }
    if (exportType === 'support') {
      const r = await this.pool.query(`select ticket_no, ticket_type, subject, status, priority, created_at from support.tickets order by created_at desc limit 1000`);
      return this.csv(['ticket_no','ticket_type','subject','status','priority','created_at'], r.rows);
    }
    const r = await this.pool.query(`select sale_no, total_amount, payment_status, fulfillment_status, created_at from sales.sales order by created_at desc limit 1000`);
    return this.csv(['sale_no','total_amount','payment_status','fulfillment_status','created_at'], r.rows);
  }

  private csv(headers: string[], rows: Record<string, unknown>[]) {
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"','""')}"`;
    return [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  }
}
