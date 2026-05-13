"use client";
import { Search, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";

const STORES = [
  { slug: "all", name: "All brands" },
  { slug: "kicksbox", name: "Kicksbox", currency: "USD" },
  { slug: "icebox", name: "ICEBOX", currency: "ILS" },
  { slug: "bruno", name: "BRUNO", currency: "USD" },
];

export function Topbar() {
  const [store, setStore] = useState(STORES[0]);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState("30d");

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border bg-bg/80 px-6 backdrop-blur">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-sm hover:border-border-strong"
        >
          <span className="h-2 w-2 rounded-full bg-accent" />
          {store.name}
          <ChevronDown className="h-3.5 w-3.5 text-ink-dim" />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-2 w-56 overflow-hidden rounded-lg border border-border bg-bg-card shadow-card">
            {STORES.map((s) => (
              <button
                key={s.slug}
                onClick={() => {
                  setStore(s);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-hover"
              >
                <span>{s.name}</span>
                <span className="text-xs text-ink-dim">{s.currency || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative flex flex-1 max-w-md items-center">
        <Search className="absolute left-3 h-4 w-4 text-ink-dim" />
        <input
          placeholder="Search orders, products, customers…"
          className="w-full rounded-lg border border-border bg-bg-elev py-1.5 pl-9 pr-3 text-sm placeholder:text-ink-dim focus:border-border-strong focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {["7d", "30d", "90d", "MTD"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                "px-2.5 py-1 text-xs " +
                (range === r
                  ? "bg-bg-hover text-ink"
                  : "text-ink-muted hover:bg-bg-elev")
              }
            >
              {r}
            </button>
          ))}
        </div>
        <button className="btn">
          <RefreshCw className="h-3.5 w-3.5" />
          Sync
        </button>
      </div>
    </header>
  );
}
