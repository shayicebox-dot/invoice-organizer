import type { DailySeries } from '@/core/metrics/daily';
import { maxRevenueMinorUnits } from '@/core/metrics/daily';
import type { DateRange } from '@/core/period';
import { formatMoney, formatShortDate } from '@/lib/utils/format';
import { money } from '@/core/money';
import type { CurrencyCode } from '@/core/money';

type DailyPerformanceChartProps = {
  readonly series: DailySeries;
  readonly range: DateRange;
  readonly currency: CurrencyCode;
};

type Padding = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

type Geometry = {
  readonly width: number;
  readonly height: number;
  readonly padding: Padding;
  readonly fontSize: number;
};

/**
 * Two geometries rather than one stretched viewBox: a wide SVG scaled down to a
 * phone's width would shrink its axis text to a few pixels. Both are rendered
 * and CSS hides the one that does not apply, so the page stays a Server
 * Component with no measurement JavaScript.
 */
const WIDE: Geometry = {
  width: 1200,
  height: 300,
  padding: { top: 18, right: 18, bottom: 38, left: 78 },
  fontSize: 13,
};

const NARROW: Geometry = {
  width: 480,
  height: 260,
  padding: { top: 14, right: 12, bottom: 30, left: 56 },
  fontSize: 12,
};

const GRID_LINES = 4;

/**
 * Daily revenue over the selected period.
 *
 * With no connected source the plot frame renders empty. It does not fall back
 * to a flat line at zero: a line along the floor claims we measured nothing
 * happening, which is a different statement from having no measurements.
 */
export function DailyPerformanceChart({ series, range, currency }: DailyPerformanceChartProps) {
  const maxValue = maxRevenueMinorUnits(series);
  const hasData = maxValue !== null && series.length > 0;
  const scaleMax = hasData ? niceScaleMax(maxValue, GRID_LINES) : 0;

  const label = hasData
    ? `Daily revenue from ${formatShortDate(range.start)} to ${formatShortDate(range.end)}`
    : 'Daily revenue chart. No data available for this period.';

  const shared = { series, range, currency, scaleMax, hasData, label } as const;

  return (
    <figure className="relative m-0">
      <div className="sm:hidden">
        <ChartSvg geometry={NARROW} {...shared} />
      </div>
      <div className="hidden sm:block">
        <ChartSvg geometry={WIDE} {...shared} />
      </div>

      {hasData ? null : (
        <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
          <span className="text-sm font-medium text-foreground-muted">No data for this period</span>
          <span className="text-xs text-foreground-subtle">
            Daily revenue appears once Shopify is connected.
          </span>
        </figcaption>
      )}
    </figure>
  );
}

type ChartSvgProps = {
  readonly geometry: Geometry;
  readonly series: DailySeries;
  readonly range: DateRange;
  readonly currency: CurrencyCode;
  readonly scaleMax: number;
  readonly hasData: boolean;
  readonly label: string;
};

function ChartSvg({ geometry, series, range, currency, scaleMax, hasData, label }: ChartSvgProps) {
  const { width, height, padding, fontSize } = geometry;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const baseline = padding.top + plotHeight;

  const points =
    hasData && scaleMax > 0
      ? series.map((point, index) => ({
          x: padding.left + (index / Math.max(series.length - 1, 1)) * plotWidth,
          y: baseline - (point.revenue.minorUnits / scaleMax) * plotHeight,
        }))
      : [];

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L${lastPoint.x.toFixed(1)} ${baseline} L${firstPoint.x.toFixed(1)} ${baseline} Z`
      : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      {/* Gridlines — hairline, solid, recessive. */}
      {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
        const y = padding.top + (index / GRID_LINES) * plotHeight;
        const tickValue = hasData ? scaleMax * (1 - index / GRID_LINES) : null;

        return (
          <g key={index}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {tickValue === null ? null : (
              <text
                x={padding.left - 10}
                y={y + fontSize / 3}
                textAnchor="end"
                className="numeric"
                fontSize={fontSize}
                fill="var(--foreground-subtle)"
              >
                {formatMoney(money(Math.round(tickValue), currency), { compact: true })}
              </text>
            )}
          </g>
        );
      })}

      {points.length > 0 ? (
        <>
          <path d={areaPath} fill="var(--accent)" fillOpacity={0.1} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {lastPoint ? (
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ) : null}
        </>
      ) : null}

      {/* Only the range ends are labelled — never a label on every point. */}
      <text
        x={padding.left}
        y={height - fontSize / 2}
        fontSize={fontSize}
        fill="var(--foreground-subtle)"
        className="numeric"
      >
        {formatShortDate(range.start)}
      </text>
      <text
        x={width - padding.right}
        y={height - fontSize / 2}
        textAnchor="end"
        fontSize={fontSize}
        fill="var(--foreground-subtle)"
        className="numeric"
      >
        {formatShortDate(range.end)}
      </text>
    </svg>
  );
}

/**
 * Axis maximum that divides into `gridLines` clean steps, so every tick is a
 * round number. A nice maximum alone is not enough: 5,000 over 4 lines produces
 * 3,750 and 1,250, which compact formatting rounds into ticks labelled with
 * values they do not sit at.
 */
function niceScaleMax(value: number, gridLines: number): number {
  if (value <= 0) return gridLines;
  const rawStep = value / gridLines;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const niceStep = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return niceStep * magnitude * gridLines;
}
