/**
 * Every product identity that has ever appeared on an order, and what it maps
 * to.
 *
 * This is what the Historical Product Mapping page reads. It groups order lines
 * by the identity recorded *on the line* rather than by a product in the
 * catalog, so a variant that was renamed, a product that was deleted, and a
 * custom item typed into an order edit all show up and can be assigned.
 *
 * Pure: lines in, rows out. No I/O.
 */

import type { ISODate } from "../types";
import { describeIdentity, identityKey, matchPack } from "./pack-mapping";
import type { LineIdentity, MappingConfidence, PackSize } from "./pack-mapping";
import type { PackCostModel } from "./pack-model";

/** One order line, reduced to what mapping and reporting need. */
export interface IdentityInput extends LineIdentity {
  date: ISODate;
  /** Pack quantity this line contributes, net of units returned to stock. */
  quantity: number;
}

export type IdentityStatus = "mapped" | "excluded" | "unmapped";

export interface ProductIdentityRow extends LineIdentity {
  key: string;
  label: string;
  firstSeen: ISODate;
  lastSeen: ISODate;
  /** How many order lines carried this identity. */
  lineItems: number;
  /** Total pack quantity sold under it. */
  quantity: number;
  packSize: PackSize | null;
  confidence: MappingConfidence;
  status: IdentityStatus;
}

/**
 * Roll lines into one row per identity.
 *
 * A row is `unmapped` only when it actually sold something: a line whose units
 * all came back to stock costs nothing either way, and flagging it would block
 * the P&L over a quantity of zero.
 */
export function buildIdentityInventory(
  model: PackCostModel,
  lines: readonly IdentityInput[],
): ProductIdentityRow[] {
  const rows = new Map<string, ProductIdentityRow>();

  for (const line of lines) {
    const key = identityKey(line);
    const existing = rows.get(key);

    if (existing) {
      existing.lineItems += 1;
      existing.quantity += line.quantity;
      if (line.date < existing.firstSeen) existing.firstSeen = line.date;
      if (line.date > existing.lastSeen) existing.lastSeen = line.date;
      // Keep the richest identifiers seen for this key: an older line may have
      // carried a SKU that a later one dropped.
      existing.sku ??= line.sku;
      existing.variantId ??= line.variantId;
      existing.variantTitle ??= line.variantTitle;
      existing.lineName ??= line.lineName;
      existing.title ??= line.title;
      continue;
    }

    const match = matchPack(model.mappings, line);
    rows.set(key, {
      key,
      sku: line.sku,
      title: line.title,
      variantTitle: line.variantTitle,
      variantId: line.variantId,
      lineName: line.lineName,
      label: describeIdentity(line),
      firstSeen: line.date,
      lastSeen: line.date,
      lineItems: 1,
      quantity: line.quantity,
      packSize: match.packSize,
      confidence: match.confidence,
      status: match.excluded ? "excluded" : match.packSize === null ? "unmapped" : "mapped",
    });
  }

  return [...rows.values()]
    .map((row) =>
      row.status === "unmapped" && row.quantity <= 0
        ? { ...row, status: "excluded" as IdentityStatus }
        : row,
    )
    .sort((a, b) => {
      // Unmapped first — they are the ones blocking a profit figure.
      const rank = (row: ProductIdentityRow) => (row.status === "unmapped" ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.label.localeCompare(b.label);
    });
}

/** The rows still blocking a trustworthy P&L. */
export function unmappedRows(rows: readonly ProductIdentityRow[]): ProductIdentityRow[] {
  return rows.filter((row) => row.status === "unmapped");
}
