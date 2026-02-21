"use client";

import type { Transaction } from "@/lib/types";

interface SpendingChartProps {
  transactions: Transaction[];
}

export function SpendingChart({ transactions }: SpendingChartProps) {
  // Group completed transactions by day for the last 7 days
  const days: { label: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("en-US", { weekday: "short" });
    const total = transactions
      .filter(
        (t) => t.status === "completed" && t.created_at.slice(0, 10) === key,
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);
    days.push({ label, total });
  }

  const maxTotal = Math.max(...days.map((d) => d.total), 1);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 tracking-tight">Last 7 Days</h2>
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6">
        <div className="flex items-end gap-3 h-36">
          {days.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-28">
                <div
                  className="w-full max-w-8 bg-[#0071e3] rounded-lg transition-all"
                  style={{
                    height: `${Math.max((day.total / maxTotal) * 100, day.total > 0 ? 4 : 0)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-[#86868b] font-medium">{day.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
