import Link from 'next/link';
import { headers } from 'next/headers';
import BoundaryCard, { btnPrimary, btnGhost } from '@/components/BoundaryCard';
import { isLang, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

/**
 * 根级 404：命中未定义路由（含 /[lang]/* 内部 notFound 冒泡上来的情况）时展示。
 *
 * 语种取自中间件注入的请求头 x-lang（见 src/middleware.ts）：
 * Next 在 notFound() 时把根 not-found 渲染进 body 的 notFound 边界，
 * 因此这里必须服务端本地化，用户首屏（SSR）就能看到正确语种，而非英文闪屏。
 * 完全无语种线索（如 /random）时回退英文。
 */
export default async function RootNotFound() {
  const h = await headers();
  const raw = h.get('x-lang');
  const lang: Lang = raw && isLang(raw) ? raw : 'en';

  return (
    <BoundaryCard
      icon="🔍"
      title={t(lang, 'nf.title')}
      desc={t(lang, 'nf.desc')}
      actions={
        <>
          <Link href={`/${lang}`} className={btnPrimary}>
            {t(lang, 'err.backHome')}
          </Link>
          <Link href={`/${lang}/search`} className={btnGhost}>
            {t(lang, 'nf.gotoSearch')}
          </Link>
        </>
      }
    />
  );
}
