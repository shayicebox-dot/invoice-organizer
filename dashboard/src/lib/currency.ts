import { supabaseAdmin } from "./supabase";

// Hits exchangerate.host (no key required, generous free tier).
// Caches into fx_rates so order snapshots always have a rate at the moment of sync.
export async function fetchLatestRates(base = "USD"): Promise<Record<string, number>> {
  const url = `https://api.exchangerate.host/latest?base=${base}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FX fetch failed: ${r.status}`);
  const j = (await r.json()) as { rates: Record<string, number> };
  return j.rates;
}

export async function persistRates(base = "USD") {
  const rates = await fetchLatestRates(base);
  const rows = Object.entries(rates).map(([quote, rate]) => ({
    base,
    quote,
    rate,
  }));
  await supabaseAdmin().from("fx_rates").insert(rows);
  return rows.length;
}

// Convert any amount → USD using the most recent rate we have on file.
export async function toUSD(amount: number, currency: string): Promise<number> {
  if (currency === "USD") return amount;
  const { data } = await supabaseAdmin()
    .from("fx_rates")
    .select("rate")
    .eq("base", "USD")
    .eq("quote", currency)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) return amount; // graceful fallback so a sync never crashes on FX
  return amount / Number(data.rate);
}

export function formatMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}
