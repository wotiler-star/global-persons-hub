// Stripe 支付（零依赖：用 fetch 调 REST API + node:crypto 验签 Webhook）。
// 环境变量：STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、STRIPE_PRO_AMOUNT(分)、STRIPE_CURRENCY。
import crypto from 'node:crypto';
import type { PaymentProvider, CheckoutInput, CheckoutResult, PaymentEvent } from './types.js';

export class StripeProvider implements PaymentProvider {
  name = 'stripe' as const;
  private secret = process.env.STRIPE_SECRET_KEY || '';
  private whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  private amount = Number(process.env.STRIPE_PRO_AMOUNT || '990');
  private currency = process.env.STRIPE_CURRENCY || 'usd';

  configured(): boolean {
    return !!this.secret;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', `${input.origin}/${input.lang}/account?pay=success`);
    body.set('cancel_url', `${input.origin}/${input.lang}/pricing?pay=cancel`);
    body.set('client_reference_id', input.userId);
    if (input.email) body.set('customer_email', input.email);
    body.set('line_items[0][price_data][currency]', this.currency);
    body.set('line_items[0][price_data][product_data][name]', 'Global Persons Hub · Pro');
    body.set('line_items[0][price_data][unit_amount]', String(this.amount));
    body.set('line_items[0][quantity]', '1');

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Stripe checkout 失败 ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return { provider: 'stripe', url: json.url };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<PaymentEvent | null> {
    const sig = headers['stripe-signature'];
    if (!sig || !this.whSecret) return null;
    const parts: Record<string, string> = {};
    for (const p of sig.split(',')) {
      const eq = p.indexOf('=');
      if (eq > -1) parts[p.slice(0, eq)] = p.slice(eq + 1);
    }
    const t = parts['t'];
    const v1 = parts['v1'];
    if (!t || !v1) return null;
    // STRIPE_WEBHOOK_SECRET 形如 whsec_<base64>；HMAC 密钥是 whsec_ 之后 base64 解码出的字节。
    const rawSecret = this.whSecret.startsWith('whsec_') ? this.whSecret.slice(7) : this.whSecret;
    const key = Buffer.from(rawSecret, 'base64');
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${t}.${rawBody}`)
      .digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const evt = JSON.parse(rawBody) as any;
    if (evt?.type === 'checkout.session.completed') {
      const userId = evt.data?.object?.client_reference_id;
      if (userId) return { provider: 'stripe', id: evt.id, userId, plan: 'pro' };
    }
    return null;
  }
}
