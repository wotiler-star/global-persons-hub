import { SITE_URL, SITE_NAME } from '@/lib/og';
import { getAllPersons } from '@/lib/api';
import { pickText } from '@/lib/i18n';

// —— GEO / SEO 新鲜度信号：RSS 2.0 订阅源（新收录人物）——
// 供聚合器与 AI 爬虫发现"近期更新"，强化站点活跃度信号。
export const revalidate = 300;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const base = SITE_URL;
  let items: any[] = [];
  try {
    const d = await getAllPersons();
    items = (d.items || []).sort(
      (a: any, b: any) => (b.metrics?.influence ?? 0) - (a.metrics?.influence ?? 0)
    );
  } catch {
    /* 退化为空源 */
  }

  const itemXml = items
    .map((p) => {
      const name = esc(pickText(p.names, 'en') || p.slug);
      const link = `${base}/en/person/${p.slug}`;
      const desc = esc(pickText(p.summary, 'en') || '');
      const pub = new Date().toUTCString();
      return `    <item>
      <title>${name}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${desc}</description>
      <pubDate>${pub}</pubDate>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)} — New Profiles</title>
    <link>${base}/en</link>
    <description>Structured, multilingual profiles of notable people across film, business, academia, sports, music, politics, tech, and art.</description>
    <language>en</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${itemXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
