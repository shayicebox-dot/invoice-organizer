# Step-by-step roadmap

This is written for a non-technical owner. Every step is "open this URL, paste
this value, click this button." Estimated time end-to-end: **about one focused
afternoon** to get the dashboard live with real numbers.

---

## Phase 0 — Accounts you'll need (15 min)

You probably already have most of these. If not, sign up — free tiers are fine
for getting started.

- [ ] **GitHub** account (you already have a repo: `shayicebox-dot/invoice-organizer`)
- [ ] **Vercel** account, logged in with GitHub → https://vercel.com/signup
- [ ] **Supabase** account, free tier → https://supabase.com
- [ ] **Anthropic** API key → https://console.anthropic.com
- [ ] **Meta for Developers** account (for Marketing API access)
- [ ] **Google Ads** developer token request (optional, you can do this after launch)

---

## Phase 1 — Create the database (10 min)

1. Go to https://app.supabase.com → **New project**.
2. Region: pick the one closest to where you live.
3. Save the **database password** somewhere safe (1Password).
4. Wait ~2 minutes for it to provision.
5. Click **SQL Editor** in the left sidebar → **New query**.
6. Open the file `dashboard/supabase/schema.sql` from this repo, copy the
   entire contents, paste into the editor, click **Run**.
7. Click **Settings → API** in the sidebar. Copy three values, you'll need them
   in the next phase:
   - **Project URL** (something like `https://abcd.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this secret — full database access)

---

## Phase 2 — Get your Shopify tokens (5 min per store)

Repeat this for each brand: Kicksbox, ICEBOX, BRUNO.

1. Log into the Shopify admin for the store.
2. **Settings → Apps and sales channels → Develop apps**.
3. **Create an app** → name it "Profit Dashboard".
4. **Configure Admin API scopes**. Enable these (read-only is fine):
   - `read_orders`
   - `read_products`
   - `read_inventory`
   - `read_customers`
   - `read_fulfillments`
   - `read_analytics`
   - `read_marketing_events`
5. Click **Install app**.
6. Copy the **Admin API access token** (starts with `shpat_`). Save it.

---

## Phase 3 — Get your Meta token (10 min)

1. Go to https://developers.facebook.com → **My Apps → Create App** → **Business**.
2. Open the app → **Marketing API** → **Get Started**.
3. **Tools → System Users** in Business Manager → **Add** → assign your ad accounts.
4. Generate a long-lived access token with `ads_read` permission. Copy it.
5. Get your **Ad Account IDs** (start with `act_…`) from Ads Manager.

> **Google Ads** is the slowest setup (needs a developer token, 1-3 days for
> approval). Skip it for the first deploy — wire it up later by setting the
> `GOOGLE_ADS_*` env vars on Vercel.

---

## Phase 4 — Klaviyo (2 min per brand)

For each brand that uses Klaviyo:

1. Klaviyo → **Account** → **Settings → API Keys**.
2. **Create Private API Key**, scope `Read-only`. Copy.

---

## Phase 5 — Configure the project locally (5 min, optional)

If you'd rather skip local setup and deploy straight to Vercel, jump to Phase 6.

```bash
cd dashboard
cp .env.example .env.local
# Open .env.local in any text editor and paste in all your tokens.

npm install
npm run dev
# Opens http://localhost:3000 with the mock data UI.
```

---

## Phase 6 — Deploy to Vercel (10 min)

1. Push the repo to GitHub (this branch already exists:
   `claude/ecommerce-profit-dashboard-9oqSX`).
2. Go to https://vercel.com/new → **Import** → pick this repo.
3. **Root directory**: set to `dashboard`.
4. **Framework**: Next.js (auto-detected).
5. **Environment Variables**: open `.env.example`, paste every variable into
   Vercel with your real values.
6. Click **Deploy**.
7. Once deployed, copy the project URL — you'll see the dashboard with mock data.

---

## Phase 7 — First sync (2 min)

The cron will run every 15 minutes automatically, but you can trigger it once
manually to backfill the last 90 days:

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/sync?days=90" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

When it's done, refresh the dashboard. Real numbers replace the mock data.

---

## Phase 8 — Tell the system your costs (the most important step)

The dashboard's accuracy lives or dies by your cost data. For every product
you sell, you need to enter:

| Field | What it is | Example |
|---|---|---|
| `unit_cost` | What you pay your supplier per unit | $4.20 |
| `pick_pack_cost` | 3PL handling fee per unit | $0.55 |
| `packaging_cost` | Box, tape, polybag per unit | $0.30 |
| `shipping_cost` | Avg outbound shipping per unit | $6.40 |
| `duties_pct` | Import duty as % of revenue | 0.05 |

Until the cost-editor UI ships:

1. Supabase → **Table Editor** → `variants` — find the variant IDs you want to set.
2. **Table Editor** → `product_costs` → **Insert row** for each variant.

Once these are in, run the sync again — order-level profits update everywhere.

---

## Phase 9 — Turn on AI insights

You're already set. The daily cron at 07:00 UTC will call
`/api/insights/generate`, which:

1. Builds a numbers-only snapshot of yesterday.
2. Sends it to Claude with a CFO-style system prompt.
3. Persists 4–6 insights to Supabase.
4. They appear at `/insights` in the dashboard.

To force a generation now: hit the **Generate now** button on the Insights
page, or `curl -X POST .../api/insights/generate?secret=...`.

---

## Phase 10 — What to build next

In rough priority order:

1. **Cost editor UI** — inline edit `product_costs` from the Products page.
2. **Bundle composition editor** — link bundle SKUs to their components.
3. **Email/Slack daily digest** — push the top 3 insights every morning.
4. **Multi-user auth** — Supabase Auth + RLS policies (the schema already
   has RLS enabled, just needs `auth.uid()` policies).
5. **Forecasting** — train on `daily_store_metrics` to project 30/60/90 days.
6. **Anomaly detection** — flag any KPI > 2σ from trailing 30-day baseline.
7. **Profit calendar heatmap** — green/red days at a glance.

---

## Cost expectations

| Item | Cost |
|---|---|
| Vercel Hobby | $0/mo (fine until ~100GB bandwidth) |
| Supabase Free | $0/mo (500MB DB; upgrade to Pro $25/mo when you hit it) |
| Anthropic API | ~$0.10–0.50/day for daily insights on 3 brands |
| Domain (optional) | ~$12/year |

You can run this for under $30/month at meaningful scale.
