import 'server-only';

import { cache } from 'react';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseWritable } from '@/lib/config/env';
import { MAX_BOXES_PER_UNIT, SEED_BOX_MAPPING } from '@/lib/config/products';
import type { BoxMappingConfig } from '@/core/metrics/boxes';

/**
 * Where the variant → physical box mapping lives.
 *
 * Stored in the database, keyed by Shopify variant ID, so the owner records it
 * once in Settings and it survives deploys, product renames and new devices.
 * Nothing about it requires editing source code.
 *
 * When the database is not configured the app still runs: it falls back to the
 * small seed map in configuration and reports that saving is unavailable, so
 * the screen can say why rather than silently discarding an edit.
 */

export type BoxMappingEntry = {
  readonly variantId: string;
  readonly boxesPerUnit: number;
  readonly productTitle: string | null;
  readonly variantTitle: string | null;
};

export type BoxMappingState = {
  readonly config: BoxMappingConfig;
  /** True when edits can be saved — i.e. the database is reachable. */
  readonly writable: boolean;
  /** Why saving is unavailable, when it is. */
  readonly unavailableReason: string | null;
};

const TABLE = 'product_box_mapping';

function seedConfig(): BoxMappingConfig {
  return { byVariantId: new Map(Object.entries(SEED_BOX_MAPPING)) };
}

/**
 * The current mapping.
 *
 * `cache` keeps it to one read per request, however many screens ask for it.
 */
export const readBoxMapping = cache(async (): Promise<BoxMappingState> => {
  if (!isSupabaseWritable()) {
    return {
      config: seedConfig(),
      writable: false,
      unavailableReason:
        'The database is not connected on this deployment, so the mapping cannot be saved yet. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, then redeploy.',
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from(TABLE).select('variant_id, boxes_per_unit');

    if (error !== null) {
      return {
        config: seedConfig(),
        writable: false,
        unavailableReason: `The mapping table could not be read (${error.message}). Run the migration in supabase/migrations, then reload.`,
      };
    }

    const byVariantId = new Map<string, number>();

    for (const row of data ?? []) {
      const variantId = typeof row.variant_id === 'string' ? row.variant_id : null;
      const boxes = typeof row.boxes_per_unit === 'number' ? row.boxes_per_unit : null;
      if (variantId === null || boxes === null) continue;
      byVariantId.set(variantId, boxes);
    }

    return { config: { byVariantId }, writable: true, unavailableReason: null };
  } catch (error) {
    return {
      config: seedConfig(),
      writable: false,
      unavailableReason:
        error instanceof Error
          ? `The database could not be reached (${error.message}).`
          : 'The database could not be reached.',
    };
  }
});

export type SaveResult =
  | { readonly ok: true; readonly saved: number }
  | { readonly ok: false; readonly message: string };

/**
 * Record decisions for one or more variants.
 *
 * Validated here rather than trusted from the browser: a box count is an
 * integer between zero and a sane ceiling, and a variant ID must look like a
 * Shopify variant GID. A bad value would not throw — it would quietly misprice
 * every order containing that variant.
 */
export async function saveBoxMapping(entries: readonly BoxMappingEntry[]): Promise<SaveResult> {
  if (entries.length === 0) return { ok: true, saved: 0 };

  if (!isSupabaseWritable()) {
    return { ok: false, message: 'The database is not connected on this deployment.' };
  }

  for (const entry of entries) {
    if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(entry.variantId)) {
      return { ok: false, message: `"${entry.variantId}" is not a Shopify variant ID.` };
    }
    if (!Number.isInteger(entry.boxesPerUnit) || entry.boxesPerUnit < 0 || entry.boxesPerUnit > MAX_BOXES_PER_UNIT) {
      return {
        ok: false,
        message: `A box count must be a whole number between 0 and ${MAX_BOXES_PER_UNIT}.`,
      };
    }
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from(TABLE).upsert(
      entries.map((entry) => ({
        variant_id: entry.variantId,
        boxes_per_unit: entry.boxesPerUnit,
        product_title: entry.productTitle,
        variant_title: entry.variantTitle,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'variant_id' },
    );

    if (error !== null) {
      return { ok: false, message: `The mapping could not be saved (${error.message}).` };
    }

    return { ok: true, saved: entries.length };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `The mapping could not be saved (${error.message}).` : 'The mapping could not be saved.',
    };
  }
}
