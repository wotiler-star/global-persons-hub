// 输出 Schema.org JSON-LD 结构化数据（SEO / GEO 关键：机器可读、可被 AI 引用）
export default function JsonLd({ data }: { data: any }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
