import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { TrackingProfilesController } from './tracking-profiles.controller.js';
import { TrackingProfilesService } from './tracking-profiles.service.js';
import { WarrantyController } from './warranty.controller.js';
import { WarrantyService } from './warranty.service.js';

@Module({
  controllers: [CatalogController, TrackingProfilesController, WarrantyController],
  providers: [CatalogService, TrackingProfilesService, WarrantyService],
  exports: [CatalogService, TrackingProfilesService],
})
export class CatalogModule {}
