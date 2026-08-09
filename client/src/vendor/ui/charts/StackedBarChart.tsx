/* StackedBarChart — one stacked bar per bucket (e.g. per week) on Recharts. */
import React from "react";
import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export interface StackedBarSeries {
  key: string;
  color: string;
  label: string;
}

export interface StackedBarBucket {
  label: string;
  values: Record<string, number>;
}

export function StackedBarChart({
  weeks,
  series,
  h = 200,
}: {
  weeks: StackedBarBucket[];
  series: StackedBarSeries[];
  h?: number;
}) {
  const rows = weeks.map((w) => ({ label: w.label, ...w.values }));
  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -10 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
