import clsx from "clsx";
import { AlertTriangle, TrendingUp, Info, Flame, Sparkles } from "lucide-react";

const TONE = {
  win: { icon: TrendingUp, dot: "bg-accent", ring: "ring-accent/25", chip: "text-accent" },
  warn: { icon: AlertTriangle, dot: "bg-warn", ring: "ring-yellow-500/20", chip: "text-warn" },
  critical: { icon: Flame, dot: "bg-danger", ring: "ring-red-500/25", chip: "text-danger" },
  info: { icon: Info, dot: "bg-blue-400", ring: "ring-blue-500/20", chip: "text-blue-400" },
} as const;

export function InsightCard({
  severity = "info",
  category,
  title,
  body,
  action,
}: {
  severity?: keyof typeof TONE;
  category?: string;
  title: string;
  body: string;
  action?: string;
}) {
  const t = TONE[severity] ?? TONE.info;
  const Icon = t.icon;
  return (
    <div className={clsx("card card-h relative p-5 ring-1 animate-fadeIn", t.ring)}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={clsx("h-3.5 w-3.5", t.chip)} />
        <span className={clsx("text-xs font-medium uppercase tracking-wider", t.chip)}>
          {severity}
        </span>
        {category && <span className="pill">{category}</span>}
      </div>
      <div className="text-[15px] font-medium leading-snug text-ink">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
      {action && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg-elev/70 p-2.5 text-xs text-ink-muted">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>
            <span className="text-ink-dim">Next step — </span>
            {action}
          </span>
        </div>
      )}
    </div>
  );
}
