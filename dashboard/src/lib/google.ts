// Google Ads pull via GAQL + REST. Avoids the heavyweight gRPC SDK so the
// route can run on Vercel edge or any node runtime.
// Docs: https://developers.google.com/google-ads/api/rest

const ADS_API = "https://googleads.googleapis.com/v17";

async function refreshAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { access_token: string };
  return j.access_token;
}

export type GoogleCampaignDay = {
  campaignId: string;
  campaignName: string;
  date: string;
  costMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
};

export async function googleCampaignsDaily(
  customerId: string,
  since: string,
  until: string,
): Promise<GoogleCampaignDay[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) return [];
  const access = await refreshAccessToken();
  const query = `
    SELECT
      campaign.id, campaign.name,
      segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;
  const r = await fetch(`${ADS_API}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as {
    results?: {
      campaign: { id: string; name: string };
      segments: { date: string };
      metrics: {
        costMicros?: string;
        impressions?: string;
        clicks?: string;
        conversions?: number;
        conversionsValue?: number;
      };
    }[];
  };
  return (j.results || []).map((row) => ({
    campaignId: row.campaign.id,
    campaignName: row.campaign.name,
    date: row.segments.date,
    costMicros: Number(row.metrics.costMicros || 0),
    impressions: Number(row.metrics.impressions || 0),
    clicks: Number(row.metrics.clicks || 0),
    conversions: Number(row.metrics.conversions || 0),
    conversionValue: Number(row.metrics.conversionsValue || 0),
  }));
}
