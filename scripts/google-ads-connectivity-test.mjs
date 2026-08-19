#!/usr/bin/env node
/**
 * Google Ads connectivity test.
 *
 * Standalone diagnostic — it touches nothing in the app and changes no state.
 * It answers one question: can this machine authenticate to Google Ads with the
 * configured service account and read metrics for the target customer?
 *
 *   node scripts/google-ads-connectivity-test.mjs                        today
 *   node scripts/google-ads-connectivity-test.mjs 2026-08-01 2026-08-10  a range
 *
 * A range prints a per-day breakdown as well as the totals, so figures can be
 * reconciled against the Google Ads UI one day at a time. Dates are calendar
 * dates in the *account's* time zone, which is how Google Ads reports them.
 *
 * Reads from .env.local:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID            manager account
 *   GOOGLE_ADS_CUSTOMER_ID                  account to read
 *   GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE     path to the service account JSON
 *   GOOGLE_ADS_IMPERSONATE_EMAIL            optional, see below
 *   GOOGLE_ADS_API_VERSION                  optional, defaults below
 *   GOOGLE_ADS_ACCESS_TOKEN                 optional, skips the service account
 *                                           and uses this OAuth token directly
 *                                           (e.g. gcloud auth print-access-token)
 *
 * No secret is printed. The developer token, private key and access token are
 * never written to stdout, not even truncated — a partial secret in a terminal
 * scrollback or CI log is still a leaked secret.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JWT } from "google-auth-library";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * v25 was released 2026-07-22 and is scheduled to sunset 2026-08-2027.
 * v21 sunsets this month and v22 in October, so neither is a sane target.
 */
const DEFAULT_API_VERSION = "v25";
const SCOPE = "https://www.googleapis.com/auth/adwords";

// --- .env.local ------------------------------------------------------------

/** Minimal dotenv: `KEY=value`, optional quotes, `#` comments, no expansion. */
function loadEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return {};

  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();

/** Customer ids must be dashless digits in API paths and headers. */
const digitsOnly = (value) => value.replace(/\D/g, "");

const developerToken = env("GOOGLE_ADS_DEVELOPER_TOKEN");
const loginCustomerId = digitsOnly(env("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
const customerId = digitsOnly(env("GOOGLE_ADS_CUSTOMER_ID"));
const keyFile = env("GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE");
const impersonate = env("GOOGLE_ADS_IMPERSONATE_EMAIL");
/** Escape hatch: use a pre-obtained OAuth token instead of the service account. */
const presetAccessToken = env("GOOGLE_ADS_ACCESS_TOKEN");
const apiVersion = env("GOOGLE_ADS_API_VERSION") || DEFAULT_API_VERSION;

// --- Date range ------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reject anything that is not a real calendar date, not just the shape. */
function isValidDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let startDate = null;
let endDate = null;

if (args.length === 1) {
  startDate = endDate = args[0];
} else if (args.length >= 2) {
  [startDate, endDate] = args;
}

if (startDate !== null) {
  const invalid = [startDate, endDate].filter((d) => !isValidDate(d));
  if (invalid.length) {
    console.error(`\nInvalid date(s): ${invalid.join(", ")} — expected YYYY-MM-DD\n`);
    process.exit(2);
  }
  if (startDate > endDate) {
    console.error(`\nStart date ${startDate} is after end date ${endDate}\n`);
    process.exit(2);
  }
}

/** GAQL date predicate, and a label for the report. */
const dateClause =
  startDate === null
    ? "segments.date DURING TODAY"
    : `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
const rangeLabel =
  startDate === null
    ? "today"
    : startDate === endDate
      ? startDate
      : `${startDate} .. ${endDate}`;

const line = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);

console.log("\nGoogle Ads connectivity test");
console.log("═".repeat(62));
console.log(`Date range: ${rangeLabel}`);

// --- 0. Configuration ------------------------------------------------------

console.log("\n0. Configuration");
const missing = [];
if (!developerToken) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
if (!loginCustomerId) missing.push("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
if (!customerId) missing.push("GOOGLE_ADS_CUSTOMER_ID");
if (!keyFile && !presetAccessToken) missing.push("GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE");

// Presence only — the token value is never shown, at any length.
line("developer token", developerToken ? "present" : "MISSING");
line("login customer id", loginCustomerId || "MISSING");
line("target customer id", customerId || "MISSING");
line("service account key", presetAccessToken ? "bypassed" : keyFile || "MISSING");
line("auth mode", presetAccessToken ? "preset access token" : "service account JWT");
line("impersonation", impersonate ? "enabled" : "none (direct access)");
line("api version", apiVersion);

if (missing.length) {
  bad(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

let credentials = null;
if (!presetAccessToken) {
  const keyPath = resolve(ROOT, keyFile);
  if (!existsSync(keyPath)) {
    bad(`Service account key file not found at ${keyFile}`);
    process.exit(1);
  }

  try {
    credentials = JSON.parse(readFileSync(keyPath, "utf8"));
  } catch {
    bad("Service account key file is not valid JSON.");
    process.exit(1);
  }

  if (!credentials.client_email || !credentials.private_key) {
    bad("Service account key file is missing client_email or private_key.");
    process.exit(1);
  }
  ok(`Service account key loaded (${credentials.client_email})`);
}

// --- 1. Authentication -----------------------------------------------------

console.log("\n1. Authentication");
let accessToken;
if (presetAccessToken) {
  accessToken = presetAccessToken;
  ok("Using the preset access token from GOOGLE_ADS_ACCESS_TOKEN");
} else try {
  const jwt = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SCOPE],
    // Domain-wide delegation. Only needed when the service account itself is
    // not a user on the Google Ads account and must impersonate one.
    subject: impersonate || undefined,
  });

  const token = await jwt.getAccessToken();
  accessToken = token?.token;
  if (!accessToken) throw new Error("No access token returned.");
  ok(`Authenticated. OAuth scope: ${SCOPE}`);
} catch (error) {
  bad("AUTHENTICATION FAILED");
  console.log(`  ${error?.message ?? error}`);
  if (String(error?.message).includes("unauthorized_client")) {
    console.log(
      "\n  'unauthorized_client' usually means the service account is not permitted\n" +
        "  to use this scope. Either add the service account email as a user on the\n" +
        "  Google Ads manager account, or set GOOGLE_ADS_IMPERSONATE_EMAIL and grant\n" +
        "  domain-wide delegation for the adwords scope.",
    );
  }
  process.exit(1);
}

// --- Query helper ----------------------------------------------------------

async function searchPage(query, pageToken) {
  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: response.status, ok: response.ok, body };
}

/** Follow nextPageToken so a long range is never silently truncated. */
async function search(query) {
  const results = [];
  let pageToken;
  let pages = 0;

  do {
    const page = await searchPage(query, pageToken);
    if (!page.ok) return { ...page, results };
    results.push(...(page.body?.results ?? []));
    pageToken = page.body?.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 50);

  return { status: 200, ok: true, body: {}, results };
}

/** Pull the useful parts out of a Google Ads error payload. */
function reportError(status, body) {
  const payload = Array.isArray(body) ? body[0] : body;
  const error = payload?.error ?? {};
  console.log(`  HTTP status:   ${status}`);
  if (error.status) console.log(`  Status:        ${error.status}`);
  if (error.message) console.log(`  Message:       ${error.message}`);

  const details = error.details ?? [];
  for (const detail of details) {
    for (const item of detail.errors ?? []) {
      const code = item.errorCode ? Object.entries(item.errorCode)[0] : null;
      if (code) console.log(`  Error code:    ${code[0]} = ${code[1]}`);
      if (item.message) console.log(`  Detail:        ${item.message}`);
    }
    if (detail.requestId) console.log(`  Request id:    ${detail.requestId}`);
  }
}

// --- 2. Customer accessibility --------------------------------------------

console.log(`\n2. Access to customer ${customerId}`);
const meta = await search(
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, " +
    "customer.time_zone, customer.status FROM customer",
);

if (!meta.ok) {
  bad(`Customer ${customerId} is NOT accessible`);
  reportError(meta.status, meta.body);
  process.exit(1);
}

const customer = meta.results?.[0]?.customer ?? {};
ok(`Customer ${customerId} is accessible`);
line("account name", customer.descriptiveName ?? "(none)");
line("currency", customer.currencyCode ?? "(unknown)");
line("time zone", customer.timeZone ?? "(unknown)");
line("status", customer.status ?? "(unknown)");

// --- 3. Today's metrics ----------------------------------------------------

console.log(`\n3. Metrics — ${rangeLabel}`);
console.log(`   (calendar dates in the account time zone: ${customer.timeZone ?? "unknown"})`);

const today = await search(
  "SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    `FROM customer WHERE ${dateClause}`,
);

if (!today.ok) {
  bad("Metrics query FAILED");
  reportError(today.status, today.body);
  process.exit(1);
}

const rows = today.results ?? [];
const currency = customer.currencyCode ?? "";

const totals = { costMicros: 0n, impressions: 0, clicks: 0, conversions: 0, value: 0 };
const byDate = new Map();

for (const row of rows) {
  const m = row.metrics ?? {};
  const date = row.segments?.date ?? "(undated)";
  const costMicros = BigInt(m.costMicros ?? 0);

  totals.costMicros += costMicros;
  totals.impressions += Number(m.impressions ?? 0);
  totals.clicks += Number(m.clicks ?? 0);
  totals.conversions += Number(m.conversions ?? 0);
  totals.value += Number(m.conversionsValue ?? 0);

  const bucket = byDate.get(date) ?? { costMicros: 0n, impressions: 0, clicks: 0, conversions: 0, value: 0 };
  bucket.costMicros += costMicros;
  bucket.impressions += Number(m.impressions ?? 0);
  bucket.clicks += Number(m.clicks ?? 0);
  bucket.conversions += Number(m.conversions ?? 0);
  bucket.value += Number(m.conversionsValue ?? 0);
  byDate.set(date, bucket);
}

/** Micros are exact integers: 1 currency unit = 1,000,000 micros. */
const toUnits = (micros) => Number(micros) / 1_000_000;
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

ok(`Metrics returned (${rows.length} row${rows.length === 1 ? "" : "s"})`);

if (byDate.size > 1) {
  console.log("\n  Per day — compare these against the Google Ads UI:\n");
  console.log(
    "  " +
      "DATE".padEnd(12) +
      "SPEND".padStart(12) +
      "IMPR".padStart(12) +
      "CLICKS".padStart(10) +
      "CONV".padStart(10) +
      "CONV VALUE".padStart(14),
  );
  console.log("  " + "-".repeat(70));
  for (const date of [...byDate.keys()].sort()) {
    const d = byDate.get(date);
    console.log(
      "  " +
        date.padEnd(12) +
        num(toUnits(d.costMicros), 2).padStart(12) +
        num(d.impressions).padStart(12) +
        num(d.clicks).padStart(10) +
        num(d.conversions, 2).padStart(10) +
        num(d.value, 2).padStart(14),
    );
  }
  console.log("  " + "-".repeat(70));
  console.log(
    "  " +
      "TOTAL".padEnd(12) +
      num(toUnits(totals.costMicros), 2).padStart(12) +
      num(totals.impressions).padStart(12) +
      num(totals.clicks).padStart(10) +
      num(totals.conversions, 2).padStart(10) +
      num(totals.value, 2).padStart(14),
  );
  console.log();
}

console.log("  Totals");
line("total spend", `${num(toUnits(totals.costMicros), 2)} ${currency}`);
line("cost_micros (raw)", totals.costMicros.toString());
line("impressions", num(totals.impressions));
line("clicks", num(totals.clicks));
line("conversions", num(totals.conversions, 2));
line("conversion value", `${num(totals.value, 2)} ${currency}`);

if (rows.length === 0) {
  warn("No rows returned for this range.");
  console.log("  Google Ads omits days with no activity entirely. This is a successful call,");
  console.log("  not an error — it means the account served nothing in this window.");
}

console.log("\n  Column mapping for reconciliation against the Google Ads UI:");
console.log("    total spend      -> Cost");
console.log("    conversions      -> Conversions   (not 'All conversions')");
console.log("    conversion value -> Conv. value   (not 'All conv. value')");

console.log("\n" + "═".repeat(62));
ok("Connectivity test PASSED");
console.log();
