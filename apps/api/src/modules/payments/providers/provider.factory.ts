import type { PaymentProvider } from './payment-provider.interface.js';
import { BkashProvider } from './bkash.provider.js';
import { SslcommerzProvider } from './sslcommerz.provider.js';
import { NagadProvider } from './nagad.provider.js';
import { RocketProvider } from './rocket.provider.js';

export class ProviderFactory {
  private static providers: Map<string, PaymentProvider> = new Map();

  static {
    const bkash = new BkashProvider();
    const sslcommerz = new SslcommerzProvider();
    const nagad = new NagadProvider();
    const rocket = new RocketProvider();

    this.providers.set(bkash.providerCode, bkash);
    this.providers.set(sslcommerz.providerCode, sslcommerz);
    this.providers.set(nagad.providerCode, nagad);
    this.providers.set(rocket.providerCode, rocket);
  }

  static getProvider(providerCode: string): PaymentProvider {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Unsupported payment provider: ${providerCode}`);
    }
    return provider;
  }

  static listProviders(): Array<{ code: string; name: string }> {
    return Array.from(this.providers.values()).map((p) => ({
      code: p.providerCode,
      name: p.displayName,
    }));
  }
}
