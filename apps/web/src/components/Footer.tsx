'use client';

import { useLang } from '@/lib/use-lang';
import { t } from '@/lib/ui';

export default function Footer() {
  const lang = useLang();
  return (
    <footer className="border-t mt-12 py-8 text-center text-sm text-slate-500">
      {t(lang, 'footer.tagline')}
    </footer>
  );
}
