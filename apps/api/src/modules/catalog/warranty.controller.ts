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
import { WarrantyService } from './warranty.service.js';

@Controller('v1/warranty')
@UseGuards(JwtGuard, StoreGuard)
export class WarrantyController {
  constructor(private readonly warrantyService: WarrantyService) {}

  /**
   * Create warranty policy
   * POST /v1/warranty/policies
   */
  @Post('policies')
  async createPolicy(
    @Req() req: any,
    @Body()
    body: {
      code: string;
      name: string;
      warrantyType: string;
      durationMonths: number;
      coverageScope: string;
      appliesToCategoryIds: string[];
      costPrice?: number;
      costToStore?: number;
      isDefaultPolicy?: boolean;
      termsText: string;
      exclusionsText?: string;
      claimProcessText?: string;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.warrantyService.createWarrantyPolicy(storeId, session.user.tenantId, body);
  }

  /**
   * Get warranty policies for store
   * GET /v1/warranty/policies
   */
  @Get('policies')
  async getPolicies(@Req() req: any) {
    // TODO: Implement list warranties
    return { message: 'List warranties not yet implemented' };
  }

  /**
   * Create warranty for sale
   * POST /v1/warranty/sale-warranties
   */
  @Post('sale-warranties')
  async createSaleWarranty(
    @Req() req: any,
    @Body()
    body: {
      saleId: string;
      saleItemId: string;
      deviceSerialId: string;
      warrantyPolicyId: string;
      warrantyStartDate: Date;
      warrantyPurchasedPrice?: number;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.warrantyService.createSaleWarranty(storeId, session.user.tenantId, body);
  }

  /**
   * Get warranty by device serial
   * GET /v1/warranty/serials/:serialId
   */
  @Get('serials/:serialId')
  async getWarrantyBySerial(
    @Req() req: any,
    @Param('serialId') serialId: string,
  ) {
    const storeId = req.headers['x-store-id'];
    const warranty = await this.warrantyService.getWarrantyBySerial(serialId, storeId);

    if (!warranty) {
      return { message: 'No active warranty found for this device' };
    }

    return warranty;
  }

  /**
   * Submit warranty claim
   * POST /v1/warranty/claims
   */
  @Post('claims')
  async submitClaim(
    @Req() req: any,
    @Body()
    body: {
      saleWarrantyId: string;
      deviceSerialId: string;
      claimType: string;
      issueDescription: string;
      issueDate: Date;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.warrantyService.submitWarrantyClaim(storeId, session.user.tenantId, body);
  }

  /**
   * Get warranty claims
   * GET /v1/warranty/claims?status=submitted&limit=50&offset=0
   */
  @Get('claims')
  async getClaims(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    const storeId = req.headers['x-store-id'];

    return this.warrantyService.getWarrantyClaims(storeId, {
      status,
      limit,
      offset,
    });
  }

  /**
   * Approve or reject warranty claim
   * PATCH /v1/warranty/claims/:claimId
   */
  @Patch('claims/:claimId')
  async resolveClaim(
    @Req() req: any,
    @Param('claimId') claimId: string,
    @Body()
    body: {
      status: string;
      rejectionReason?: string;
      approvalNotes?: string;
      resolutionType?: string;
      replacementSerialId?: string;
    },
  ) {
    const session: AuthSession = req.user;
    const storeId = req.headers['x-store-id'];

    return this.warrantyService.resolveWarrantyClaim(claimId, storeId, {
      ...body,
      approvedByUserId: session.user.id,
    } as any);
  }
}
