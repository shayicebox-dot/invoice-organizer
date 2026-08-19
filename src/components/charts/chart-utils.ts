/** Small helpers shared by the SVG charts. */

/** One plotted day. `value` is in integer minor currency units. */
export interface SeriesPoint {
  date: string;
  value: number;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/** Round a domain outward to readable tick values. */
export function niceScale(values: number[], tickCount = 4, includeZero = true): Scale {
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    max = max === 0 ? 1 : max * 1.2;
    min = Math.min(min, 0);
  }

  const rawStep = (max - min) / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let tick = niceMin; tick <= niceMax + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }

  return { min: niceMin, max: niceMax, ticks };
}

/** Column with a rounded top and a square base, per the mark spec. */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${bottom}`,
    "Z",
  ].join(" ");
}

/** Evenly spaced label indices, always including the first and last point. */
export function labelIndices(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const step = (count - 1) / (maxLabels - 1);
  const indices = new Set<number>();
  for (let i = 0; i < maxLabels; i += 1) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b);
}
