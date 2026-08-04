import type { MetadataRoute } from 'next';
import { getAllPersons } from '@/lib/api';
import { LANGS } from '@/lib/i18n';
import { DOMAIN_LABELS } from '@gph/types';

// SEO（国际版）：为每条 URL 生成 13 语 hreflang 交替链接 + x-default（指向英文），
// 让 Google/Bing 等按用户语言与地区返回正确版本，避免重复内容惩罚。
function altFor(path: string): { languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}${path}`;
  languages['x-default'] = `/en${path}`;
  return { languages };
}

// SEO：为所有人物生成多语种 URL，便于搜索引擎全面收录
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const urls: MetadataRoute.Sitemap = [];
  for (const l of LANGS) {
    urls.push({
      url: `${base}/${l}`,
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: altFor('')
    });
    urls.push({
      url: `${base}/${l}/persons`,
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: altFor('/persons')
    });
    urls.push({
      url: `${base}/${l}/timeline`,
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: altFor('/timeline')
    });
    urls.push({
      url: `${base}/${l}/explore`,
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: altFor('/explore')
    });
    urls.push({
      url: `${base}/${l}/library`,
      changeFrequency: 'daily',
      priority: 0.6,
      alternates: altFor('/library')
    });
    urls.push({
      url: `${base}/${l}/gallery`,
      changeFrequency: 'daily',
      priority: 0.6,
      alternates: altFor('/gallery')
    });
    urls.push({
      url: `${base}/${l}/graph`,
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: altFor('/graph')
    });
    urls.push({
      url: `${base}/${l}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: altFor('/pricing')
    });
  }
  // 领域榜单页（SEO 聚合着陆页）——从 DOMAIN_LABELS 动态取全部领域，避免新增领域（如 art/other）漏收录
  const domains = Object.keys(DOMAIN_LABELS);
  for (const l of LANGS) {
    for (const d of domains) {
      urls.push({
        url: `${base}/${l}/domain/${d}`,
        changeFrequency: 'daily',
        priority: 0.7,
        alternates: altFor(`/domain/${d}`)
      });
    }
  }
  try {
    const d = await getAllPersons();
    for (const p of d.items) {
      for (const l of LANGS) {
        urls.push({
          url: `${base}/${l}/person/${p.slug}`,
          changeFrequency: 'weekly',
          priority: 0.6,
          alternates: altFor(`/person/${p.slug}`)
        });
      }
    }
    // 人物对比页（SEO 长尾）：按同领域影响力 TOP 的相邻两两组合生成
    const top = d.items
      .filter((p: any) => p.metrics?.influence)
      .sort((a: any, b: any) => (b.metrics?.influence ?? 0) - (a.metrics?.influence ?? 0))
      .slice(0, 12);
    const pairs = new Set<string>();
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const shared = (top[i].domains || []).some((x: string) => (top[j].domains || []).includes(x));
        if (shared) pairs.add(`${top[i].slug}-vs-${top[j].slug}`);
      }
    }
    for (const pr of [...pairs].slice(0, 30)) {
      const [a, b] = pr.split('-vs-');
      for (const l of LANGS) {
        // 对比页为带查询参数的动态页，不加 hreflang（避免规范化冲突），仅收录英文版
        urls.push({
          url: `${base}/${l}/compare?ids=${a},${b}`,
          changeFrequency: 'weekly',
          priority: 0.5
        });
      }
    }
  } catch {
    /* API 不可达时仅返回语言首页 */
  }
  return urls;
}
