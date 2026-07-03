import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitConfig {
  /** Maximum requests allowed within the window */
  max: number;
  /** Sliding window duration in seconds */
  windowSeconds: number;
  /** Optional custom key prefix for grouping (e.g., 'auth', 'pos') */
  keyPrefix?: string;
}

export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

/** Marker to skip rate limiting on specific endpoints */
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
