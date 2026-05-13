import clsx from "clsx";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-dim">
        {cols.map((c) => (
          <th key={c} className="px-4 py-3 font-medium">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={clsx("row-h border-b border-border last:border-0", className)}>{children}</tr>
  );
}

export function TD({
  children,
  className,
  num,
}: {
  children: React.ReactNode;
  className?: string;
  num?: boolean;
}) {
  return (
    <td className={clsx("px-4 py-3 text-ink", num && "tabular-nums", className)}>{children}</td>
  );
}

export function Pos({ children, value }: { children: React.ReactNode; value: number }) {
  return (
    <span className={value >= 0 ? "text-accent" : "text-danger"}>{children}</span>
  );
}
