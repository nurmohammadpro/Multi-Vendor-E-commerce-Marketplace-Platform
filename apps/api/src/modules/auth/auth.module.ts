import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionAuthService } from './session-auth.service.js';
import { SessionContextService } from './session-context.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionContextService, SessionAuthService],
  exports: [AuthService, SessionContextService, SessionAuthService],
})
export class AuthModule {}
