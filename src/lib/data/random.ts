/**
 * Deterministic pseudo-randomness.
 *
 * The mock dataset must be identical on every render and in every process:
 * a server component, a re-render and a rebuild all have to produce the same
 * numbers, or the dashboard would contradict itself. Every value is therefore
 * derived from a seeded generator keyed by a stable string (store + date +
 * purpose) rather than `Math.random()`.
 */

/** FNV-1a. Small, fast, good enough to spread string keys across the seed space. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  between(min: number, max: number): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Uniformly pick one element. */
  pick<T>(items: readonly T[]): T;
  /** Roughly normal, clamped to [1 - spread, 1 + spread]. */
  jitter(spread: number): number;
}

/** mulberry32 — compact, well-distributed, and stable across platforms. */
export function createRng(key: string): Rng {
  let state = hashString(key);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    jitter: (spread) => {
      // Average three draws so the distribution clusters around 1.
      const average = (next() + next() + next()) / 3;
      return 1 + (average - 0.5) * 2 * spread;
    },
  };

  return rng;
}

const HEX = "0123456789abcdef";

/**
 * A stable UUID-shaped identifier derived from a key. Not a real v4 UUID — it
 * stands in for database primary keys so React list keys and cross-references
 * stay consistent between renders.
 */
export function stableId(key: string): string {
  const rng = createRng(`id:${key}`);
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += HEX[Math.floor(rng.next() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) out += "-";
  }
  return out;
}
