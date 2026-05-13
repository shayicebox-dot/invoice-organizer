"use client";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const ACCENT = "#3ddc97";
const ACCENT_SOFT = "rgba(61,220,151,0.15)";
const MUTED = "#6b6b75";

type Row = { date: string; revenue?: number; netProfit?: number; adSpend?: number };

const TooltipBox = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-card px-3 py-2 text-xs shadow-card">
      <div className="mb-1 text-ink-dim">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="ml-auto tabular-nums text-ink">
            ${Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

export function RevenueProfitChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g-rev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-prof" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1f1f25" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} stroke={MUTED} />
        <YAxis tickLine={false} axisLine={false} stroke={MUTED} tickFormatter={(v) => `$${v / 1000}k`} />
        <Tooltip content={<TooltipBox />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#g-rev)"
        />
        <Area
          type="monotone"
          dataKey="netProfit"
          name="Net profit"
          stroke="#a78bfa"
          strokeWidth={2}
          fill="url(#g-prof)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AdSpendChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1f1f25" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} stroke={MUTED} />
        <YAxis tickLine={false} axisLine={false} stroke={MUTED} tickFormatter={(v) => `$${v / 1000}k`} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: ACCENT_SOFT }} />
        <Bar dataKey="adSpend" name="Ad spend" fill={ACCENT} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
