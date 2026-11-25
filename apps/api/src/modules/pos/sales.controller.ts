import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthSession } from '../auth/auth.types.js';
import { JwtGuard } from '../guard/jwt.guard.js';
import { StoreGuard } from '../guard/store.guard.js';
import { SalesIntegrationService } from './sales-integration.service.js';

@Controller('v1/sales')
@UseGuards(JwtGuard, StoreGuard)
export class SalesController {
  constructor(private readonly salesIntegrationService: SalesIntegrationService) {}

  /**
   * Create sale with tech product integration
   * POST /v1/sales
   * 
   * Automatically:
   * - Links device serials to sale items
   * - Creates warranty records if category requires
   * - Updates device serial status to 'sold'
   * - Marks serials as warranty linked
   */
  @Post()
  async createSale(
    @Req() req: any,
    @Body()
    body: {
      items: Array<{
        skuId: string;
        quantity: number;
        unitPrice: number;
        deviceSerial?: string;
        deviceImei?: string;
        warrantyPolicyId?: string;
      }>;
      customerId?: string;
      paymentMethod: string;
      subtotal: number;
      tax: number;
      total: number;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.salesIntegrationService.createTechProductSale(
      storeId,
      session.user.tenantId,
      body,
    );
  }

  /**
   * Get sale with serial and warranty details
   * GET /v1/sales/:saleId
   */
  @Get(':saleId')
  async getSale(
    @Req() req: any,
    @Param('saleId') saleId: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.salesIntegrationService.getSaleWithDetails(saleId, storeId);
  }

  /**
   * Get receipt data for printing
   * GET /v1/sales/:saleId/receipt
   */
  @Get(':saleId/receipt')
  async getReceiptData(
    @Req() req: any,
    @Param('saleId') saleId: string,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.salesIntegrationService.getReceiptData(saleId, storeId);
  }
}
