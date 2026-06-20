import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PosModule } from './modules/pos/pos.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { ShippingModule } from './modules/shipping/shipping.module.js';
import { StoreModule } from './modules/store/store.module.js';
import { SupportModule } from './modules/support/support.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    StoreModule,
    CatalogModule,
    InventoryModule,
    PosModule,
    BillingModule,
    ShippingModule,
    SupportModule,
    ReportingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
