/**
 * Mapping a historical order line to a pack size.
 *
 * An order line is a *snapshot*. It records the SKU, product title and variant
 * title as they were on the day it was placed, and those can drift or vanish:
 * a variant is renamed, a product is deleted, an item is typed straight into an
 * order edit with no product behind it at all. Anything that resolves a pack
 * size by looking up the catalog as it stands today will quietly stop costing
 * old orders, which is how a June P&L ends up with a profit figure and no COGS.
 *
 * So mapping resolves against a durable table of identities rather than live
 * product metadata:
 *
 *   1. a manual assignment the merchant made on the Historical Product Mapping
 *      page, keyed on whichever identifier the line actually carries;
 *   2. a built-in alias for an identifier the business has used historically;
 *   3. the line's own text, but only when it states a pack size unambiguously.
 *
 * ## Refusing to guess
 *
 * Step 3 is deliberately narrow. A number only reads as a box count when the
 * text says so — next to a pack or box word, or as a whole segment of a SKU
 * against a size the business is known to sell. `Summer 2050 Collection` is not
 * a 2050-pack, and `WHITE-US1` is not a 1-pack.
 *
 * Two rules then disqualify a line from text matching entirely and send it to
 * the merchant instead:
 *
 *   - a **partial-quantity word** — "half of 50-pack" is not a 50-pack, and
 *     costing it as one overstates cost by a factor of two;
 *   - a **box count that is not a whole multiple of ten** — the cost model is
 *     priced per ten boxes, so "25 pack" has no cost the model can derive.
 *
 * An unmapped line contributes no cost, is reported by name, and blocks the
 * profit figures entirely. That is the point: a P&L that says it is incomplete
 * is worth more than one that is quietly wrong.
 */

/**
 * Bundle sizes the business sells today, in boxes.
 *
 * This list is for the UI and for the conservative SKU rule below. It is not a
 * closed set: any whole multiple of ten is costable, because the cost model is
 * priced per ten boxes. A 40-pack that shows up tomorrow costs correctly
 * without a code change.
 */
export const PACK_SIZES = [10, 20, 30, 50, 70] as const;

/** A number of boxes on one line item. Always a whole multiple of ten. */
export type PackSize = number;

/** Boxes per unit of the cost model. Cost is quoted per ten boxes. */
export const BOXES_PER_COST_UNIT = 10;

/**
 * Upper bound on a box count read out of text. Nothing near it is a real
 * order; the bound exists so a stray four-digit number can never become a
 * five-figure cost line.
 */
export const MAX_PACK_BOXES = 500;

/** Whether a number is a box count this cost model can price. */
export function isPackQuantity(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_PACK_BOXES &&
    value % BOXES_PER_COST_UNIT === 0
  );
}

/** What an identity resolves to. `exclude` means "never costed", on purpose. */
export type PackAssignment = PackSize | "exclude";

/**
 * Which field of a line an entry matches on.
 *
 * `any` matches the value against every identifier the line carries. It is the
 * loosest, and is what an older `overrides` entry migrates to.
 */
export type MappingKey =
  | "sku"
  | "variant_id"
  | "variant_title"
  | "product_title"
  | "line_title"
  | "any";

/** Priority order. A more specific identifier wins over a looser one. */
const KEY_PRIORITY: MappingKey[] = [
  "variant_id",
  "sku",
  "variant_title",
  "line_title",
  "product_title",
  "any",
];

export interface PackMappingEntry {
  id: string;
  key: MappingKey;
  /** Compared case-insensitively with whitespace collapsed. */
  value: string;
  assignment: PackAssignment;
  note: string | null;
  /** `builtin` ships with the app. `manual` was set on the mapping page. */
  origin: "builtin" | "manual";
}

/**
 * A line item as the order recorded it.
 *
 * Every field is optional because a custom line added during an order edit has
 * no SKU, no variant and no product — only a title someone typed.
 */
export interface LineIdentity {
  sku: string | null;
  /** Product title, as snapshotted on the line. */
  title: string | null;
  /** Variant title, as snapshotted on the line. */
  variantTitle: string | null;
  /** Live variant id, when the variant still exists. */
  variantId: string | null;
  /** The line's full name, usually "Product - Variant". */
  lineName: string | null;
}

export type MappingConfidence =
  /** An assignment the merchant made. */
  | "manual"
  /** A built-in alias for a known historical identifier. */
  | "builtin"
  /** Read from the SKU. */
  | "sku"
  /** Read from a title. */
  | "title"
  /** Deliberately excluded from costing. */
  | "excluded"
  /** The text states more than one pack size. */
  | "ambiguous"
  /** The text states a size the business does not sell, or a partial quantity. */
  | "unsupported"
  | "unmapped";

export interface PackMatch {
  packSize: PackSize | null;
  /** True when the line is assigned "exclude": no cost, and not a gap either. */
  excluded: boolean;
  confidence: MappingConfidence;
  /** Which text the answer came from, for the mapping report. */
  evidence: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The identifiers a line offers, by key. Empty values are dropped. */
function identifiers(line: LineIdentity): Map<MappingKey, string> {
  const map = new Map<MappingKey, string>();
  const put = (key: MappingKey, value: string | null) => {
    const normalized = norm(value);
    if (normalized !== "") map.set(key, normalized);
  };
  put("variant_id", line.variantId);
  put("sku", line.sku);
  put("variant_title", line.variantTitle);
  put("line_title", line.lineName);
  put("product_title", line.title);
  return map;
}

/**
 * A stable key for one product identity, so the same historical line groups
 * together across orders and months on the mapping page.
 */
export function identityKey(line: LineIdentity): string {
  const ids = identifiers(line);
  return [
    ids.get("sku") ?? "",
    ids.get("variant_title") ?? "",
    ids.get("product_title") ?? ids.get("line_title") ?? "",
  ].join("|");
}

/** A human label for a line, for issues and the mapping table. */
export function describeIdentity(line: LineIdentity): string {
  const name = [line.title, line.variantTitle]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "" && part !== "Default Title" && part !== "Default")
    .join(" · ");
  const fallback = (line.lineName ?? "").trim();
  const sku = (line.sku ?? "").trim();
  const text = name || fallback || "(unnamed line item)";
  return sku === "" ? text : `${sku} — ${text}`;
}

// --- Text rules ------------------------------------------------------------

/** A box count stated next to a pack or box word, at any size. */
const ANY_PACK_PHRASE =
  /(?:^|[^0-9a-z])(\d{1,4})\s*[-–—_ ]?\s*(?:pack|packs|pk|box|boxes|pcs|pieces|count|ct)\b/gi;
const ANY_PACK_OF_PHRASE = /\b(?:pack|box|boxes)\s*of\s*(\d{1,4})(?![0-9])/gi;
/** A whole numeric segment of a SKU, e.g. the 20 in KB-20-BLUE. */
const SKU_SEGMENT = /(?:^|[^0-9])(\d{1,4})(?![0-9])/g;
/** Words that mean "not a whole pack". Their presence blocks text matching. */
const PARTIAL_WORDS = /\b(half|halves|quarter|third|part|partial|split|sample|single|piece)\b/i;

function collect(text: string, pattern: RegExp): number[] {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

/**
 * Box counts stated explicitly in a piece of text.
 *
 * A number that is stated as a pack but is not a whole multiple of ten is
 * `unsupported` rather than ignored: the text plainly claims to be a pack, so
 * falling through to some other reading of it would be a guess.
 */
function packSizesIn(text: string): { sizes: Set<PackSize>; unsupported: boolean } {
  const numbers = [...collect(text, ANY_PACK_PHRASE), ...collect(text, ANY_PACK_OF_PHRASE)];
  const sizes = new Set<PackSize>();
  let unsupported = false;
  for (const number of numbers) {
    if (isPackQuantity(number)) sizes.add(number);
    else unsupported = true;
  }
  return { sizes, unsupported };
}

// --- Resolution ------------------------------------------------------------

/**
 * Resolve a line to a pack size.
 *
 * Manual entries are consulted before built-in ones, and within each the most
 * specific identifier wins, so assigning a SKU is not undone by a looser rule
 * that happens to match the product title.
 */
export function matchPack(entries: readonly PackMappingEntry[], line: LineIdentity): PackMatch {
  const ids = identifiers(line);
  const values = [...ids.values()];

  for (const origin of ["manual", "builtin"] as const) {
    for (const key of KEY_PRIORITY) {
      for (const entry of entries) {
        if (entry.origin !== origin || entry.key !== key) continue;
        const needle = norm(entry.value);
        if (needle === "") continue;

        const hit = key === "any" ? values.includes(needle) : ids.get(key) === needle;
        if (!hit) continue;

        if (entry.assignment === "exclude") {
          return { packSize: null, excluded: true, confidence: "excluded", evidence: entry.value };
        }
        return {
          packSize: entry.assignment,
          excluded: false,
          confidence: origin === "manual" ? "manual" : "builtin",
          evidence: entry.value,
        };
      }
    }
  }

  // Text is only trusted when nothing about the line says "this is not a whole
  // pack of a size we sell".
  const allText = [line.sku, line.variantTitle, line.lineName, line.title]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  if (PARTIAL_WORDS.test(allText)) {
    return { packSize: null, excluded: false, confidence: "unsupported", evidence: allText.trim() };
  }

  const sku = (line.sku ?? "").trim();
  const ordered: Array<[string, string]> = [
    [sku, sku],
    [(line.variantTitle ?? "").trim(), (line.variantTitle ?? "").trim()],
    [(line.lineName ?? "").trim(), (line.lineName ?? "").trim()],
    [(line.title ?? "").trim(), (line.title ?? "").trim()],
  ];

  for (const [text, label] of ordered) {
    if (text === "") continue;
    const { sizes, unsupported } = packSizesIn(text);
    if (unsupported) {
      return { packSize: null, excluded: false, confidence: "unsupported", evidence: label };
    }
    if (sizes.size === 1) {
      const packSize = [...sizes][0];
      const confidence = text === sku ? "sku" : "title";
      return { packSize, excluded: false, confidence, evidence: label };
    }
    if (sizes.size > 1) {
      return { packSize: null, excluded: false, confidence: "ambiguous", evidence: label };
    }
  }

  // Last resort: a bare numeric segment in the SKU, e.g. KB-20-BLUE.
  //
  // Deliberately stricter than the text rules above. A SKU states nothing about
  // what its digits mean, so only a size the business is known to sell counts;
  // every other number in it is ignored rather than read as a box count. That
  // is what keeps WHITE-US1 from becoming a 1-pack and KB-2024-X a 2024-pack.
  if (sku !== "") {
    const segment = new Set(
      collect(sku, SKU_SEGMENT).filter((n) => (PACK_SIZES as readonly number[]).includes(n)),
    );
    if (segment.size === 1) {
      return { packSize: [...segment][0], excluded: false, confidence: "sku", evidence: sku };
    }
    if (segment.size > 1) {
      return { packSize: null, excluded: false, confidence: "ambiguous", evidence: sku };
    }
  }

  return { packSize: null, excluded: false, confidence: "unmapped", evidence: null };
}

/**
 * Aliases for identifiers the business has used historically.
 *
 * These exist so costing does not depend on the catalog still looking the way
 * it does today. A variant renamed or deleted tomorrow keeps costing correctly,
 * because the SKU recorded on the order still resolves here. They are ordinary
 * entries: visible on the mapping page, and overridable by a manual assignment.
 */
export function builtinMappings(): PackMappingEntry[] {
  const entry = (
    key: MappingKey,
    value: string,
    assignment: PackAssignment,
    note: string,
  ): PackMappingEntry => ({
    id: `builtin:${key}:${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    key,
    value,
    assignment,
    note,
    origin: "builtin",
  });

  return [
    entry("sku", "WHITE-US1", 10, "Kicks Box 10-pack SKU"),
    entry("sku", "WHITE-US-2", 20, "Kicks Box 20-pack SKU"),
    entry("sku", "WHITE-US-5", 50, "Kicks Box 50-pack SKU"),
    entry("variant_title", "10 Pack Boxes", 10, "Historical variant name"),
    entry("variant_title", "20 Pack Boxes", 20, "Historical variant name"),
    entry("variant_title", "50 Pack Boxes", 50, "Historical variant name"),
  ];
}
