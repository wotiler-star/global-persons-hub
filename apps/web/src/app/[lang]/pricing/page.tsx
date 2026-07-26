'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, subscribe, getMe } from '@/lib/api';
import { t } from '@/lib/ui';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '¥0',
    features: ['1,000 次 API 调用 / 月', '全领域人物检索', '语义搜索 + RAG 问答', '社区评论']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '¥99 / 月',
    features: ['50,000 次 API 调用 / 月', '更高并发与优先级', '图片上传与图集', '专家背书加速通道', '社区徽章']
  }
];

const CHANNELS: { id: 'stripe' | 'wechat' | 'alipay'; label: string }[] = [
  { id: 'stripe', label: 'payment.stripe' },
  { id: 'wechat', label: 'payment.wechat' },
  { id: 'alipay', label: 'payment.alipay' }
];

export default function Pricing({ params }: { params: Promise<{ lang: string }> }) {
  const router = useRouter();
  const { lang } = use(params);
  const [msg, setMsg] = useState('');
  const [method, setMethod] = useState<'stripe' | 'wechat' | 'alipay'>('stripe');
  const [qr, setQr] = useState<string | null>(null);
  const [qrImgOk, setQrImgOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 微信 Native 扫码支付：轮询 /me 检测 Webhook 驱动套餐升级，成功后自动刷新。
  useEffect(() => {
    if (!qr) return;
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      try {
        const me = await getMe();
        if (me.plan === 'pro') {
          if (pollRef.current) clearInterval(pollRef.current);
          setQr(null);
          setMsg(t(lang, 'payment.done'));
          router.refresh();
          return;
        }
      } catch {
        /* 忽略轮询错误，继续等待 */
      }
      if (tries >= 40) {
        if (pollRef.current) clearInterval(pollRef.current);
        setMsg(t(lang, 'payment.qrTimeout'));
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qr, lang, router]);

  async function choose(id: 'free' | 'pro') {
    if (!getToken()) {
      router.push(`/${lang}/login`);
      return;
    }
    setBusy(true);
    setMsg('');
    setQr(null);
    setQrImgOk(true);
    try {
      const res = await subscribe(id, id === 'pro' ? method : undefined, lang);
      if (res.url) {
        // Stripe / 支付宝：前端跳转支付网关
        setMsg(t(lang, 'payment.redirect'));
        window.location.href = res.url;
        return;
      }
      if (res.qr) {
        // 微信 Native：展示扫码
        setQr(res.qr);
        setMsg(t(lang, 'payment.scan'));
        return;
      }
      // mock / 直接生效
      setQr(null);
      setMsg(t(lang, 'payment.done'));
      router.refresh();
    } catch (e: any) {
      setMsg(e.message || t(lang, 'common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-center">
        {t(lang, 'pricing.title')}
      </h1>
      <p className="text-center text-slate-500 mb-8">
        {t(lang, 'pricing.subtitle')}
      </p>

      {msg && <p className="text-center text-accent mb-4">{msg}</p>}

      {qr && (
        <div className="max-w-sm mx-auto mb-8 p-4 border rounded-2xl bg-white text-center">
          {qrImgOk && (
            // 第三方二维码服务仅用于本地预览；离线时下方 code_url 仍为可复制文本
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr)}`}
              alt="wechat qr"
              className="mx-auto mb-2"
              onError={() => setQrImgOk(false)}
            />
          )}
          <p className="text-sm text-slate-500 break-all">{qr}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((p) => (
          <div key={p.id} className="border rounded-2xl p-6 bg-white flex flex-col">
            <h2 className="text-xl font-bold">{p.id === 'pro' ? t(lang, 'pricing.pro') : t(lang, 'pricing.free')}</h2>
            <div className="text-2xl font-bold text-brand my-2">{p.price}</div>
            <ul className="space-y-2 text-sm text-slate-600 flex-1">
              {p.features.map((f, i) => (
                <li key={i}>✓ {f}</li>
              ))}
            </ul>

            {p.id === 'pro' && (
              <div className="mt-4">
                <div className="text-xs text-slate-400 mb-1">{t(lang, 'payment.method')}</div>
                <div className="flex gap-2 mb-3">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setMethod(c.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        method === c.id ? 'bg-brand text-white border-brand' : 'border-slate-300'
                      }`}
                    >
                      {t(lang, c.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="mt-3 bg-brand text-white rounded px-4 py-2 disabled:opacity-50"
              onClick={() => choose(p.id as 'free' | 'pro')}
              disabled={busy}
            >
              {busy
                ? t(lang, 'common.busy')
                : p.id === 'pro'
                  ? t(lang, 'pricing.upgrade')
                  : t(lang, 'pricing.useFree')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
