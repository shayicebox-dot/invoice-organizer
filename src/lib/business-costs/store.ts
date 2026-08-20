/**
 * Persistence for business cost settings.
 *
 * Backed by a JSON file under `data/`, which keeps the settings editable from
 * the UI without standing up a database. This is the same seam the mock data
 * layer uses: everything above calls `readSettings` / `writeSettings`, so
 * moving to Supabase is a change inside this file.
 *
 * Caveat worth knowing: a read-only filesystem (most serverless hosts) cannot
 * persist writes. Reads still work, so a deployment can ship a committed
 * settings file, but editing from the UI needs a writable disk or the database
 * backend that replaces this.
 */

import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { emptySettings } from "./defaults";
import { builtinMappings } from "./pack-mapping";
import type { PackMappingEntry, PackRule } from "./pack-model";
import type { BusinessCostSettings } from "./types";

const DATA_PATH = "data/business-costs.json";

function filePath(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), DATA_PATH);
}

let cache: { value: BusinessCostSettings; loadedAt: number } | null = null;
/** Short, so a change made in one request is visible to the next render. */
const CACHE_TTL_MS = 1_000;

/**
 * An earlier model split a pack's cost into product COGS and fulfillment. They
 * are one operational figure now, so a stored file written before the change is
 * migrated by adding the two halves rather than being discarded.
 */
function migrateRules(raw: unknown, fallback: PackRule[]): PackRule[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  return raw.map((rule) => {
    const record = rule as Partial<PackRule> & { productCogs?: number; fulfillmentCost?: number };
    if (typeof record.operationalCost === "number") return record as PackRule;
    const legacy = (record.productCogs ?? 0) + (record.fulfillmentCost ?? 0);
    return { ...record, operationalCost: legacy } as PackRule;
  });
}

/**
 * Built-ins are merged in on every read rather than written to disk, so
 * shipping a new alias reaches an existing installation. A manual entry with
 * the same id wins, which is how a built-in gets corrected.
 */
function migrateMappings(raw: unknown): PackMappingEntry[] {
  const source = raw as
    | { mappings?: unknown; overrides?: Array<{ id?: string; match?: string; packSize?: number }> }
    | null
    | undefined;

  const stored: PackMappingEntry[] = Array.isArray(source?.mappings)
    ? (source.mappings as PackMappingEntry[]).filter(
        (entry) => entry && typeof entry.value === "string",
      )
    : [];

  // An older file kept a flat `overrides` list that matched any identifier.
  const legacy: PackMappingEntry[] = Array.isArray(source?.overrides)
    ? source.overrides
        .filter((entry) => entry && typeof entry.match === "string")
        .map((entry) => ({
          id: entry.id ?? `legacy:${entry.match}`,
          key: "any" as const,
          value: entry.match as string,
          assignment: entry.packSize as PackMappingEntry["assignment"],
          note: "Migrated from an earlier override",
          origin: "manual" as const,
        }))
    : [];

  const manual = [...stored, ...legacy].map((entry) => ({
    ...entry,
    origin: entry.origin === "builtin" ? ("builtin" as const) : ("manual" as const),
  }));

  const claimed = new Set(manual.map((entry) => entry.id));
  return [...manual, ...builtinMappings().filter((entry) => !claimed.has(entry.id))];
}

/**
 * Fill in anything a stored file is missing, so a settings file written by an
 * older version never crashes a page with an undefined array.
 */
function normalize(raw: Partial<BusinessCostSettings> | null): BusinessCostSettings {
  const base = emptySettings();
  if (!raw || typeof raw !== "object") return base;

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
    cogs: {
      mode: raw.cogs?.mode ?? base.cogs.mode,
      skuCosts: Array.isArray(raw.cogs?.skuCosts) ? raw.cogs.skuCosts : [],
    },
    packModel: {
      rules: migrateRules(raw.packModel?.rules, base.packModel.rules),
      mappings: migrateMappings(raw.packModel),
      variableRateOfNetRevenue:
        typeof raw.packModel?.variableRateOfNetRevenue === "number"
          ? raw.packModel.variableRateOfNetRevenue
          : base.packModel.variableRateOfNetRevenue,
    },
    shipping: {
      rates: Array.isArray(raw.shipping?.rates) ? raw.shipping.rates : [],
      fixedFees: Array.isArray(raw.shipping?.fixedFees) ? raw.shipping.fixedFees : [],
    },
    payments: {
      processors: Array.isArray(raw.payments?.processors) ? raw.payments.processors : [],
    },
    klaviyo: {
      plans: Array.isArray(raw.klaviyo?.plans) ? raw.klaviyo.plans : [],
    },
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
  };
}

export async function readSettings(): Promise<BusinessCostSettings> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;

  let parsed: Partial<BusinessCostSettings> | null = null;
  try {
    parsed = JSON.parse(await readFile(filePath(), "utf8"));
  } catch {
    // No file yet, or unreadable. An unconfigured start is the correct state,
    // and every section will report itself as not configured.
    parsed = null;
  }

  const value = normalize(parsed);
  cache = { value, loadedAt: Date.now() };
  return value;
}

export async function writeSettings(next: BusinessCostSettings): Promise<void> {
  const stamped: BusinessCostSettings = { ...next, version: 1, updatedAt: new Date().toISOString() };
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(stamped, null, 2)}\n`, "utf8");
  cache = { value: stamped, loadedAt: Date.now() };
}

/** Read, transform, write. Keeps every mutation on one code path. */
export async function updateSettings(
  mutate: (current: BusinessCostSettings) => BusinessCostSettings,
): Promise<BusinessCostSettings> {
  const current = await readSettings();
  const next = mutate(current);
  await writeSettings(next);
  return next;
}

/** Test hook. */
export function clearSettingsCache(): void {
  cache = null;
}

export { DATA_PATH };
