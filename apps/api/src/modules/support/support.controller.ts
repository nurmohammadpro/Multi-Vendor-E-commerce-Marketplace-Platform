import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { SupportService } from './support.service.js';

const createTicketSchema = z.object({
  ticketType: z.enum(['support', 'dispute', 'billing', 'technical']),
  subject: z.string().min(3).max(250),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  message: z.string().min(3),
});

const createMessageSchema = z.object({
  message: z.string().min(1),
  attachmentPath: z.string().optional(),
});

@Controller('support')
@UseGuards(PermissionsGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getTickets(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('ticketType') ticketType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.supportService.getStoreTickets(headerStoreId, authContext, {
      ticketType,
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('tickets')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  createTicket(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.supportService.createStoreTicket(
      headerStoreId,
      authContext,
      session,
      createTicketSchema.parse(payload),
    );
  }

  @Get('tickets/:ticketId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getTicket(
    @Param('ticketId') ticketId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.supportService.getStoreTicket(ticketId, headerStoreId, authContext);
  }

  @Post('tickets/:ticketId/messages')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  addMessage(
    @Param('ticketId') ticketId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.supportService.addTicketMessage(
      ticketId,
      headerStoreId,
      authContext,
      session,
      createMessageSchema.parse(payload),
    );
  }
}
