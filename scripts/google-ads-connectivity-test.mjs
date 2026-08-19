#!/usr/bin/env node
/**
 * Google Ads connectivity test.
 *
 * Standalone diagnostic — it touches nothing in the app and changes no state.
 * It answers one question: can this machine authenticate to Google Ads with the
 * configured service account and read today's metrics for the target customer?
 *
 *   node scripts/google-ads-connectivity-test.mjs
 *
 * Reads from .env.local:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID            manager account
 *   GOOGLE_ADS_CUSTOMER_ID                  account to read
 *   GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE     path to the service account JSON
 *   GOOGLE_ADS_IMPERSONATE_EMAIL            optional, see below
 *   GOOGLE_ADS_API_VERSION                  optional, defaults below
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
const apiVersion = env("GOOGLE_ADS_API_VERSION") || DEFAULT_API_VERSION;

const line = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);

console.log("\nGoogle Ads connectivity test");
console.log("═".repeat(62));

// --- 0. Configuration ------------------------------------------------------

console.log("\n0. Configuration");
const missing = [];
if (!developerToken) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
if (!loginCustomerId) missing.push("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
if (!customerId) missing.push("GOOGLE_ADS_CUSTOMER_ID");
if (!keyFile) missing.push("GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE");

// Presence only — the token value is never shown, at any length.
line("developer token", developerToken ? "present" : "MISSING");
line("login customer id", loginCustomerId || "MISSING");
line("target customer id", customerId || "MISSING");
line("service account key", keyFile || "MISSING");
line("impersonation", impersonate ? "enabled" : "none (direct access)");
line("api version", apiVersion);

if (missing.length) {
  bad(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const keyPath = resolve(ROOT, keyFile);
if (!existsSync(keyPath)) {
  bad(`Service account key file not found at ${keyFile}`);
  process.exit(1);
}

let credentials;
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

// --- 1. Authentication -----------------------------------------------------

console.log("\n1. Authentication");
let accessToken;
try {
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

async function search(query) {
  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
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

const customer = meta.body?.results?.[0]?.customer ?? {};
ok(`Customer ${customerId} is accessible`);
line("account name", customer.descriptiveName ?? "(none)");
line("currency", customer.currencyCode ?? "(unknown)");
line("time zone", customer.timeZone ?? "(unknown)");
line("status", customer.status ?? "(unknown)");

// --- 3. Today's metrics ----------------------------------------------------

console.log("\n3. Today's metrics (segments.date DURING TODAY)");
const today = await search(
  "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM customer WHERE segments.date DURING TODAY",
);

if (!today.ok) {
  bad("Metrics query FAILED");
  reportError(today.status, today.body);
  process.exit(1);
}

const rows = today.body?.results ?? [];
const totals = { costMicros: 0n, impressions: 0, clicks: 0, conversions: 0, value: 0 };
for (const row of rows) {
  const m = row.metrics ?? {};
  totals.costMicros += BigInt(m.costMicros ?? 0);
  totals.impressions += Number(m.impressions ?? 0);
  totals.clicks += Number(m.clicks ?? 0);
  totals.conversions += Number(m.conversions ?? 0);
  totals.value += Number(m.conversionsValue ?? 0);
}

const currency = customer.currencyCode ?? "";
// Micros are exact integers; 1 unit = 1,000,000 micros. Formatted only for
// display here — the integration converts micros straight to minor units.
const cost = Number(totals.costMicros) / 1_000_000;

ok(`Metrics returned (${rows.length} row${rows.length === 1 ? "" : "s"})`);
line("spend / cost", `${cost.toFixed(2)} ${currency}`);
line("cost_micros (raw)", totals.costMicros.toString());
line("impressions", totals.impressions.toLocaleString("en-US"));
line("clicks", totals.clicks.toLocaleString("en-US"));
line("conversions", totals.conversions.toFixed(2));
line("conversion value", `${totals.value.toFixed(2)} ${currency}`);

if (rows.length === 0) {
  warn("No rows for today — the account had no activity yet today, or the day");
  console.log("  has not started in the account's time zone. This is a successful call.");
}

console.log("\n" + "═".repeat(62));
ok("Connectivity test PASSED");
console.log();
