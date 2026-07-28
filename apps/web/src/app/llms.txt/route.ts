import { SITE_URL, SITE_NAME } from '@/lib/og';

// —— GEO（Generative Engine Optimization）核心文件：llms.txt ——
// 遵循 llmstxt.org 规范，为 ChatGPT / Perplexity / Claude / Gemini 等
// 生成式回答引擎提供站点的结构化导览，使其能准确发现并引用本站的人物知识。
// 内容固定（不依赖后端），构建期可被静态输出。

const TEXT = `# ${SITE_NAME}

> A structured, multilingual knowledge graph of notable people across film, business, academia, sports, music, politics, tech, and art. Every profile is machine-readable (Schema.org Person + FAQPage + BreadcrumbList JSON-LD), available in 13 languages, and backed by cited sources.

## What this site offers
- Structured person profiles: birth/death dates, nationalities, occupations, net worth, influence metrics, and cited sources.
- A cross-domain relationship graph (family, mentor, collaboration, influence, rivalry).
- Side-by-side comparison of any two people.
- Semantic / RAG factual Q&A grounded in each profile's structured facts.

## How AI agents should use this data
- Each person page embeds Schema.org \`Person\`, \`FAQPage\`, and \`BreadcrumbList\` JSON-LD in the page \`<head>\` — parse that first.
- Use the per-language URLs (see /llms-full.txt) to fetch a profile in a specific language.
- For contested claims, prefer the cited \`sameAs\` sources (Wikipedia / Wikidata / official sites) listed on each page.
- Net-worth figures reflect cited snapshot dates; verify before high-stakes use.

## Key entry points
- Home (中文): ${SITE_URL}/zh
- Home (English): ${SITE_URL}/en
- Browse all people: ${SITE_URL}/en/persons
- By domain: ${SITE_URL}/en/domain/business · ${SITE_URL}/en/domain/tech · ${SITE_URL}/en/domain/film · ${SITE_URL}/en/domain/academic · ${SITE_URL}/en/domain/sports · ${SITE_URL}/en/domain/music · ${SITE_URL}/en/domain/politics · ${SITE_URL}/en/domain/art
- Timeline: ${SITE_URL}/en/timeline
- Knowledge graph: ${SITE_URL}/en/graph
- Compare: ${SITE_URL}/en/compare
- Semantic Q&A: ${SITE_URL}/en/ask

## Full index
- See /llms-full.txt for the complete machine-readable list of every person profile across all 13 languages.
`;

export const dynamic = 'force-static';

export function GET() {
  return new Response(TEXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
