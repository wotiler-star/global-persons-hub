// 微信支付（零依赖：v3 API 用 fetch + RSA-SHA256 签名，Webhook 用 RSA 验签 + AES-256-GCM 解密）。
// 环境变量：WECHAT_MCH_ID、WECHAT_APP_ID、WECHAT_API_KEY(APIv3密钥)、WECHAT_SERIAL(商户证书序列号)、
//           WECHAT_PRIVATE_KEY(商户私钥 PEM，可用 file:// 前缀读文件)、WECHAT_PLATFORM_PUBLIC_KEY(平台证书 PEM)、
//           WECHAT_NOTIFY_URL、WECHAT_PRO_AMOUNT(分，默认 900)。
import crypto from 'node:crypto';
import { resolveKey, encodeOrderId, decodeOrderId } from './util.js';
import type { PaymentProvider, CheckoutInput, CheckoutResult, PaymentEvent } from './types.js';

export class WechatProvider implements PaymentProvider {
  name = 'wechat' as const;
  private mchId = process.env.WECHAT_MCH_ID || '';
  private appId = process.env.WECHAT_APP_ID || '';
  private apiKey = process.env.WECHAT_API_KEY || '';
  private serial = process.env.WECHAT_SERIAL || '';
  private privateKey = resolveKey(process.env.WECHAT_PRIVATE_KEY || '');
  private platformPub = resolveKey(process.env.WECHAT_PLATFORM_PUBLIC_KEY || '');
  private notifyUrl = process.env.WECHAT_NOTIFY_URL || '';
  private amount = Number(process.env.WECHAT_PRO_AMOUNT || '900');

  configured(): boolean {
    return !!(this.mchId && this.appId && this.apiKey && this.privateKey);
  }

  /** v3 请求签名：METHOD\nURI\nTIMESTAMP\nNONCE\nBODY\n 用商户私钥 RSA-SHA256。 */
  private sign(method: string, uri: string, timestamp: string, nonce: string, body: string): string {
    const msg = `${method}\n${uri}\n${timestamp}\n${nonce}\n${body}\n`;
    return crypto.createSign('RSA-SHA256').update(msg).sign(this.privateKey as string, 'base64');
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const uri = '/v3/pay/transactions/native';
    const bodyObj = {
      mchid: this.mchId,
      appid: this.appId,
      description: 'Global Persons Hub · Pro',
      out_trade_no: encodeOrderId(input.userId),
      notify_url: this.notifyUrl,
      amount: { total: this.amount, currency: 'CNY' },
    };
    const body = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = this.sign('POST', uri, timestamp, nonce, body);
    const auth =
      `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",` +
      `signature="${signature}",timestamp="${timestamp}",serial_no="${this.serial}"`;

    const res = await fetch(`https://api.mch.weixin.qq.com${uri}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`微信支付下单失败 ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return { provider: 'wechat', qr: json.code_url };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<PaymentEvent | null> {
    const ts = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const sig = headers['wechatpay-signature'];
    if (!ts || !nonce || !sig || !this.platformPub) return null;

    // 1) 验签：TIMESTAMP\nNONCE\nCIPHERTEXT\n 用平台证书 RSA-SHA256
    const msg = `${ts}\n${nonce}\n${rawBody}\n`;
    const ok = crypto
      .createVerify('RSA-SHA256')
      .update(msg)
      .verify(this.platformPub as string, Buffer.from(sig, 'base64'));
    if (!ok) return null;

    // 2) 解密 resource（AES-256-GCM，密钥=APIv3，nonce，aad=associated_data，tag 附在密文末尾 16 字节）
    const payload = JSON.parse(rawBody) as any;
    const resource = payload.resource;
    if (!resource) return null;
    const full = Buffer.from(resource.ciphertext, 'base64');
    const authTag = full.subarray(full.length - 16);
    const data = full.subarray(0, full.length - 16);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.apiKey, 'utf8'),
      Buffer.from(resource.nonce, 'base64')
    );
    decipher.setAuthTag(authTag);
    if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const dataObj = JSON.parse(decrypted);

    const userId = decodeOrderId(dataObj.out_trade_no);
    if (!userId) return null;
    return { provider: 'wechat', id: dataObj.transaction_id, userId, plan: 'pro' };
  }
}
