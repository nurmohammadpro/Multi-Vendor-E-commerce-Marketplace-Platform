import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { SupportService } from './support.service.js';

const createBroadcastSchema = z.object({
  audienceType: z.enum(['all_stores', 'selected_stores', 'admins']),
  channel: z.enum(['in_app', 'email', 'sms']),
  title: z.string().max(200).optional(),
  body: z.string().min(3),
  scheduledAt: z.string().datetime().optional(),
});

@Controller('admin')
@UseGuards(PermissionsGuard)
export class AdminBroadcastController {
  constructor(private readonly supportService: SupportService) {}

  @Get('broadcasts')
  @RequireContext('admin')
  @RequirePermissions('platform.broadcast.send')
  listBroadcasts(@CurrentAuthSession() session: AuthSession | null) {
    return this.supportService.listBroadcasts(session);
  }

  @Post('broadcasts')
  @RequireContext('admin')
  @RequirePermissions('platform.broadcast.send')
  createBroadcast(
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.supportService.createBroadcast(session, createBroadcastSchema.parse(payload));
  }
}
