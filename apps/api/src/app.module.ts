import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { AdminsModule } from './modules/admins/admins.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { OpsModule } from './modules/ops/ops.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PosModule } from './modules/pos/pos.module.js';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { ShippingModule } from './modules/shipping/shipping.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { StoreModule } from './modules/store/store.module.js';
import { SupportModule } from './modules/support/support.module.js';

@Module({
  imports: [
    AuditModule,
    DatabaseModule,
    AuthModule,
    RbacModule,
    AdminsModule,
    StoreModule,
    CatalogModule,
    InventoryModule,
    OpsModule,
    PaymentsModule,
    PosModule,
    PlatformSettingsModule,
    BillingModule,
    ShippingModule,
    StorageModule,
    SupportModule,
    ReportingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
