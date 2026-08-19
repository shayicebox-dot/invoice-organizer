"use client";

import { useId, useMemo, useRef, useState } from "react";

import { type SeriesPoint, labelIndices, niceScale } from "./chart-utils";
import { useElementWidth } from "./use-element-width";
import { formatDateWithWeekday, formatDateShort } from "@/lib/date-range";
import { type CurrencyCode, formatMoney, fromMinor } from "@/lib/money";

const HEIGHT = 268;
const PADDING = { top: 18, right: 20, bottom: 26, left: 64 };

/**
 * Net Profit per day. One series, so no legend — the card title names it.
 * Days below zero are drawn in the diverging red pole so a loss is visible
 * without reading the axis.
 */
export function NetProfitTrend({
  points,
  currency = "USD",
}: {
  points: SeriesPoint[];
  currency?: CurrencyCode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const clipPositiveId = useId();
  const clipNegativeId = useId();

  const innerWidth = Math.max(120, width - PADDING.left - PADDING.right);
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const scale = niceScale(
      points.map((point) => point.value),
      4,
    );
    const span = scale.max - scale.min || 1;

    const x = (index: number) =>
      points.length === 1
        ? PADDING.left + innerWidth / 2
        : PADDING.left + (index / (points.length - 1)) * innerWidth;
    const y = (value: number) =>
      PADDING.top + innerHeight - ((value - scale.min) / span) * innerHeight;

    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
      .join(" ");

    const zeroY = y(0);
    const area = `${line} L${x(points.length - 1)},${zeroY} L${x(0)},${zeroY} Z`;

    return { scale, x, y, line, area, zeroY };
  }, [points, innerWidth, innerHeight]);

  if (!geometry || points.length === 0) {
    return (
      <div ref={containerRef} className="flex h-[268px] items-center justify-center text-[13px] text-ink-muted">
        No data in this period.
      </div>
    );
  }

  const { scale, x, y, line, area, zeroY } = geometry;
  const lastIndex = points.length - 1;
  const active = hoverIndex === null ? null : points[hoverIndex];
  const xLabels = labelIndices(points.length, Math.max(2, Math.min(7, Math.floor(innerWidth / 90))));

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left - PADDING.left;
    const ratio = innerWidth === 0 ? 0 : offset / innerWidth;
    const index = Math.round(ratio * lastIndex);
    setHoverIndex(Math.max(0, Math.min(lastIndex, index)));
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        role="img"
        aria-label={`Net profit per day from ${points[0].date} to ${points[lastIndex].date}. Values are also listed in the daily profit and loss table below.`}
        width={width}
        height={HEIGHT}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
        className="touch-none"
      >
        <defs>
          <clipPath id={clipPositiveId}>
            <rect x="0" y="0" width={width} height={Math.max(0, zeroY)} />
          </clipPath>
          <clipPath id={clipNegativeId}>
            <rect x="0" y={Math.max(0, zeroY)} width={width} height={HEIGHT} />
          </clipPath>
        </defs>

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

        <path d={area} fill="var(--series-profit)" opacity="0.1" clipPath={`url(#${clipPositiveId})`} />
        <path d={area} fill="var(--series-loss)" opacity="0.1" clipPath={`url(#${clipNegativeId})`} />

        <path
          d={line}
          fill="none"
          stroke="var(--series-profit)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipPositiveId})`}
        />
        <path
          d={line}
          fill="none"
          stroke="var(--series-loss)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipNegativeId})`}
        />

        {xLabels.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 6}
            textAnchor={index === 0 ? "start" : index === lastIndex ? "end" : "middle"}
            className="tabular fill-[var(--ink-muted)] text-[11px]"
          >
            {formatDateShort(points[index].date)}
          </text>
        ))}

        {hoverIndex !== null ? (
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={PADDING.top}
            y2={PADDING.top + innerHeight}
            stroke="var(--border-strong)"
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
        ) : null}

        {/* End marker, with a surface ring so it stays legible over the line. */}
        <circle
          cx={x(lastIndex)}
          cy={y(points[lastIndex].value)}
          r="4.5"
          fill={points[lastIndex].value < 0 ? "var(--series-loss)" : "var(--series-profit)"}
          stroke="var(--surface)"
          strokeWidth="2"
        />

        {hoverIndex !== null && hoverIndex !== lastIndex ? (
          <circle
            cx={x(hoverIndex)}
            cy={y(points[hoverIndex].value)}
            r="4.5"
            fill={points[hoverIndex].value < 0 ? "var(--series-loss)" : "var(--series-profit)"}
            stroke="var(--surface)"
            strokeWidth="2"
          />
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-[0_4px_14px_rgba(16,16,18,0.10)]"
          style={{
            left: Math.min(Math.max(x(hoverIndex ?? 0), 68), width - 68),
            top: 0,
          }}
        >
          <div className="tabular text-[13px] font-semibold text-ink">
            {formatMoney(fromMinor(active.value), currency)}
          </div>
          <div className="text-[11px] text-ink-muted">{formatDateWithWeekday(active.date)}</div>
        </div>
      ) : null}
    </div>
  );
}
