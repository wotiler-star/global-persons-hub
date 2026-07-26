'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

export default function SearchBar({ lang, initial = '' }: { lang: Lang; initial?: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/${lang}/search?q=${encodeURIComponent(q)}`);
      }}
      className="flex gap-2"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(lang, 'common.searchPlaceholder')}
        className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <button className="px-4 py-2 rounded bg-brand text-white font-medium">{t(lang, 'search.go')}</button>
    </form>
  );
}
