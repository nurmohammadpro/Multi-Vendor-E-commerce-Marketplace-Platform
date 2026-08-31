import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { TrackingProfilesController } from './tracking-profiles.controller.js';
import { TrackingProfilesService } from './tracking-profiles.service.js';

@Module({
  controllers: [CatalogController, TrackingProfilesController],
  providers: [CatalogService, TrackingProfilesService],
  exports: [CatalogService, TrackingProfilesService],
})
export class CatalogModule {}
