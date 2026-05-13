import { InsightCard } from "@/components/InsightCard";
import { MOCK_INSIGHTS } from "@/lib/mock";
import { Sparkles } from "lucide-react";

export default function InsightsPage() {
  const grouped = MOCK_INSIGHTS.reduce<Record<string, typeof MOCK_INSIGHTS>>((acc, i) => {
    (acc[i.category] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-accent" /> AI insights
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Generated daily from your orders, ad spend, and inventory. Claude analyzes the numbers — you decide.
          </p>
        </div>
        <button className="btn-primary">
          <Sparkles className="h-3.5 w-3.5" /> Generate now
        </button>
      </header>

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-dim">
            {cat}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {items.map((i, idx) => (
              <InsightCard
                key={`${cat}-${idx}`}
                severity={i.severity as never}
                category={i.category}
                title={i.title}
                body={i.body}
                action={i.action}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
