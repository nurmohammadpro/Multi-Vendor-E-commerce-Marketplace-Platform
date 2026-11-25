import { Module } from '@nestjs/common';
import { SessionAuthService } from '../auth/session-auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { JwtGuard } from './jwt.guard.js';
import { StoreGuard } from './store.guard.js';

@Module({
  imports: [AuthModule],
  providers: [RateLimitGuard, JwtGuard, StoreGuard],
  exports: [RateLimitGuard, JwtGuard, StoreGuard],
})
export class GuardModule {}
