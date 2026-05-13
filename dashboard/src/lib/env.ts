// Centralized env reader. Throws loud, clear errors when something is missing.
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  supabaseUrl: () => need("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => need("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => need("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => need("ANTHROPIC_API_KEY"),
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  cronSecret: () => need("CRON_SECRET"),
  fxBase: () => process.env.FX_BASE_CURRENCY || "USD",
  metaToken: () => opt("META_ACCESS_TOKEN"),
  metaAccounts: () =>
    (opt("META_AD_ACCOUNTS") || "").split(",").map((s) => s.trim()).filter(Boolean),
  klaviyoKey: (storeSlug: string) =>
    opt(`KLAVIYO_${storeSlug.toUpperCase()}_API_KEY`),
};

export type StoreConfig = {
  slug: string;
  domain: string;
  token: string;
  currency: string;
};

export function storeConfigs(): StoreConfig[] {
  const slugs = (process.env.SHOPIFY_STORES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return slugs.map((slug) => {
    const up = slug.toUpperCase();
    return {
      slug,
      domain: need(`SHOPIFY_${up}_DOMAIN`),
      token: need(`SHOPIFY_${up}_TOKEN`),
      currency: process.env[`SHOPIFY_${up}_CURRENCY`] || "USD",
    };
  });
}
