import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionAuthService } from '../auth/session-auth.service.js';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly sessionAuthService: SessionAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await this.sessionAuthService.requireSessionFromAuthorizationHeader(
      request.headers.authorization,
    );
    request.user = session;
    return true;
  }
}
