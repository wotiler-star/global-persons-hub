// 支付工厂：按 PAYMENT_PROVIDER 选择默认渠道；各渠道实例按需取用。
// 默认 'mock'（无需密钥即可演示订阅流程），生产可设 stripe / wechat / alipay。
import type { PaymentProvider, PaymentProviderName } from './types.js';
import { MockProvider } from './mock.js';
import { StripeProvider } from './stripe.js';
import { WechatProvider } from './wechat.js';
import { AlipayProvider } from './alipay.js';

let _cache: Record<string, PaymentProvider> | null = null;

function all(): Record<string, PaymentProvider> {
  if (!_cache) {
    _cache = {
      mock: new MockProvider(),
      stripe: new StripeProvider(),
      wechat: new WechatProvider(),
      alipay: new AlipayProvider(),
    };
  }
  return _cache;
}

export function getProvider(name: PaymentProviderName): PaymentProvider {
  return all()[name] ?? all().mock;
}

export function defaultProviderName(): PaymentProviderName {
  const p = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
  return (['stripe', 'wechat', 'alipay', 'mock'].includes(p) ? p : 'mock') as PaymentProviderName;
}

/** 前端可用的渠道清单（含是否已配置密钥，未配置则仅 mock 可演示）。 */
export function listProviders(): { name: PaymentProviderName; configured: boolean }[] {
  return (Object.keys(all()) as PaymentProviderName[]).map((name) => ({
    name,
    configured: all()[name].configured(),
  }));
}

export type { PaymentProvider, PaymentProviderName, PaymentEvent, CheckoutInput, CheckoutResult, Plan } from './types.js';
