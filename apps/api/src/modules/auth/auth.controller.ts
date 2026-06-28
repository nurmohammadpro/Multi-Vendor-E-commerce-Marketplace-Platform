import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';

import { AuthService } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  password: z.string().min(10),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'email or phone is required',
});

const selectContextSchema = z.object({
  type: z.enum(['admin', 'store', 'customer']),
  storeId: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'email or phone is required',
});

const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(10),
});

const mfaVerifySchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  methodType: z.enum(['totp', 'sms', 'email']),
  code: z.string().min(4).max(12),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'email or phone is required',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: unknown) {
    return this.authService.login(loginSchema.parse(payload));
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    const sessionToken = this.extractBearerToken(authorization);
    return this.authService.logout(sessionToken);
  }

  @Post('refresh')
  refresh(@Headers('authorization') authorization?: string) {
    const sessionToken = this.extractBearerToken(authorization);
    return this.authService.refresh(sessionToken);
  }

  @Post('forgot-password')
  forgotPassword(@Body() payload: unknown) {
    return this.authService.forgotPassword(forgotPasswordSchema.parse(payload));
  }

  @Post('reset-password')
  resetPassword(@Body() payload: unknown) {
    return this.authService.resetPassword(resetPasswordSchema.parse(payload));
  }

  @Post('mfa/verify')
  verifyMfa(@Body() payload: unknown) {
    return this.authService.verifyMfa(mfaVerifySchema.parse(payload));
  }

  @Get('contexts')
  getContexts(@Headers('authorization') authorization?: string) {
    const sessionToken = this.extractBearerToken(authorization);
    return this.authService.getContextsBySessionToken(sessionToken);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const sessionToken = this.extractBearerToken(authorization);
    return this.authService.getSessionProfile(sessionToken);
  }

  @Post('select-context')
  selectContext(
    @Headers('authorization') authorization: string | undefined,
    @Body() payload: unknown,
  ) {
    const sessionToken = this.extractBearerToken(authorization);
    return this.authService.selectContext(sessionToken, selectContextSchema.parse(payload));
  }

  private extractBearerToken(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return token;
  }
}
