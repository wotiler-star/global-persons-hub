'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerUser, loginUser } from '@/lib/api';
import { t } from '@/lib/ui';

export default function Register({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = use(params);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await registerUser({ name, email, password: pwd });
      // 注册成功后直接登录
      await loginUser({ email, password: pwd });
      router.push(`/${lang}/account`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-10 border rounded-xl p-6 bg-white">
      <h1 className="text-xl font-bold mb-4">{t(lang, 'register.title')}</h1>
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder={t(lang, 'register.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder={t(lang, 'login.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full border rounded px-3 py-2"
          placeholder={t(lang, 'login.password')}
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        <button className="w-full bg-brand text-white rounded py-2">{t(lang, 'register.submit')}</button>
      </form>
      <p className="text-sm mt-3 text-slate-500">
        {t(lang, 'register.hasAccount')}
        <a className="text-brand" href={`/${lang}/login`}>
          {t(lang, 'register.loginLink')}
        </a>
      </p>
    </div>
  );
}
