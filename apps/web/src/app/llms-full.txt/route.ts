import { SITE_URL, SITE_NAME } from '@/lib/og';
import { apiGet } from '@/lib/api';
import { LANGS, pickText } from '@/lib/i18n';

// —— GEO 全量索引：llms-full.txt ——
// 机器可读地列出全站每一位人物的全部语种 URL，供 AI Agent 按需抓取。
// 依赖后端人物数据，走 ISR（5 分钟）缓存，新增人物自动入册。

export const revalidate = 300;

function buildIndex(items: any[]): string {
  const langLine = LANGS.join(', ');
  const people = items
    .map((p) => {
      const name = pickText(p.names, 'en') || p.slug;
      const slug = p.slug;
      const domains = (p.domains || []).join(', ');
      return `- ${name} (slug: ${slug}${domains ? ` · ${domains}` : ''}) — ${SITE_URL}/en/person/${slug}`;
    })
    .join('\n');

  return `# ${SITE_NAME} — Full Index

URL pattern for every profile: \`${SITE_URL}/{lang}/person/{slug}\`
Language codes: ${langLine}

## Key entry points
- Browse all: ${SITE_URL}/en/persons
- By domain: ${SITE_URL}/en/domain/business · ${SITE_URL}/en/domain/tech · ${SITE_URL}/en/domain/film · ${SITE_URL}/en/domain/academic · ${SITE_URL}/en/domain/sports · ${SITE_URL}/en/domain/music · ${SITE_URL}/en/domain/politics · ${SITE_URL}/en/domain/art
- Timeline: ${SITE_URL}/en/timeline
- Graph: ${SITE_URL}/en/graph
- Compare: ${SITE_URL}/en/compare
- Q&A: ${SITE_URL}/en/ask

## People (${items.length})
${people}
`;
}

export async function GET() {
  let body: string;
  try {
    const d = await apiGet('/persons?pageSize=2000');
    body = buildIndex(d.items || []);
  } catch {
    body = `# ${SITE_NAME} — Full Index\n\nPerson data is temporarily unavailable. See ${SITE_URL}/llms.txt for guidance.\n`;
  }
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
