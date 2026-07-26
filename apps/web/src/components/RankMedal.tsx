'use client';

/**
 * 名次徽章：第 1 金 / 第 2 银 / 第 3 铜 / 其余灰。
 * 调用方可通过 className 叠加定位（如领域页 TOP3 的 absolute -top-3 -left-2）。
 */
export default function RankMedal({ rank, className }: { rank: number; className?: string }) {
  const color =
    rank === 1
      ? 'bg-amber-500'
      : rank === 2
        ? 'bg-slate-400'
        : rank === 3
          ? 'bg-orange-700'
          : 'bg-slate-200 text-slate-600';
  return (
    <span
      className={`flex-none h-8 w-8 rounded-full text-white text-sm font-bold flex items-center justify-center ${color} ${className ?? ''}`}
    >
      {rank}
    </span>
  );
}
