/**
 * 语种段加载骨架：ISR 首访 / 未预渲染 slug 按需生成时，先渲染骨架而不是空白。
 * 纯静态标记，不引入客户端 JS，对 LCP 与感知性能都友好。
 */
export default function LangLoading() {
  return (
    <div className="animate-pulse py-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-1/3 rounded-lg bg-slate-200" />
      <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />

      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-slate-200" />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-slate-200" />
              <div className="flex-1">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
              </div>
            </div>
            <div className="mt-4 h-3 w-full rounded bg-slate-100" />
            <div className="mt-2 h-3 w-4/5 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
