import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { AdminsService } from './admins.service.js';

const createAdminSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(10),
});

@Controller('admin/admins')
@UseGuards(PermissionsGuard)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  @RequireContext('admin')
  @RequirePermissions('platform.admin.manage')
  listAdmins(@CurrentAuthSession() authSession: AuthSession) {
    return this.adminsService.listAdmins(authSession.user.tenantId);
  }

  @Post()
  @RequireContext('admin')
  @RequirePermissions('platform.admin.manage')
  createAdmin(@CurrentAuthSession() authSession: AuthSession, @Body() payload: unknown) {
    return this.adminsService.createAdmin(authSession.user.tenantId, createAdminSchema.parse(payload));
  }
}
