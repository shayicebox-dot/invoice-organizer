// Klaviyo Reporting API – daily campaign + flow performance per store.
// Docs: https://developers.klaviyo.com/en/reference/query_campaign_values
const REV = "2024-10-15";

async function api<T>(key: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`https://a.klaviyo.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: REV,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Klaviyo ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export type KlaviyoDailyRow = {
  externalId: string;
  name: string;
  date: string;
  recipients: number;
  opens: number;
  clicks: number;
  placed_orders: number;
  revenue: number;
};

export async function klaviyoCampaignDaily(
  apiKey: string,
  since: string,
  until: string,
): Promise<KlaviyoDailyRow[]> {
  // The Reporting API takes statistics + grouping. Returns an array of rows.
  const body = {
    data: {
      type: "campaign-values-report",
      attributes: {
        statistics: ["recipients", "opens", "clicks", "conversions", "conversion_value"],
        timeframe: { start: `${since}T00:00:00`, end: `${until}T23:59:59` },
        conversion_metric_id: "placed-order",
      },
    },
  };
  type Resp = {
    data: {
      attributes: {
        results: {
          groupings: { campaign: string };
          statistics: Record<string, number>;
        }[];
      };
    };
  };
  const j = await api<Resp>(apiKey, `/api/campaign-values-reports/`, body);
  return j.data.attributes.results.map((r) => ({
    externalId: r.groupings.campaign,
    name: r.groupings.campaign,
    date: since,
    recipients: r.statistics.recipients || 0,
    opens: r.statistics.opens || 0,
    clicks: r.statistics.clicks || 0,
    placed_orders: r.statistics.conversions || 0,
    revenue: r.statistics.conversion_value || 0,
  }));
}
