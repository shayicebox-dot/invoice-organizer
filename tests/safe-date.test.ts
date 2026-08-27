import assert from 'node:assert/strict';
import test from 'node:test';

import { formatExternalDate, isReadableDate, parseExternalDate } from '../src/lib/utils/safe-date.ts';

/**
 * Regression tests for the crash this module exists to prevent.
 *
 * Production's Morning payment diagnostics threw
 * `RangeError: Invalid time value` and unmounted the whole Settings page,
 * because a real payment carried a date that `Intl.DateTimeFormat` refused.
 * Every case below is one a provider can and does send.
 *
 * Run with `npm test` — no test framework, just Node's own runner.
 */

const OPTIONS = { locale: 'en-IL', timeZone: 'Asia/Jerusalem' } as const;

/** What the old code did, kept here so the tests pin the actual failure. */
function formatUnsafely(value: string): string {
  return new Intl.DateTimeFormat(OPTIONS.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

test('a valid calendar date formats', () => {
  assert.equal(formatExternalDate('2026-08-04', OPTIONS), '4 Aug');
  assert.equal(isReadableDate('2026-08-04'), true);
  assert.equal(parseExternalDate('2026-08-04')?.toISOString(), '2026-08-04T00:00:00.000Z');
});

test('a null date is unavailable, not a crash', () => {
  assert.equal(formatExternalDate(null, OPTIONS), null);
  assert.equal(isReadableDate(null), false);
  assert.equal(parseExternalDate(null), null);
});

test('an empty date is unavailable, not a crash', () => {
  // This is the case that took production down: `new Date('T00:00:00Z')` is an
  // Invalid Date, and formatting one throws.
  assert.throws(() => formatUnsafely(''), RangeError);

  assert.equal(formatExternalDate('', OPTIONS), null);
  assert.equal(formatExternalDate('   ', OPTIONS), null);
  assert.equal(isReadableDate(''), false);
});

test('a malformed date is unavailable, not a crash', () => {
  assert.throws(() => formatUnsafely('not-a-date'), RangeError);

  for (const malformed of ['not-a-date', '0000-00-00', '2026-13-45', '31/12/2026', '—', 'null']) {
    assert.equal(formatExternalDate(malformed, OPTIONS), null, malformed);
    assert.equal(isReadableDate(malformed), false, malformed);
  }
});

test('a non-string date is unavailable, not a crash', () => {
  for (const value of [undefined, 0, 1_754_265_600_000, {}, [], true, Number.NaN]) {
    assert.equal(formatExternalDate(value, OPTIONS), null);
    assert.equal(isReadableDate(value), false);
  }
});

test('a timestamp with a time is read as a moment, in the business timezone', () => {
  // 22:30 UTC on 4 August is already 5 August in Jerusalem (UTC+3).
  assert.equal(formatExternalDate('2026-08-04T22:30:00Z', OPTIONS), '5 Aug');

  // A calendar date names a day rather than a moment, so it is never shifted.
  assert.equal(formatExternalDate('2026-08-04', OPTIONS), '4 Aug');
});

test('a date beyond what Date can represent is unavailable', () => {
  assert.equal(formatExternalDate('275760-09-14', OPTIONS), null);
});

test('an unusable locale or timezone yields unavailable rather than throwing', () => {
  assert.equal(
    formatExternalDate('2026-08-04T10:00:00Z', { locale: 'en-IL', timeZone: 'Not/AZone' }),
    null,
  );
});
