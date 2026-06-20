import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service.js';

@Injectable()
export class SessionAuthService {
  constructor(private readonly authService: AuthService) {}

  async requireSessionFromAuthorizationHeader(authorization?: string) {
    const sessionToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

    if (!sessionToken) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return this.authService.getSessionProfile(sessionToken);
  }
}
