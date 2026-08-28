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

const BOXES = 'קופסאות אחסון לנעליים';

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

test('an order reference makes the sale Shopify-originated', () => {
  for (const marker of ['הזמנה 2242', 'הזמנה מספר 2242', 'הזמנה #2242', 'הזמנה: 2242']) {
    const result = classifyOrigin([marker]);
    assert.equal(result.origin, 'shopify', marker);
    assert.equal(result.matched, marker, marker);
    assert.match(result.orderMarker ?? '', /2242/, marker);
  }
});

test('the product phrase alone makes the sale external', () => {
  assert.deepEqual(classifyOrigin([BOXES]), {
    origin: 'external',
    matched: BOXES,
    orderMarker: null,
  });
});

test('an order reference beats the product phrase in the same document', () => {
  // The case production exposed: Shopify-raised documents name the product too,
  // and reading the product first counted them as direct sales.
  const result = classifyOrigin([BOXES, 'הזמנה 2242']);
  assert.equal(result.origin, 'shopify');
  assert.equal(result.orderMarker, 'הזמנה 2242');
});

test('an order reference beats the product phrase in one line of text', () => {
  const line = `${BOXES} - הזמנה מספר 2242`;
  const result = classifyOrigin([line]);
  assert.equal(result.origin, 'shopify');
  assert.equal(result.matched, line);
  assert.equal(result.orderMarker, 'הזמנה מספר 2242');
});

test('an order reference on any line wins, whatever its position', () => {
  assert.equal(classifyOrigin(['הזמנה 2243', BOXES]).origin, 'shopify');
  assert.equal(classifyOrigin([BOXES, 'משלוח', 'הזמנה 2244']).origin, 'shopify');
});

test('unrelated text is unclassified', () => {
  for (const descriptions of [[], [''], ['משלוח'], ['ייעוץ עסקי'], ['Consulting']]) {
    assert.equal(classifyOrigin(descriptions).origin, 'unclassified');
    assert.equal(classifyOrigin(descriptions).matched, null);
  }
});

test('the word "order" without a number marks nothing', () => {
  // Otherwise any mention of an order in passing would silently reclassify a
  // direct sale as one Shopify already reported.
  assert.equal(classifyOrigin(['הזמנה מיוחדת ללקוח']).origin, 'unclassified');
  assert.equal(classifyOrigin([`${BOXES} - הזמנה טלפונית`]).origin, 'external');
});

test('the order marker is reported exactly as written', () => {
  assert.equal(classifyOrigin(['תשלום עבור הזמנה #2242 באתר']).orderMarker, 'הזמנה #2242');
  assert.equal(classifyOrigin([BOXES]).orderMarker, null);
});

test('a phrase cannot be formed across two separate descriptions', () => {
  assert.equal(classifyOrigin(['קופסאות', 'אחסון']).origin, 'unclassified');
  assert.equal(classifyOrigin(['הזמנה', '2242']).origin, 'unclassified');
});

test('external revenue sums its settled payments', () => {
  const summary = summariseByOrigin([payment({ amount: '450' }), payment({ amount: '800.50' })]);

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

test('the three totals follow the precedence, end to end', () => {
  // A period whose documents look like the real ones: every Shopify document
  // names the product too, and only the last is a genuine direct sale.
  const rows = [
    { descriptions: [`${BOXES} - הזמנה 2242`], amount: '450' },
    { descriptions: [BOXES, 'הזמנה מספר 2243'], amount: '800' },
    { descriptions: ['הזמנה #2244'], amount: '250' },
    { descriptions: [BOXES], amount: '1000' },
    { descriptions: ['ייעוץ עסקי'], amount: '120' },
  ];

  const summary = summariseByOrigin(
    rows.map((row) =>
      payment({ origin: classifyOrigin(row.descriptions).origin, amount: row.amount }),
    ),
  );

  assert.equal(totalOf(summary, 'shopify')?.totals[0]?.minorUnits, 150_000);
  assert.equal(totalOf(summary, 'external')?.totals[0]?.minorUnits, 100_000);
  assert.equal(totalOf(summary, 'unclassified')?.totals[0]?.minorUnits, 12_000);
});
