import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import PersonCard from '@/components/PersonCard';

/**
 * 「历史上的今天」服务端组件（零客户端 JS）：
 * - 按服务器当天「月-日」匹配人物生日（birth）与忌日（death），支持公元前负数年份 ISO（如 -055-09-28）。
 * - 双命中都展示：生于今天 / 逝于今天 两组徽章分区。
 * - 无任何命中时兜底：按日期哈希做**确定性每日轮换精选**（同一天全语种一致、次日自动更换）。
 */

type AnyPerson = Record<string, any>;

/** 从 ISO 串提取 MM-DD（容忍公元前负数年份），无法解析返回 null */
function monthDay(iso?: string | null): string | null {
  if (!iso) return null;
  const m = String(iso).match(/^-?\d+-(\d\d)-(\d\d)/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** 提取年份（含公元前负数），无法解析返回 null */
function yearOf(iso?: string | null): number | null {
  if (!iso) return null;
  const m = String(iso).match(/^(-?\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

function yearLabel(y: number | null): string {
  if (y === null) return '';
  return y < 0 ? `${-y} BCE` : String(y);
}

export default function TodayInHistory({
  persons,
  lang
}: {
  persons: AnyPerson[];
  lang: Lang;
}) {
  if (!persons.length) return null;

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayMD = `${mm}-${dd}`;

  const born = persons.filter((p) => monthDay(p.birth) === todayMD);
  const died = persons.filter((p) => monthDay(p.death) === todayMD);

  // 本地化日期标题（如「7月27日」/ "July 27"），13 语 Lang 码均为合法 BCP47
  let dateLabel = `${mm}-${dd}`;
  try {
    dateLabel = new Intl.DateTimeFormat(lang, { month: 'long', day: 'numeric' }).format(now);
  } catch {
    /* 极端环境下回退 MM-DD */
  }

  // 无命中 → 确定性每日精选：按 slug 稳定排序后用日期种子取 4 位（同日恒定、跨语种一致）
  let featured: AnyPerson[] = [];
  if (born.length === 0 && died.length === 0) {
    const sorted = [...persons].sort((a, b) =>
      String(a.slug || a.id).localeCompare(String(b.slug || b.id))
    );
    const seed =
      now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
    const n = sorted.length;
    const count = Math.min(4, n);
    const step = Math.max(1, Math.floor(n / count));
    const picked = new Set<number>();
    for (let i = 0; i < count; i++) {
      let idx = (seed + i * step) % n;
      while (picked.has(idx)) idx = (idx + 1) % n;
      picked.add(idx);
      featured.push(sorted[idx]);
    }
  }

  const Group = ({
    label,
    color,
    list,
    yearsOf
  }: {
    label: string;
    color: string;
    list: AnyPerson[];
    yearsOf: (p: AnyPerson) => number | null;
  }) => (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
        <span className="text-xs text-slate-400">
          {list
            .map((p) => yearLabel(yearsOf(p)))
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {list.map((p) => (
          <PersonCard key={p.id} person={p as any} lang={lang} />
        ))}
      </div>
    </div>
  );

  return (
    <section className="mb-10">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-xl font-semibold">{t(lang, 'today.title')}</h2>
        <span className="text-sm text-slate-500">{dateLabel}</span>
      </div>

      {born.length > 0 && (
        <Group
          label={t(lang, 'today.bornOn')}
          color="bg-emerald-100 text-emerald-700"
          list={born}
          yearsOf={(p) => yearOf(p.birth)}
        />
      )}
      {died.length > 0 && (
        <Group
          label={t(lang, 'today.diedOn')}
          color="bg-slate-200 text-slate-600"
          list={died}
          yearsOf={(p) => yearOf(p.death)}
        />
      )}

      {featured.length > 0 && (
        <div className="mt-2">
          <p className="text-sm text-slate-500 mb-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 mr-2">
              {t(lang, 'today.featured')}
            </span>
            {t(lang, 'today.hint')}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map((p) => (
              <PersonCard key={p.id} person={p as any} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
