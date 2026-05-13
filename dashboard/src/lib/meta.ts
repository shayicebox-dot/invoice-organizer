import { env } from "./env";

// Pulls daily campaign-level insights from the Meta Marketing API.
// Docs: https://developers.facebook.com/docs/marketing-api/insights
const GRAPH = "https://graph.facebook.com/v21.0";

export type MetaCampaignDay = {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export async function metaCampaignsDaily(
  adAccountId: string,
  since: string,
  until: string,
): Promise<MetaCampaignDay[]> {
  const token = env.metaToken();
  if (!token) return [];
  const params = new URLSearchParams({
    access_token: token,
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    limit: "500",
  });
  const url = `${GRAPH}/${adAccountId}/insights?${params.toString()}`;
  const out: MetaCampaignDay[] = [];
  let next: string | null = url;
  while (next) {
    const r = await fetch(next, { cache: "no-store" });
    if (!r.ok) throw new Error(`Meta ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { data: MetaCampaignDay[]; paging?: { next?: string } };
    out.push(...j.data);
    next = j.paging?.next ?? null;
  }
  return out;
}

export function metaPurchaseRevenue(row: MetaCampaignDay): number {
  const v = row.action_values?.find((a) => a.action_type === "purchase")?.value;
  return v ? Number(v) : 0;
}
