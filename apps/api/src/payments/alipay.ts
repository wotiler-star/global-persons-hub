// 支付宝（零依赖：网页支付用 fetch 拼网关 URL + SHA256withRSA 签名，Webhook 用 RSA2 验签）。
// 环境变量：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY(商户私钥 PEM)、ALIPAY_PUBLIC_KEY(支付宝公钥 PEM)、
//           ALIPAY_GATEWAY(默认 https://openapi.alipay.com/gateway.do)、ALIPAY_NOTIFY_URL、ALIPAY_PRO_AMOUNT(元, 默认 9.90)。
import crypto from 'node:crypto';
import { resolveKey, encodeOrderId, decodeOrderId } from './util.js';
import type { PaymentProvider, CheckoutInput, CheckoutResult, PaymentEvent } from './types.js';

export class AlipayProvider implements PaymentProvider {
  name = 'alipay' as const;
  private appId = process.env.ALIPAY_APP_ID || '';
  private privateKey = resolveKey(process.env.ALIPAY_PRIVATE_KEY || '');
  private publicKey = resolveKey(process.env.ALIPAY_PUBLIC_KEY || '');
  private gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';
  private notifyUrl = process.env.ALIPAY_NOTIFY_URL || '';
  private amount = process.env.ALIPAY_PRO_AMOUNT || '9.90';

  configured(): boolean {
    return !!(this.appId && this.privateKey && this.publicKey);
  }

  private buildParams(input: CheckoutInput): Record<string, string> {
    const biz = {
      out_trade_no: encodeOrderId(input.userId),
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: this.amount,
      subject: 'Global Persons Hub · Pro',
      body: 'Pro subscription',
    };
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' '); // 2026-07-25 09:12:48 (UTC)
    return {
      app_id: this.appId,
      method: 'alipay.trade.page.pay',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: ts,
      version: '1.0',
      notify_url: this.notifyUrl,
      return_url: `${input.origin}/${input.lang}/account?pay=success`,
      biz_content: JSON.stringify(biz),
    };
  }

  /** RSA2 签名：待签参数按 key 升序、k=v& 拼接（不编码）后用商户私钥 SHA256withRSA。 */
  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params)
      .filter((k) => params[k] !== '' && k !== 'sign' && k !== 'sign_type')
      .sort();
    const raw = sorted.map((k) => `${k}=${params[k]}`).join('&');
    return crypto.createSign('RSA-SHA256').update(raw, 'utf8').sign(this.privateKey as string, 'base64');
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const params = this.buildParams(input);
    params.sign = this.sign(params);
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return { provider: 'alipay', url: `${this.gateway}?${query}` };
  }

  async verifyWebhook(
    rawBody: string,
    _headers: Record<string, string | undefined>
  ): Promise<PaymentEvent | null> {
    const params: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => (params[k] = v));
    const sign = params.sign;
    if (!sign || !this.publicKey) return null;

    const sorted = Object.keys(params)
      .filter((k) => params[k] !== '' && k !== 'sign' && k !== 'sign_type')
      .sort();
    const raw = sorted.map((k) => `${k}=${params[k]}`).join('&');
    const ok = crypto
      .createVerify('RSA-SHA256')
      .update(raw, 'utf8')
      .verify(this.publicKey as string, Buffer.from(sign, 'base64'));
    if (!ok) return null;
    if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') return null;

    const userId = decodeOrderId(params.out_trade_no || '');
    if (!userId) return null;
    return { provider: 'alipay', id: params.trade_no || '', userId, plan: 'pro' };
  }
}
