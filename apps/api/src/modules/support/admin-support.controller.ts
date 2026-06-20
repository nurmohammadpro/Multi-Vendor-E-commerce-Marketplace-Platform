import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { SupportService } from './support.service.js';

const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

@Controller('admin/support')
@UseGuards(PermissionsGuard)
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @RequireContext('admin')
  @RequirePermissions('platform.support.manage')
  getTickets() {
    return this.supportService.getAdminTickets();
  }

  @Post('tickets/:ticketId/status')
  @RequireContext('admin')
  @RequirePermissions('platform.support.manage')
  updateTicketStatus(
    @Param('ticketId') ticketId: string,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.supportService.updateAdminTicketStatus(
      ticketId,
      session,
      updateTicketStatusSchema.parse(payload),
    );
  }
}
