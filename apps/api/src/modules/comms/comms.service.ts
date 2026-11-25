import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.constants.js';
import { ResendProvider } from './providers/resend.provider.js';
import { SmtpProvider } from './providers/smtp.provider.js';
import { GenericSmsProvider } from './providers/generic-sms.provider.js';
import type { EmailProvider } from './providers/email-provider.interface.js';
import type { SmsProvider } from './providers/sms-provider.interface.js';

@Injectable()
export class CommsService {
  private emailProvider: EmailProvider | null = null;
  private smsProvider: SmsProvider | null = null;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    this.initProviders();
  }

  private initProviders() {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      this.emailProvider = new ResendProvider({ apiKey: resendKey, defaultFrom: process.env.EMAIL_FROM });
    } else {
      const smtpHost = process.env.SMTP_HOST;
      if (smtpHost) {
        this.emailProvider = new SmtpProvider({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
          defaultFrom: process.env.EMAIL_FROM,
        });
      }
    }

    const smsApiUrl = process.env.SMS_API_URL;
    if (smsApiUrl) {
      this.smsProvider = new GenericSmsProvider({
        apiUrl: smsApiUrl,
        apiKey: process.env.SMS_API_KEY || '',
        senderId: process.env.SMS_SENDER_ID,
      });
    }
  }

  /** Queue a notification for async delivery. */
  async queueNotification(input: {
    tenantId: string;
    recipientUserId: string;
    channel: 'in_app' | 'email' | 'sms';
    title?: string;
    body: string;
    templateCode?: string;
    contextJson?: Record<string, unknown>;
    referenceType?: string;
    referenceId?: string;
  }) {
    const result = await this.pool.query<{ id: string }>(
      `insert into comms.notifications (
        id, tenant_id, recipient_user_id, channel, template_code, title, body, status,
        context_json, reference_type, reference_id, created_at, updated_at
      ) values (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'queued',
        $7, $8, $9, now(), now()
      ) returning id`,
      [
        input.tenantId, input.recipientUserId, input.channel,
        input.templateCode || null, input.title || null, input.body,
        JSON.stringify(input.contextJson || {}),
        input.referenceType || null, input.referenceId || null,
      ],
    );
    return { notificationId: result.rows[0].id };
  }

  /** Send a notification immediately (bypasses queue). */
  async sendImmediate(input: {
    recipientEmail?: string;
    recipientPhone?: string;
    channel: 'email' | 'sms';
    subject?: string;
    body: string;
  }) {
    if (input.channel === 'email' && input.recipientEmail) {
      if (!this.emailProvider) return { status: 'failed', reason: 'No email provider configured' };
      const result = await this.emailProvider.send({
        to: input.recipientEmail,
        subject: input.subject || 'Notification',
        textBody: input.body,
      });
      return { status: result.status, messageId: result.messageId, error: result.error };
    }
    if (input.channel === 'sms' && input.recipientPhone) {
      if (!this.smsProvider) return { status: 'failed', reason: 'No SMS provider configured' };
      const result = await this.smsProvider.send({ to: input.recipientPhone, body: input.body });
      return { status: result.status, messageId: result.messageId, error: result.error };
    }
    return { status: 'failed', reason: 'Missing recipient' };
  }

  /** Process a batch of queued notifications and actually deliver them. */
  async processBatch(limit = 100): Promise<{ processed: number; failed: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // Lock batch of queued notifications
      const batch = await client.query<{
        id: string; channel: string; title: string; body: string;
        recipient_user_id: string;
      }>(
        `select id, channel, title, body, recipient_user_id
         from comms.notifications
         where status = 'queued'
         order by created_at asc
         limit $1
         for update skip locked`,
        [limit],
      );

      let processed = 0;
      let failed = 0;

      for (const notif of batch.rows) {
        try {
          if (notif.channel === 'in_app') {
            await client.query(
              `update comms.notifications set status = 'sent', sent_at = now(), updated_at = now() where id = $1`,
              [notif.id],
            );
            processed++;
            continue;
          }

          // Resolve recipient contact
          const userResult = await client.query<{ email: string; phone: string }>(
            `select email, phone from identity.users where id = $1 limit 1`,
            [notif.recipient_user_id],
          );
          const user = userResult.rows[0];

          if (notif.channel === 'email' && user?.email && this.emailProvider) {
            const result = await this.emailProvider.send({
              to: user.email,
              subject: notif.title || 'Merch Flow Notification',
              textBody: notif.body,
            });
            if (result.status === 'sent') {
              await client.query(
                `update comms.notifications set status = 'sent', sent_at = now(), provider_message_id = $2, updated_at = now() where id = $1`,
                [notif.id, result.messageId],
              );
              processed++;
            } else {
              await client.query(
                `update comms.notifications set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
                [notif.id, result.error || 'Delivery failed'],
              );
              failed++;
            }
          } else if (notif.channel === 'sms' && user?.phone && this.smsProvider) {
            const result = await this.smsProvider.send({ to: user.phone, body: notif.body });
            if (result.status === 'sent') {
              await client.query(
                `update comms.notifications set status = 'sent', sent_at = now(), provider_message_id = $2, updated_at = now() where id = $1`,
                [notif.id, result.messageId],
              );
              processed++;
            } else {
              await client.query(
                `update comms.notifications set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
                [notif.id, result.error || 'Delivery failed'],
              );
              failed++;
            }
          } else {
            // No provider or no contact — mark as failed
            await client.query(
              `update comms.notifications set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
              [notif.id, 'No provider or recipient contact available'],
            );
            failed++;
          }
        } catch (err) {
          await client.query(
            `update comms.notifications set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
            [notif.id, (err as Error).message],
          );
          failed++;
        }
      }

      await client.query('commit');
      return { processed, failed };
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Render a template with variable substitution. */
  renderTemplate(template: { subject?: string; body: string }, variables: Record<string, string>): { subject?: string; body: string } {
    let body = template.body;
    let subject = template.subject;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      body = body.replace(regex, value);
      if (subject) subject = subject.replace(regex, value);
    }
    return { subject, body };
  }

  async listTemplates(tenantId: string) {
    const result = await this.pool.query(
      `select * from comms.notification_templates where tenant_id = $1 order by code asc`,
      [tenantId],
    );
    return { templates: result.rows };
  }

  async upsertTemplate(tenantId: string, input: {
    code: string; channel: 'in_app' | 'email' | 'sms'; subjectTemplate?: string;
    bodyTemplate: string; isActive?: boolean;
  }) {
    const result = await this.pool.query(
      `insert into comms.notification_templates (id, tenant_id, code, channel, subject_template, body_template, is_active, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
       on conflict (tenant_id, code) do update set
         channel = excluded.channel, subject_template = excluded.subject_template,
         body_template = excluded.body_template, is_active = excluded.is_active, updated_at = now()
       returning *`,
      [tenantId, input.code, input.channel, input.subjectTemplate || null, input.bodyTemplate, input.isActive ?? true],
    );
    return { template: result.rows[0] };
  }

  /** Fetch and render a template by code, then queue notification. */
  async sendFromTemplate(input: {
    tenantId: string; recipientUserId: string; channel: 'in_app' | 'email' | 'sms';
    templateCode: string; variables: Record<string, string>;
    referenceType?: string; referenceId?: string;
  }) {
    const tplResult = await this.pool.query<{ subject_template: string; body_template: string }>(
      `select subject_template, body_template from comms.notification_templates where tenant_id = $1 and code = $2 and is_active = true limit 1`,
      [input.tenantId, input.templateCode],
    );
    const tpl = tplResult.rows[0];
    if (!tpl) throw new Error(`Template ${input.templateCode} not found or inactive`);

    const rendered = this.renderTemplate(
      { subject: tpl.subject_template, body: tpl.body_template },
      input.variables,
    );

    return this.queueNotification({
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      channel: input.channel,
      title: rendered.subject,
      body: rendered.body,
      templateCode: input.templateCode,
      contextJson: input.variables,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
  }
}
