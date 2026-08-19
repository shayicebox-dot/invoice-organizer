import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import {
  type DailyFinancials,
  dailyNetMargin,
  dailyNetProfit,
  dailyNetSales,
  summarize,
} from "@/lib/finance";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDateShort } from "@/lib/date-range";
import { cn } from "@/lib/cn";

/**
 * The daily ledger. Every row reconciles exactly:
 * Revenue − Ad Spend − Email/SMS − COGS − Shipping − Fees − Other − Fixed = Net Profit.
 *
 * Email/SMS and Fixed are broken out as their own columns rather than folded
 * into another line, so a reader can add the row up and land on Net Profit.
 */
export function DailyPlTable({ days }: { days: DailyFinancials[] }) {
  const rows = [...days].reverse();
  const totals = summarize(days);
  const currency = totals.currency;

  return (
    <TableFrame>
      <thead>
        <tr>
          <Th className="pr-4">Date</Th>
          <Th align="right">Revenue</Th>
          <Th align="right">Ad Spend</Th>
          <Th align="right">Email/SMS</Th>
          <Th align="right">COGS</Th>
          <Th align="right">Shipping</Th>
          <Th align="right">Fees</Th>
          <Th align="right">Other</Th>
          <Th align="right">Fixed</Th>
          <Th align="right">Net Profit</Th>
          <Th align="right">Margin</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={11}>No days in the selected period.</EmptyRow>
        ) : (
          rows.map((day) => {
            const profit = dailyNetProfit(day);
            const isLoss = profit < 0;
            return (
              <tr key={day.date} className="transition-colors hover:bg-surface-muted">
                <Td className="pr-4 font-medium">{formatDateShort(day.date)}</Td>
                <Td align="right" numeric>
                  {formatMoney(dailyNetSales(day), currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.adSpend, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.emailSpend, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.cogs, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.shipping, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.paymentFees, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.variableExpenses, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className="text-ink-secondary">
                  {formatMoney(day.fixedExpenses, currency, { whole: true })}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={cn("font-semibold", isLoss ? "text-negative" : "text-ink")}
                >
                  {formatMoney(profit, currency, { whole: true })}
                </Td>
                <Td align="right" numeric className={cn(isLoss && "text-negative")}>
                  {formatPercent(dailyNetMargin(day))}
                </Td>
              </tr>
            );
          })
        )}
      </tbody>
      {rows.length > 0 ? (
        <tfoot>
          <tr className="bg-surface-muted">
            <Td className="pr-4 font-semibold">Total</Td>
            <Td align="right" numeric className="font-semibold">
              {formatMoney(totals.netSales, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.adSpend, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.emailSpend, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.cogs, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.shipping, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.paymentFees, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.variableExpenses, currency, { whole: true })}
            </Td>
            <Td align="right" numeric>
              {formatMoney(totals.fixedExpenses, currency, { whole: true })}
            </Td>
            <Td
              align="right"
              numeric
              className={cn("font-semibold", totals.netProfit < 0 ? "text-negative" : "text-ink")}
            >
              {formatMoney(totals.netProfit, currency, { whole: true })}
            </Td>
            <Td align="right" numeric className="font-semibold">
              {formatPercent(totals.netMargin)}
            </Td>
          </tr>
        </tfoot>
      ) : null}
    </TableFrame>
  );
}
