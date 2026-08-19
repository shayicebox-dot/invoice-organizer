import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Horizontal scroll container for dense financial tables. */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-slim -mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full min-w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
  scope = "col",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
  scope?: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "whitespace-nowrap border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  numeric = false,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-line/70 py-2.5 text-ink",
        align === "right" ? "text-right" : "text-left",
        numeric && "tabular",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-[13px] text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
