/**
 * The Shopify revenue reconciliation.
 *
 * Every fixture here is the shape of a real order from the connected store,
 * because the bug this covers was invisible to synthetic data: order-level
 * totals and Shopify Analytics agree on an ordinary order and diverge only
 * once an order is edited or returned.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AgreementNode,
  type OrderLedger,
  type OrderTotals,
  type SaleNode,
  aggregateDailySales,
  needsSalesLedger,
  netSalesOf,
} from "../src/lib/shopify/sales";
import { toMinor } from "../src/lib/money";

const TZ = "America/New_York";

function bag(amount: string) {
  return { shopMoney: { amount, currencyCode: "USD" } };
}

function order(over: Partial<OrderTotals> & Pick<OrderTotals, "id" | "createdAt">): OrderTotals {
  return {
    name: `#${over.id}`,
    test: false,
    edited: false,
    cancelledAt: null,
    returnStatus: "NO_RETURN",
    currentSubtotalLineItemsQuantity: 1,
    subtotalPriceSet: bag("0.00"),
    totalDiscountsSet: bag("0.00"),
    totalTaxSet: bag("0.00"),
    totalShippingPriceSet: bag("0.00"),
    refunds: [],
    ...over,
  };
}

function sale(over: Partial<SaleNode> & Pick<SaleNode, "id" | "lineType">): SaleNode {
  return {
    actionType: "ORDER",
    quantity: null,
    totalAmount: bag("0.00"),
    totalTaxAmount: bag("0.00"),
    totalDiscountAmountBeforeTaxes: bag("0.00"),
    ...over,
  };
}

function agreement(happenedAt: string, reason: string, sales: SaleNode[]): AgreementNode {
  return {
    id: `agreement:${happenedAt}:${reason}`,
    happenedAt,
    reason,
    sales: { pageInfo: { hasNextPage: false }, nodes: sales },
  };
}

function ledger(id: string, agreements: AgreementNode[]): OrderLedger {
  return {
    id,
    name: `#${id}`,
    agreements: { pageInfo: { hasNextPage: false }, nodes: agreements },
  };
}

function run(
  orders: OrderTotals[],
  ledgers: OrderLedger[] = [],
  start = "2026-08-01",
  end = "2026-08-20",
) {
  return aggregateDailySales({
    start,
    end,
    timezone: TZ,
    currency: "USD",
    orders,
    ledgers: new Map(ledgers.map((l) => [l.id, l])),
  });
}

function day(days: ReturnType<typeof run>, date: string) {
  const found = days.find((d) => d.date === date);
  assert.ok(found, `expected a bucket for ${date}`);
  return found;
}

describe("order-level totals", () => {
  it("adds discounts back to reach gross sales", () => {
    // #3170: subtotal 162.00 with an 18.00 discount is a 180.00 gross sale.
    const days = run([
      order({
        id: "3170",
        createdAt: "2026-08-02T04:48:26Z",
        subtotalPriceSet: bag("162.00"),
        totalDiscountsSet: bag("18.00"),
        totalTaxSet: bag("6.79"),
      }),
    ]);

    assert.equal(toMinor(day(days, "2026-08-02").grossSales), 18_000);
    assert.equal(toMinor(day(days, "2026-08-02").discounts), 1_800);
    assert.equal(toMinor(netSalesOf(day(days, "2026-08-02"))), 16_200);
  });

  it("buckets by the shop's timezone, not UTC", () => {
    // 01:43 UTC on the 4th is 21:43 on the 3rd in New York.
    const days = run([
      order({
        id: "3190",
        createdAt: "2026-08-04T01:43:52Z",
        subtotalPriceSet: bag("390.00"),
      }),
    ]);

    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-08-03"],
    );
  });

  it("reports taxes without letting them touch net sales", () => {
    const days = run([
      order({
        id: "3330",
        createdAt: "2026-08-18T14:00:00Z",
        subtotalPriceSet: bag("115.00"),
        totalTaxSet: bag("8.05"),
      }),
    ]);

    assert.equal(toMinor(day(days, "2026-08-18").taxes), 805);
    assert.equal(toMinor(netSalesOf(day(days, "2026-08-18"))), 11_500);
  });

  it("ignores test orders entirely", () => {
    const days = run([
      order({
        id: "test",
        createdAt: "2026-08-05T14:00:00Z",
        test: true,
        subtotalPriceSet: bag("999.00"),
      }),
    ]);

    assert.deepEqual(days, []);
  });
});

describe("routing to the sales ledger", () => {
  it("keeps untouched orders on the cheap path", () => {
    assert.equal(needsSalesLedger(order({ id: "a", createdAt: "2026-08-01T12:00:00Z" })), false);
  });

  it("routes anything that can have written a second agreement", () => {
    const at = "2026-08-01T12:00:00Z";
    assert.equal(needsSalesLedger(order({ id: "b", createdAt: at, edited: true })), true);
    assert.equal(
      needsSalesLedger(order({ id: "c", createdAt: at, cancelledAt: "2026-08-07T14:00:00Z" })),
      true,
    );
    assert.equal(
      needsSalesLedger(order({ id: "d", createdAt: at, refunds: [{ id: "r1" }] })),
      true,
    );
    assert.equal(
      needsSalesLedger(order({ id: "e", createdAt: at, returnStatus: "RETURNED" })),
      true,
    );
  });
});

describe("order edits", () => {
  it("books added items on the day of the edit, not the day of the order", () => {
    // #2894 was placed on 2026-07-01 and edited on 2026-08-03, adding a 115.00
    // and a 180.00 item. Shopify Analytics puts that 295.00 on 2026-08-03.
    const days = run(
      [
        order({
          id: "2894",
          createdAt: "2026-07-01T21:40:11Z",
          edited: true,
          subtotalPriceSet: bag("1465.00"),
        }),
      ],
      [
        ledger("2894", [
          agreement("2026-07-01T21:40:07Z", "ORDER", [
            sale({
              id: "s1",
              lineType: "PRODUCT",
              quantity: 3,
              totalAmount: bag("1251.90"),
              totalTaxAmount: bag("81.90"),
            }),
          ]),
          agreement("2026-08-03T19:15:53Z", "ORDER_EDIT", [
            sale({
              id: "s2",
              lineType: "PRODUCT",
              quantity: 1,
              totalAmount: bag("123.05"),
              totalTaxAmount: bag("8.05"),
            }),
            sale({
              id: "s3",
              lineType: "PRODUCT",
              quantity: 1,
              totalAmount: bag("192.60"),
              totalTaxAmount: bag("12.60"),
            }),
          ]),
        ]),
      ],
    );

    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-08-03"],
    );
    const edited = day(days, "2026-08-03");
    assert.equal(toMinor(edited.grossSales), 29_500);
    assert.equal(edited.unitsSold, 2);
    // The order was placed before the range, so it is not one of its orders.
    assert.equal(edited.orders, 0);
    assert.equal(toMinor(edited.taxes), 2_065);
  });

  it("does not double count the order's own totals once it has a ledger", () => {
    const days = run(
      [
        order({
          id: "2894",
          createdAt: "2026-08-02T12:00:00Z",
          edited: true,
          subtotalPriceSet: bag("1465.00"),
        }),
      ],
      [
        ledger("2894", [
          agreement("2026-08-02T12:00:00Z", "ORDER", [
            sale({ id: "s1", lineType: "PRODUCT", quantity: 1, totalAmount: bag("390.00") }),
          ]),
        ]),
      ],
    );

    assert.equal(toMinor(day(days, "2026-08-02").grossSales), 39_000);
    assert.equal(day(days, "2026-08-02").orders, 1);
  });
});

describe("returns", () => {
  it("reverses on the refund date, excluding refunded tax", () => {
    // #3185: placed and paid on 08-03, cancelled and fully refunded on 08-07.
    const days = run(
      [
        order({
          id: "3185",
          createdAt: "2026-08-03T13:45:35Z",
          cancelledAt: "2026-08-07T14:59:42Z",
          refunds: [{ id: "r1" }],
          subtotalPriceSet: bag("115.00"),
        }),
      ],
      [
        ledger("3185", [
          agreement("2026-08-03T13:45:31Z", "ORDER", [
            sale({
              id: "s1",
              lineType: "PRODUCT",
              quantity: 1,
              totalAmount: bag("122.48"),
              totalTaxAmount: bag("7.48"),
            }),
            sale({ id: "s2", lineType: "SHIPPING" }),
          ]),
          agreement("2026-08-07T14:59:41Z", "REFUND", [
            sale({
              id: "s3",
              actionType: "RETURN",
              lineType: "PRODUCT",
              quantity: -1,
              totalAmount: bag("-122.48"),
              totalTaxAmount: bag("-7.48"),
            }),
            sale({
              id: "s4",
              actionType: "RETURN",
              lineType: "ADJUSTMENT",
              totalAmount: bag("122.48"),
            }),
          ]),
          agreement("2026-08-07T14:59:41Z", "REFUND", [
            sale({
              id: "s5",
              actionType: "RETURN",
              lineType: "ADJUSTMENT",
              totalAmount: bag("-122.48"),
            }),
          ]),
        ]),
      ],
    );

    const placed = day(days, "2026-08-03");
    assert.equal(toMinor(placed.grossSales), 11_500);
    assert.equal(placed.orders, 1);

    const refunded = day(days, "2026-08-07");
    // 115.00 of goods came back — not the 122.48 that was paid out.
    assert.equal(toMinor(refunded.salesReversals), 11_500);
    // The balancing adjustments cancel, so neither inflates gross sales.
    assert.equal(toMinor(refunded.grossSales), 0);
    assert.equal(refunded.unitsSold, -1);
    assert.equal(toMinor(refunded.taxes), -748);
    assert.equal(toMinor(netSalesOf(refunded)), -11_500);
  });

  it("books a discretionary refund with no returned items as a reversal", () => {
    // #3143: a 10.00 goodwill refund on 08-18 against a 07-31 order. It reaches
    // the ledger only as adjustments, which net to -10.00.
    const days = run(
      [
        order({
          id: "3143",
          createdAt: "2026-07-31T12:30:39Z",
          refunds: [{ id: "r1" }],
          subtotalPriceSet: bag("780.00"),
        }),
      ],
      [
        ledger("3143", [
          agreement("2026-07-31T12:30:36Z", "ORDER", [
            sale({ id: "s1", lineType: "PRODUCT", quantity: 2, totalAmount: bag("780.00") }),
          ]),
          agreement("2026-08-18T18:49:31Z", "REFUND", [
            sale({ id: "s2", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("-10.00") }),
            sale({ id: "s3", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("10.00") }),
          ]),
          agreement("2026-08-18T18:49:31Z", "REFUND", [
            sale({ id: "s4", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("-10.00") }),
          ]),
        ]),
      ],
    );

    const reversed = day(days, "2026-08-18");
    assert.equal(toMinor(reversed.salesReversals), 1_000);
    assert.equal(toMinor(reversed.grossSales), 0);
    // The order itself was placed outside the range and contributes nothing else.
    assert.equal(reversed.orders, 0);
    assert.equal(toMinor(netSalesOf(reversed)), -1_000);
  });

  it("reverses the discount along with the goods", () => {
    const days = run(
      [order({ id: "x", createdAt: "2026-08-05T14:00:00Z", refunds: [{ id: "r" }] })],
      [
        ledger("x", [
          agreement("2026-08-05T14:00:00Z", "ORDER", [
            sale({
              id: "s1",
              lineType: "PRODUCT",
              quantity: 1,
              totalAmount: bag("162.00"),
              totalDiscountAmountBeforeTaxes: bag("18.00"),
            }),
          ]),
          agreement("2026-08-09T10:00:00Z", "REFUND", [
            sale({
              id: "s2",
              actionType: "RETURN",
              lineType: "PRODUCT",
              quantity: -1,
              totalAmount: bag("-162.00"),
              totalDiscountAmountBeforeTaxes: bag("-18.00"),
            }),
          ]),
        ]),
      ],
    );

    assert.equal(toMinor(day(days, "2026-08-05").grossSales), 18_000);
    assert.equal(toMinor(day(days, "2026-08-05").discounts), 1_800);
    // Gross reversed is 180.00, less the 18.00 discount that came off with it.
    assert.equal(toMinor(day(days, "2026-08-09").salesReversals), 16_200);

    const netTotal = days.reduce((acc, d) => acc + toMinor(netSalesOf(d)), 0);
    assert.equal(netTotal, 0);
  });
});

describe("lines that are money but are not sales", () => {
  it("keeps shipping and fees out of net sales while still counting their tax", () => {
    const days = run(
      [order({ id: "s", createdAt: "2026-08-06T14:00:00Z", edited: true })],
      [
        ledger("s", [
          agreement("2026-08-06T14:00:00Z", "ORDER", [
            sale({ id: "s1", lineType: "PRODUCT", quantity: 1, totalAmount: bag("115.00") }),
            sale({
              id: "s2",
              lineType: "SHIPPING",
              totalAmount: bag("12.31"),
              totalTaxAmount: bag("0.31"),
            }),
            sale({ id: "s3", lineType: "DUTY", totalAmount: bag("5.00") }),
            sale({ id: "s4", lineType: "TIP", totalAmount: bag("3.00") }),
            sale({ id: "s5", lineType: "GIFT_CARD", totalAmount: bag("50.00") }),
          ]),
        ]),
      ],
    );

    const only = day(days, "2026-08-06");
    assert.equal(toMinor(only.grossSales), 11_500);
    assert.equal(toMinor(only.shippingCharges), 1_200);
    assert.equal(toMinor(only.taxes), 31);
    assert.equal(toMinor(netSalesOf(only)), 11_500);
  });
});

describe("the window", () => {
  it("drops sales that fall outside the requested range", () => {
    const days = run(
      [order({ id: "w", createdAt: "2026-07-20T12:00:00Z", edited: true })],
      [
        ledger("w", [
          agreement("2026-07-20T12:00:00Z", "ORDER", [
            sale({ id: "s1", lineType: "PRODUCT", quantity: 1, totalAmount: bag("390.00") }),
          ]),
          agreement("2026-08-25T12:00:00Z", "ORDER_EDIT", [
            sale({ id: "s2", lineType: "PRODUCT", quantity: 1, totalAmount: bag("115.00") }),
          ]),
        ]),
      ],
    );

    assert.deepEqual(days, []);
  });

  it("counts an order on the day it was placed even when its ledger is empty in range", () => {
    const days = run([
      order({ id: "p", createdAt: "2026-08-10T14:00:00Z", subtotalPriceSet: bag("180.00") }),
    ]);

    assert.equal(day(days, "2026-08-10").orders, 1);
  });
});

describe("a whole day, against Shopify's own published report", () => {
  /**
   * 2026-08-18 on the connected store. Shopify Analytics reports:
   *
   *   FROM sales SHOW gross_sales, discounts, sales_reversals, net_sales,
   *                   taxes, orders SINCE 2026-08-18 UNTIL 2026-08-18
   *   -> 3160.00  -41.00  -10.00  3109.00  27.97  11
   *
   * Eleven ordinary orders, plus a 10.00 goodwill refund issued that day
   * against an order placed on 2026-07-31. The amounts below are the store's;
   * only the times of day are synthesized, since only the calendar date is
   * load-bearing here.
   */
  const PLACED: [string, string, string, string][] = [
    // name, subtotal, discount, tax
    ["3329", "390.00", "0.00", "0.00"],
    ["3330", "115.00", "0.00", "8.05"],
    ["3331", "390.00", "0.00", "0.00"],
    ["3332", "180.00", "0.00", "0.00"],
    ["3333", "390.00", "0.00", "0.00"],
    ["3334", "103.50", "11.50", "7.76"],
    ["3335", "390.00", "0.00", "0.00"],
    ["3336", "390.00", "0.00", "0.00"],
    ["3337", "162.00", "18.00", "12.16"],
    ["3338", "103.50", "11.50", "0.00"],
    ["3339", "505.00", "0.00", "0.00"],
  ];

  it("reproduces every figure exactly", () => {
    const days = run(
      [
        ...PLACED.map(([name, subtotal, discount, tax]) =>
          order({
            id: name,
            createdAt: "2026-08-18T14:00:00Z",
            subtotalPriceSet: bag(subtotal),
            totalDiscountsSet: bag(discount),
            totalTaxSet: bag(tax),
          }),
        ),
        order({
          id: "3143",
          createdAt: "2026-07-31T12:30:39Z",
          refunds: [{ id: "r1" }],
          subtotalPriceSet: bag("780.00"),
        }),
      ],
      [
        ledger("3143", [
          agreement("2026-07-31T12:30:36Z", "ORDER", [
            sale({ id: "s1", lineType: "PRODUCT", quantity: 2, totalAmount: bag("780.00") }),
          ]),
          agreement("2026-08-18T18:49:31Z", "REFUND", [
            sale({ id: "s2", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("-10.00") }),
            sale({ id: "s3", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("10.00") }),
          ]),
          agreement("2026-08-18T18:49:31Z", "REFUND", [
            sale({ id: "s4", actionType: "RETURN", lineType: "ADJUSTMENT", totalAmount: bag("-10.00") }),
          ]),
        ]),
      ],
      "2026-08-18",
      "2026-08-18",
    );

    const only = day(days, "2026-08-18");
    assert.equal(toMinor(only.grossSales), 316_000);
    assert.equal(toMinor(only.discounts), 4_100);
    assert.equal(toMinor(only.salesReversals), 1_000);
    assert.equal(toMinor(netSalesOf(only)), 310_900);
    assert.equal(toMinor(only.taxes), 2_797);
    assert.equal(only.orders, 11);
  });
});
