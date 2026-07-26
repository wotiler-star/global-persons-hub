import type { PaymentProvider, CheckoutInput, CheckoutResult, PaymentEvent } from './types.js';

/** 开发演示渠道：不接真实支付，订阅由路由直接置 pro。 */
export class MockProvider implements PaymentProvider {
  name = 'mock' as const;

  configured(): boolean {
    return true;
  }

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return { provider: 'mock', mock: true };
  }

  async verifyWebhook(): Promise<PaymentEvent | null> {
    return null;
  }
}
