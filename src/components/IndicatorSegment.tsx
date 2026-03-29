import React from 'react';
import { cn } from '../lib/utils';

interface SegmentProps {
  label: string;
  value: string;
  options: string[]; // 例如 ["无", "普通", "多"]
}

export default function IndicatorSegment({ label, value, options }: SegmentProps) {
  const isPending = value === '待补充';

  // 颜色映射逻辑
  const getActiveColor = (val: string) => {
    if (val === '多' || val === '严格') return 'bg-rose-500 text-white shadow-sm';
    if (val === '普通') return 'bg-blue-500 text-white shadow-sm';
    if (val === '无' || val === '宽容') return 'bg-emerald-500 text-white shadow-sm';
    return 'bg-gray-200 text-gray-500';
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="w-16 sm:w-20 shrink-0 text-[8px] sm:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tight">
        {label.split(' ')[0]}
      </div>
      <div className={cn(
        "flex-1 grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 rounded-lg transition-all",
        isPending 
          ? "border border-dashed border-gray-200 dark:border-gray-700 bg-transparent" 
          : "bg-gray-100 dark:bg-gray-700/30"
      )}>
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <div
              key={opt}
              className={cn(
                "py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold text-center rounded-md transition-all duration-300",
                isActive ? getActiveColor(opt) : "text-gray-400 dark:text-gray-500",
                isPending && "text-gray-300 dark:text-gray-600"
              )}
            >
              {isPending ? '-' : opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}
