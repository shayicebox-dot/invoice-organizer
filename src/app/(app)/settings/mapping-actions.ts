'use server';

import { revalidatePath } from 'next/cache';
import { hasValidSession } from '@/lib/auth/current-session';
import { saveBoxMapping, type BoxMappingEntry } from '@/data/box-mapping-store';
import { MAX_BOXES_PER_UNIT } from '@/lib/config/products';

/**
 * Record how many physical boxes a variant contains.
 *
 * The whole cost engine multiplies by this number, so it is validated on the
 * server rather than trusted from the form: a bad value would not fail loudly,
 * it would quietly misprice every order containing that variant.
 */

export type SaveMappingView =
  | { readonly status: 'saved'; readonly message: string }
  | { readonly status: 'error'; readonly message: string };

export async function saveVariantBoxCount(input: {
  readonly variantId: string;
  readonly boxesPerUnit: number;
  readonly productTitle: string | null;
  readonly variantTitle: string | null;
}): Promise<SaveMappingView> {
  if (!(await hasValidSession())) {
    return { status: 'error', message: 'Your session has expired. Sign in again.' };
  }

  const boxes = Number(input.boxesPerUnit);

  if (!Number.isInteger(boxes) || boxes < 0 || boxes > MAX_BOXES_PER_UNIT) {
    return {
      status: 'error',
      message: `Enter a whole number of boxes between 0 and ${MAX_BOXES_PER_UNIT}.`,
    };
  }

  const entry: BoxMappingEntry = {
    variantId: input.variantId,
    boxesPerUnit: boxes,
    productTitle: input.productTitle,
    variantTitle: input.variantTitle,
  };

  const result = await saveBoxMapping([entry]);

  if (!result.ok) {
    return { status: 'error', message: result.message };
  }

  // Every screen's figures depend on this, so none of them may keep a cached
  // version computed with the old count.
  revalidatePath('/', 'layout');

  return {
    status: 'saved',
    message: boxes === 0 ? 'Saved — not counted as packaging.' : `Saved — ${boxes} boxes per unit.`,
  };
}
