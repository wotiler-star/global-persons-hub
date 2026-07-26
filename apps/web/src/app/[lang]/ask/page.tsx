import AskClient from '@/components/AskClient';
import type { Lang } from '@/lib/i18n';

export default async function AskPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  return <AskClient lang={lang as Lang} initial={sp.q || ''} />;
}
