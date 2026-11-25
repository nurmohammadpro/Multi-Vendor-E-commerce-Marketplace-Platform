import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class StoreGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const storeId = request.headers['x-store-id'];

    if (!storeId) {
      throw new ForbiddenException('Missing x-store-id header');
    }

    return true;
  }
}
