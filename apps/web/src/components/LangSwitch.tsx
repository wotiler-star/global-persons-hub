'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LANGS, LANG_LABELS } from '@/lib/i18n';

export default function LangSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const current = (pathname?.split('/')[1] || 'zh') as string;

  function switchTo(lang: string) {
    const parts = (pathname || '/').split('/');
    if (parts[1] && (LANGS as string[]).includes(parts[1])) parts[1] = lang;
    else parts.splice(1, 0, lang);
    const next = parts.join('/') || `/${lang}`;
    router.push(next);
  }

  return (
    <select
      aria-label="切换语言"
      value={current}
      onChange={(e) => switchTo(e.target.value)}
      className="border rounded px-2 py-1 text-sm bg-white text-slate-700"
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
