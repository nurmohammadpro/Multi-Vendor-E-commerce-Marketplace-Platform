import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminSampleController } from './admin-sample.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RbacService } from './rbac.service.js';
import { StoreSampleController } from './store-sample.controller.js';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminSampleController, StoreSampleController],
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
