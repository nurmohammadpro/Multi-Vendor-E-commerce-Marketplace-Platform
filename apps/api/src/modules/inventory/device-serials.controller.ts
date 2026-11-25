import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthSession } from '../auth/auth.types.js';
import { JwtGuard } from '../guard/jwt.guard.js';
import { StoreGuard } from '../guard/store.guard.js';
import { DeviceSerialsService } from './device-serials.service.js';

@Controller('inventory/serials')
@UseGuards(JwtGuard, StoreGuard)
export class DeviceSerialsController {
  constructor(private readonly deviceSerialsService: DeviceSerialsService) {}

  /**
   * Create a single device serial
   * POST /v1/inventory/serials
   */
  @Post()
  async createSerial(
    @Req() req: any,
    @Body()
    body: {
      skuId: string;
      serialNumber: string;
      imeiNumber?: string;
      deviceModel: string;
      color?: string;
      manufactureDateDate?: Date;
      batchCode: string;
      currentLocationId?: string;
      specificationsJson?: Record<string, any>;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.createDeviceSerial(storeId, session.user.tenantId, body);
  }

  /**
   * Bulk import device serials from CSV
   * POST /v1/inventory/serials/bulk-import
   */
  @Post('bulk-import')
  async bulkImport(
    @Req() req: any,
    @Body()
    body: {
      serials: Array<{
        serialNumber: string;
        imeiNumber?: string;
        deviceModel: string;
        skuId: string;
        batchCode: string;
        color?: string;
        specifications?: Record<string, any>;
      }>;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.bulkImportSerials(storeId, session.user.tenantId, body.serials);
  }

  /**
   * Get device serial by ID
   * GET /v1/inventory/serials/:serialId
   */
  @Get(':serialId')
  async getSerial(
    @Req() req: any,
    @Param('serialId') serialId: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.getDeviceSerial(serialId, storeId);
  }

  /**
   * Search device serials
   * GET /v1/inventory/serials/search?serialNumber=ABC&status=in_stock&limit=50&offset=0
   */
  @Get('search/all')
  async searchSerials(
    @Req() req: any,
    @Query('serialNumber') serialNumber?: string,
    @Query('imeiNumber') imeiNumber?: string,
    @Query('batchCode') batchCode?: string,
    @Query('status') status?: string,
    @Query('skuId') skuId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.searchSerials(
      storeId,
      {
        serialNumber,
        imeiNumber,
        batchCode,
        status,
        skuId,
      },
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  /**
   * Update device serial status
   * PATCH /v1/inventory/serials/:serialId/status
   */
  @Patch(':serialId/status')
  async updateStatus(
    @Req() req: any,
    @Param('serialId') serialId: string,
    @Body()
    body: {
      status: string;
      assignedToSaleId?: string;
    },
  ) {
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.updateDeviceSerialStatus(
      serialId,
      storeId,
      body.status,
      body.assignedToSaleId,
    );
  }

  /**
   * Get all serials by batch code
   * GET /v1/inventory/serials/batch/:batchCode
   */
  @Get('batch/:batchCode')
  async getByBatchCode(
    @Req() req: any,
    @Param('batchCode') batchCode: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.deviceSerialsService.getSerialsByBatchCode(batchCode, storeId);
  }
}
