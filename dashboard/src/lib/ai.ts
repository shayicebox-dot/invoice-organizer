import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabaseAdmin } from "./supabase";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicKey() });
  return _client;
}

// Compact snapshot we feed Claude. Keep it numbers-only — narrative is its job.
export type InsightPayload = {
  date: string;
  store: string;
  currency: string;
  yesterday: {
    revenue: number;
    netProfit: number;
    marginPct: number;
    adSpend: number;
    mer: number;
    aov: number;
    orders: number;
    newCustomers: number;
    returningPct: number;
    shippingCostPct: number;
  };
  weekTrend: { revenue: number; netProfit: number; adSpend: number; cac: number }[];
  topProducts: { title: string; units: number; revenue: number; margin: number }[];
  losingProducts: { title: string; units: number; revenue: number; margin: number }[];
  campaigns: { platform: string; name: string; spend: number; revenue: number; roas: number }[];
};

const SYSTEM = `You are a senior eCommerce operator and CFO. You write daily insights for a multi-brand DTC owner.
Tone: direct, numerate, no fluff, no marketing buzzwords. Never use vanity metrics — always tie to net profit.
Each insight must include the dollar impact and a concrete next action.
Return JSON only matching the schema described in the user message.`;

const SCHEMA = `{
  "insights": [
    {
      "category": "product" | "ad" | "shipping" | "customer" | "cash",
      "severity": "win" | "info" | "warn" | "critical",
      "title": "string, max 90 chars",
      "body": "2-4 sentences. Cite the numbers.",
      "evidence": { ...key numbers used... },
      "action": "string, one specific next step"
    }
  ]
}`;

export async function generateInsights(payload: InsightPayload) {
  const resp = await client().messages.create({
    model: env.anthropicModel(),
    max_tokens: 2000,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Schema:\n${SCHEMA}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Generate 4-6 insights for ${payload.store} based on this data. JSON only.\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const json = extractJson(text);
  return json.insights as {
    category: string;
    severity: string;
    title: string;
    body: string;
    evidence: Record<string, unknown>;
    action: string;
  }[];
}

function extractJson(s: string): { insights: unknown[] } {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI: no JSON in response");
  return JSON.parse(s.slice(start, end + 1));
}

export async function persistInsights(
  storeId: string,
  generatedFor: string,
  rows: Awaited<ReturnType<typeof generateInsights>>,
) {
  if (!rows.length) return 0;
  const sb = supabaseAdmin();
  const { error } = await sb.from("insights").insert(
    rows.map((r) => ({
      store_id: storeId,
      generated_for: generatedFor,
      model: env.anthropicModel(),
      category: r.category,
      severity: r.severity,
      title: r.title,
      body: r.body,
      evidence: r.evidence,
      action: r.action,
    })),
  );
  if (error) throw error;
  return rows.length;
}
