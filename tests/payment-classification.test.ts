import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyOrigin,
  summariseByOrigin,
  type ClassifiedPayment,
} from '@/core/metrics/payment-classification';

/**
 * The rule that separates a direct sale from one Shopify already reports, and
 * the arithmetic over it.
 *
 * These are the cases that decide whether a total could ever be overstated, so
 * they are pinned here rather than checked once by eye.
 */

const EXTERNAL = 'קופסאות אחסון 20 יחידות';
const SHOPIFY = 'הזמנה מספר 1042';

function payment(over: Partial<ClassifiedPayment> = {}): ClassifiedPayment {
  return {
    origin: 'external',
    settlement: 'settled',
    amount: '450',
    currency: 'ILS',
    isReversal: false,
    ...over,
  };
}

const totalOf = (
  summary: ReturnType<typeof summariseByOrigin>,
  origin: 'external' | 'shopify' | 'unclassified',
) => summary.byOrigin.find((entry) => entry.origin === origin);

test('the storage-boxes phrase marks a direct sale', () => {
  assert.deepEqual(classifyOrigin([EXTERNAL]), { origin: 'external', ambiguous: false });
});

test('the order-number phrase marks a Shopify-originated document', () => {
  assert.deepEqual(classifyOrigin([SHOPIFY]), { origin: 'shopify', ambiguous: false });
});

test('neither phrase leaves the sale unclassified', () => {
  for (const descriptions of [[], [''], ['משלוח'], ['Consulting']]) {
    assert.equal(classifyOrigin(descriptions).origin, 'unclassified');
  }
});

test('a phrase is found inside a longer description', () => {
  assert.equal(classifyOrigin([`מכירה ישירה - ${EXTERNAL} - נאסף מהמחסן`]).origin, 'external');
  assert.equal(classifyOrigin(['תשלום עבור הזמנה מספר 88 באתר']).origin, 'shopify');
});

test('a phrase on any line counts, not only the first', () => {
  assert.equal(classifyOrigin(['משלוח', EXTERNAL]).origin, 'external');
});

test('both phrases together are read as Shopify, and reported as ambiguous', () => {
  // Counting a sale Shopify already reports a second time is the one mistake
  // worth ruling out, so the Shopify reading wins and says it was ambiguous.
  assert.deepEqual(classifyOrigin([SHOPIFY, EXTERNAL]), { origin: 'shopify', ambiguous: true });
});

test('a phrase cannot be formed across two separate descriptions', () => {
  assert.equal(classifyOrigin(['קופסאות', 'אחסון']).origin, 'unclassified');
});

test('external revenue sums its settled payments', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450' }),
    payment({ amount: '800.50' }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 125_050);
  assert.equal(totalOf(summary, 'external')?.settledCount, 2);
});

test('a refund of a direct sale reduces external revenue', () => {
  const summary = summariseByOrigin([
    payment({ amount: '1000' }),
    payment({ amount: '250', isReversal: true }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 75_000);
  assert.equal(totalOf(summary, 'external')?.reversals, 1);
});

test('an amount Morning already states as negative is not negated twice', () => {
  const summary = summariseByOrigin([
    payment({ amount: '1000' }),
    payment({ amount: '-250', isReversal: true }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 75_000);
});

test('refunds beyond sales give a negative total, not a hidden one', () => {
  const summary = summariseByOrigin([payment({ amount: '300', isReversal: true })]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, -30_000);
});

test('an unpaid payment is counted but never totalled', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450' }),
    payment({ amount: '900', settlement: 'unpaid' }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 45_000);
  assert.equal(totalOf(summary, 'external')?.count, 2);
  assert.equal(totalOf(summary, 'external')?.settledCount, 1);
  assert.equal(summary.unpaidCount, 1);
});

test('a cancelled document is counted but never totalled', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450' }),
    payment({ amount: '900', settlement: 'cancelled' }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 45_000);
  assert.equal(summary.cancelledCount, 1);
});

test('a Shopify-originated payment never reaches external revenue', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450' }),
    payment({ amount: '9000', origin: 'shopify' }),
  ]);

  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 45_000);
  assert.equal(totalOf(summary, 'shopify')?.totals[0]?.minorUnits, 900_000);
  assert.equal(summary.totalCount, 2);
});

test('currencies are totalled apart, never summed together', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450', currency: 'ILS' }),
    payment({ amount: '100', currency: 'USD' }),
  ]);

  const external = totalOf(summary, 'external');
  assert.equal(external?.totals.length, 2);
  assert.equal(external?.totals.find((t) => t.currency === 'ILS')?.minorUnits, 45_000);
  assert.equal(external?.totals.find((t) => t.currency === 'USD')?.minorUnits, 10_000);
});

test('an unreadable amount is excluded and counted, never zeroed', () => {
  const summary = summariseByOrigin([
    payment({ amount: '450' }),
    payment({ amount: 'n/a' }),
    payment({ amount: null }),
    payment({ amount: '90', currency: 'GBP' }),
  ]);

  const external = totalOf(summary, 'external');
  assert.equal(external?.totals[0]?.minorUnits, 45_000);
  assert.equal(external?.unpriced, 3);
  assert.deepEqual(external?.unsupportedCurrencies, ['GBP']);
});

test('every origin is reported, including one with nothing in it', () => {
  const summary = summariseByOrigin([payment({ amount: '450' })]);

  assert.deepEqual(
    summary.byOrigin.map((entry) => entry.origin),
    ['external', 'shopify', 'unclassified'],
  );
  assert.deepEqual(totalOf(summary, 'unclassified')?.totals, []);
  assert.equal(totalOf(summary, 'unclassified')?.count, 0);
});
