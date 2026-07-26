// 支付渠道统一契约（零新增依赖；各渠道用 fetch + node:crypto 实现）。
export type PaymentProviderName = 'stripe' | 'wechat' | 'alipay' | 'mock';
export type Plan = 'pro' | 'free';

export interface CheckoutInput {
  userId: string;
  email: string;
  name: string;
  plan: Plan;
  lang: string;
  origin: string; // http(s)://host[:port]
}

export interface CheckoutResult {
  provider: PaymentProviderName;
  url?: string; // 跳转式（Stripe / 支付宝网页支付）
  qr?: string; // 扫码式（微信 Native 的 code_url）
  mock?: boolean; // mock 渠道：直接生效，无真实支付
}

export interface PaymentEvent {
  provider: PaymentProviderName;
  id: string; // 交易 / 订单号
  userId: string; // 从 out_trade_no / client_reference_id 解析
  plan: Plan;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  /** 是否已配置密钥（未配置则不应启用真实支付） */
  configured(): boolean;
  /** 创建支付会话，返回跳转 URL 或扫码 code_url */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** 校验 Webhook 回调，合法则返回支付事件，否则返回 null */
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<PaymentEvent | null>;
}
