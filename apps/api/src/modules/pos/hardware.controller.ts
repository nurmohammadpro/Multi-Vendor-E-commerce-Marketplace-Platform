import {
  Body,
  Controller,
  Delete,
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
import { HardwareService } from './hardware.service.js';

@Controller('v1/pos/hardware')
@UseGuards(JwtGuard, StoreGuard)
export class HardwareController {
  constructor(private readonly hardwareService: HardwareService) {}

  /**
   * Register a hardware device
   * POST /v1/pos/hardware/devices
   */
  @Post('devices')
  async registerDevice(
    @Req() req: any,
    @Body()
    body: {
      deviceType: string;
      vendorId: string;
      productId: string;
      deviceName: string;
      protocol: string;
      interfaceType: string;
      configurationJson: Record<string, any>;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.registerHardwareDevice(storeId, session.user.tenantId, body);
  }

  /**
   * List hardware devices for store
   * GET /v1/pos/hardware/devices
   */
  @Get('devices')
  async listDevices(@Req() req: any) {
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.listHardwareDevices(storeId);
  }

  /**
   * Get specific hardware device
   * GET /v1/pos/hardware/devices/:deviceId
   */
  @Get('devices/:deviceId')
  async getDevice(
    @Req() req: any,
    @Param('deviceId') deviceId: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.getHardwareDevice(deviceId, storeId);
  }

  /**
   * Update hardware device
   * PATCH /v1/pos/hardware/devices/:deviceId
   */
  @Patch('devices/:deviceId')
  async updateDevice(
    @Req() req: any,
    @Param('deviceId') deviceId: string,
    @Body()
    body: {
      deviceName?: string;
      configurationJson?: Record<string, any>;
      status?: string;
    },
  ) {
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.updateHardwareDevice(deviceId, storeId, body);
  }

  /**
   * Deregister hardware device
   * DELETE /v1/pos/hardware/devices/:deviceId
   */
  @Delete('devices/:deviceId')
  async deregisterDevice(
    @Req() req: any,
    @Param('deviceId') deviceId: string,
  ) {
    const storeId = req.headers['x-store-id'];

    await this.hardwareService.deregisterHardwareDevice(deviceId, storeId);

    return { message: 'Device deregistered successfully' };
  }

  /**
   * Queue a print job
   * POST /v1/pos/hardware/print-jobs
   */
  @Post('print-jobs')
  async queuePrintJob(
    @Req() req: any,
    @Body()
    body: {
      hardwareDeviceId: string;
      jobType: string;
      referenceId: string;
      contentJson: Record<string, any>;
      tsplCommand?: string;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.queuePrintJob(storeId, session.user.tenantId, body);
  }

  /**
   * Get print queue
   * GET /v1/pos/hardware/print-jobs?limit=50
   */
  @Get('print-jobs')
  async getPrintQueue(
    @Req() req: any,
    @Query('limit') limit: number = 50,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.getPrintQueue(storeId, limit);
  }

  /**
   * Update print job status
   * PATCH /v1/pos/hardware/print-jobs/:jobId
   */
  @Patch('print-jobs/:jobId')
  async updatePrintJob(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Body()
    body: {
      status: string;
      errorMessage?: string;
    },
  ) {
    const storeId = req.headers['x-store-id'];

    return this.hardwareService.updatePrintJobStatus(
      jobId,
      storeId,
      body.status as any,
      body.errorMessage,
    );
  }
}
