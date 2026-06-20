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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: unknown) {
    return this.authService.login(loginSchema.parse(payload));
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
