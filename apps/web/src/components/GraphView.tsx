import { pickText, type Lang } from '@/lib/i18n';

export default function GraphView({
  person,
  relations,
  lang
}: {
  person: any;
  relations: any[];
  lang: Lang;
}) {
  const nodes = relations.filter((r) => r.targetName);
  const cx = 300;
  const cy = 200;
  const R = 140;
  return (
    <svg viewBox="0 0 600 400" className="w-full bg-slate-50 rounded-xl border">
      <circle cx={cx} cy={cy} r={38} fill="#3b5bdb" />
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize="12">
        {pickText(person.names, lang)?.slice(0, 10)}
      </text>
      {nodes.map((r, i) => {
        const a = (Math.PI * 2 * i) / Math.max(nodes.length, 1);
        const x = cx + R * Math.cos(a);
        const y = cy + R * Math.sin(a);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={1.5} />
            <circle cx={x} cy={y} r={28} fill="#e0e7ff" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="9" fill="#334155">
              {pickText(r.targetName, lang)?.slice(0, 10)}
            </text>
          </g>
        );
      })}
      {nodes.length === 0 && (
        <text x={cx} y={cy + R + 40} textAnchor="middle" fontSize="12" fill="#94a3b8">
          暂无已记录的关系
        </text>
      )}
    </svg>
  );
}
