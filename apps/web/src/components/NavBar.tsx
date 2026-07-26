'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import LangSwitch from './LangSwitch';

// <html lang> 期望的 BCP-47 代码（zh 用 zh-CN）
const HTML_LANG: Record<Lang, string> = {
  zh: 'zh-CN', en: 'en', es: 'es', fr: 'fr', ja: 'ja', ru: 'ru',
  ar: 'ar', pt: 'pt', de: 'de', ko: 'ko', it: 'it', hi: 'hi', id: 'id'
};

export default function NavBar() {
  const pathname = usePathname() || '/';
  const seg = pathname.split('/')[1];
  const lang: Lang = (LANGS as string[]).includes(seg) ? (seg as Lang) : 'zh';

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang] || lang;
  }, [lang]);

  // 审核(admin) 与 登录/注册/账户 等已统一移入 /[lang]，根作用域仅留兼容重定向
  const links = [
    { href: `/${lang}`, label: t(lang, 'nav.home') },
    { href: `/${lang}/search`, label: t(lang, 'nav.search') },
    { href: `/${lang}/persons`, label: t(lang, 'nav.persons') },
    { href: `/${lang}/graph`, label: t(lang, 'nav.graph') },
    { href: `/${lang}/ask`, label: t(lang, 'nav.ask') },
    { href: `/${lang}/pricing`, label: t(lang, 'nav.pricing') },
    { href: `/${lang}/admin`, label: t(lang, 'nav.admin') },
    { href: `/${lang}/account`, label: t(lang, 'nav.account') },
    { href: `/${lang}/login`, label: t(lang, 'nav.login') },
    { href: `/${lang}/register`, label: t(lang, 'nav.register') }
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b">
      <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Link href={`/${lang}`} className="font-bold text-brand">
          {t(lang, 'brand')}
        </Link>
        {links.slice(0, 6).map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-slate-600 hover:text-brand">
            {l.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {links.slice(4).map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-600 hover:text-brand">
              {l.label}
            </Link>
          ))}
          <LangSwitch />
        </div>
      </nav>
    </header>
  );
}
