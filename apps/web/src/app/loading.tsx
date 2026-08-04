/** 根级加载态：根 `/` 重定向与非语种路由切换时的占位，避免白屏闪烁。 */
export default function RootLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
    </div>
  );
}
