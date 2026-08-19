"use client";

import { useMemo, useRef, useState } from "react";

import { columnPath, labelIndices, niceScale } from "./chart-utils";
import { useElementWidth } from "./use-element-width";
import { formatDateWithWeekday, formatDateShort } from "@/lib/date-range";
import { type CurrencyCode, formatMoney, fromMinor } from "@/lib/money";

const HEIGHT = 268;
const PADDING = { top: 18, right: 20, bottom: 26, left: 64 };
const MAX_BAR_WIDTH = 24;
/** The surface gap that separates the two touching columns in a group. */
const GROUP_GAP = 2;

export interface RevenueExpensePoint {
  date: string;
  revenue: number;
  expenses: number;
}

/**
 * Revenue against total cost, one grouped pair per day, on a single axis. The
 * height difference between the two columns is the day's profit.
 */
export function RevenueVsExpenses({
  points,
  currency = "USD",
}: {
  points: RevenueExpensePoint[];
  currency?: CurrencyCode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const innerWidth = Math.max(120, width - PADDING.left - PADDING.right);
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const scale = niceScale(
      points.flatMap((point) => [point.revenue, point.expenses]),
      4,
    );
    const span = scale.max - scale.min || 1;
    const band = innerWidth / points.length;
    const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, (band - GROUP_GAP) / 2 - 2));

    const y = (value: number) =>
      PADDING.top + innerHeight - ((value - scale.min) / span) * innerHeight;
    const bandStart = (index: number) => PADDING.left + index * band;

    return { scale, span, band, barWidth, y, bandStart, baseline: y(0) };
  }, [points, innerWidth, innerHeight]);

  if (!geometry || points.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex h-[268px] items-center justify-center text-[13px] text-ink-muted"
      >
        No data in this period.
      </div>
    );
  }

  const { scale, band, barWidth, y, bandStart, baseline } = geometry;
  const lastIndex = points.length - 1;
  const active = hoverIndex === null ? null : points[hoverIndex];
  const xLabels = labelIndices(points.length, Math.max(2, Math.min(7, Math.floor(innerWidth / 90))));

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left - PADDING.left;
    const index = Math.floor(offset / band);
    setHoverIndex(index >= 0 && index <= lastIndex ? index : null);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="mb-3 flex items-center gap-4">
        <LegendKey color="var(--series-revenue)" label="Revenue" />
        <LegendKey color="var(--series-expense)" label="Total costs" />
      </div>

      <svg
        role="img"
        aria-label={`Daily revenue compared with total costs from ${points[0].date} to ${points[lastIndex].date}. The same values appear in the daily profit and loss table below.`}
        width={width}
        height={HEIGHT}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
        className="touch-none"
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? "var(--border-strong)" : "var(--grid)"}
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={PADDING.left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              className="tabular fill-[var(--ink-muted)] text-[11px]"
            >
              {formatMoney(fromMinor(tick), currency, { compact: true })}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const groupWidth = barWidth * 2 + GROUP_GAP;
          const left = bandStart(index) + (band - groupWidth) / 2;
          const revenueTop = y(point.revenue);
          const expenseTop = y(point.expenses);
          const isActive = hoverIndex === index;

          return (
            <g key={point.date} opacity={hoverIndex === null || isActive ? 1 : 0.55}>
              <path
                d={columnPath(left, revenueTop, barWidth, Math.max(0, baseline - revenueTop))}
                fill="var(--series-revenue)"
              />
              <path
                d={columnPath(
                  left + barWidth + GROUP_GAP,
                  expenseTop,
                  barWidth,
                  Math.max(0, baseline - expenseTop),
                )}
                fill="var(--series-expense)"
              />
            </g>
          );
        })}

        {xLabels.map((index) => (
          <text
            key={index}
            x={bandStart(index) + band / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="tabular fill-[var(--ink-muted)] text-[11px]"
          >
            {formatDateShort(points[index].date)}
          </text>
        ))}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-2 shadow-[0_4px_14px_rgba(16,16,18,0.10)]"
          style={{
            left: Math.min(Math.max(bandStart(hoverIndex ?? 0) + band / 2, 84), width - 84),
            top: 24,
          }}
        >
          <div className="mb-1 text-[11px] text-ink-muted">{formatDateWithWeekday(active.date)}</div>
          <TooltipRow color="var(--series-revenue)" label="Revenue" value={active.revenue} currency={currency} />
          <TooltipRow color="var(--series-expense)" label="Total costs" value={active.expenses} currency={currency} />
          <TooltipRow
            color="transparent"
            label="Net profit"
            value={active.revenue - active.expenses}
            currency={currency}
            emphasized
          />
        </div>
      ) : null}
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function TooltipRow({
  color,
  label,
  value,
  currency,
  emphasized = false,
}: {
  color: string;
  label: string;
  value: number;
  currency: CurrencyCode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 ${emphasized ? "mt-1 border-t border-line pt-1" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span
          aria-hidden
          className="h-0.5 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="tabular text-[12.5px] font-semibold text-ink">
        {formatMoney(fromMinor(value), currency)}
      </span>
    </div>
  );
}
