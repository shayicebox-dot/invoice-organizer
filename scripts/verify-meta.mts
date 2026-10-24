/**
 * Is the Meta connection actually working?
 *
 * Written for the loop that follows a token expiring: paste a new
 * META_ACCESS_TOKEN, run this, read one line. It answers in order — does the
 * token authenticate, how long is it good for, does it reach the configured ad
 * account, and does that account return spend — so a failure points at the step
 * that failed rather than at "Meta is unavailable".
 *
 *   npm run verify:meta                      # last 30 days
 *   npm run verify:meta -- 2026-09-25 2026-10-24
 *
 * Read-only. The token is never printed, logged or echoed — only facts about
 * it, which is the whole point of checking it here rather than with curl.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { getMetaConfig, missingMetaEnvNames, adAccountNode } = await import(
  "../src/lib/meta/config"
);
const { metaGetWith, MetaError } = await import("../src/lib/meta/client");
const { fetchMetaDailySpend } = await import("../src/lib/meta/insights");
const { formatMoney, fromMinor, toMinor } = await import("../src/lib/money");
const { today, addDays } = await import("../src/lib/date-range");

const [startArg, endArg] = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const end = endArg ?? today();
const start = startArg ?? addDays(end, -29);

console.log("\nMeta Ads connection check");
console.log("=".repeat(72));

const config = getMetaConfig();
if (!config) {
  console.log(`\n✗ Not configured. Missing: ${missingMetaEnvNames().join(", ")}`);
  console.log("  Set them in .env.local, then rerun.\n");
  process.exit(1);
}

console.log(`Account : act_${config.adAccountId}`);
console.log(`API     : ${config.apiVersion}`);
console.log(`Range   : ${start} .. ${end}`);
console.log();

const fail = (step: string, detail: string, hint: string) => {
  console.log(`✗ ${step}`);
  console.log(`  ${detail}`);
  console.log(`\n  ${hint}\n`);
  process.exit(2);
};

const describe = (error: unknown): string =>
  error instanceof MetaError
    ? `${error.message}${error.code ? ` (code ${error.code})` : ""}`
    : error instanceof Error
      ? error.message
      : String(error);

// --- 1. Does the token authenticate at all? -------------------------------

interface DebugToken {
  data?: {
    is_valid?: boolean;
    expires_at?: number;
    data_access_expires_at?: number;
    scopes?: string[];
    type?: string;
    error?: { message?: string };
  };
}

let debug: DebugToken;
try {
  // `input_token` and `access_token` are the same token here: a token is
  // always allowed to introspect itself, so this needs no app secret.
  debug = await metaGetWith<DebugToken>(config, "debug_token", {
    input_token: config.accessToken,
  });
} catch (error) {
  fail(
    "The token could not be checked.",
    describe(error),
    "Generate a new token in Meta Business Settings → System Users → Generate New Token, then update META_ACCESS_TOKEN in .env.local.",
  );
  throw new Error("unreachable");
}

const info = debug.data ?? {};

if (info.is_valid === false) {
  fail(
    "The token is not valid.",
    info.error?.message ?? "Meta reports the token as invalid or expired.",
    "Generate a new one in Meta Business Settings → System Users → Generate New Token (permission: ads_read), then update META_ACCESS_TOKEN in .env.local.",
  );
}

console.log("✓ Token authenticates");
console.log(`  Type            ${info.type ?? "unknown"}`);

const describeExpiry = (seconds: number | undefined, label: string) => {
  if (seconds === undefined) return;
  if (seconds === 0) {
    console.log(`  ${label.padEnd(15)} never expires`);
    return;
  }
  const when = new Date(seconds * 1000);
  const days = Math.round((when.getTime() - Date.now()) / 86_400_000);
  console.log(
    `  ${label.padEnd(15)} ${when.toISOString().slice(0, 10)}` +
      (days >= 0 ? `  (${days} day${days === 1 ? "" : "s"} left)` : "  (EXPIRED)"),
  );
};

describeExpiry(info.expires_at, "Expires");
describeExpiry(info.data_access_expires_at, "Data access");

const scopes = info.scopes ?? [];
if (scopes.length > 0) console.log(`  Scopes          ${scopes.join(", ")}`);
if (scopes.length > 0 && !scopes.includes("ads_read")) {
  fail(
    "The token is missing the ads_read permission.",
    `Granted: ${scopes.join(", ")}`,
    "Regenerate the token with ads_read ticked.",
  );
}

// A token that expires soon is not broken yet, but it is about to be, and
// finding out mid-month is how this page went dark in the first place.
const expiresAt = info.expires_at ?? 0;
if (expiresAt > 0) {
  const daysLeft = Math.round((expiresAt * 1000 - Date.now()) / 86_400_000);
  if (daysLeft <= 14) {
    console.log(
      `\n  ⚠ This token expires in ${daysLeft} day(s). A System User token with no` +
        "\n    expiry avoids repeating this every two months.",
    );
  }
}

// --- 2. Does it reach the configured ad account? --------------------------

console.log();
try {
  const account = await metaGetWith<{ name?: string; currency?: string; account_status?: number }>(
    config,
    adAccountNode(config),
    { fields: "name,currency,account_status" },
  );
  console.log("✓ Ad account reachable");
  console.log(`  Name            ${account.name ?? "(unnamed)"}`);
  console.log(`  Currency        ${account.currency ?? "unknown"}`);
  if (account.account_status !== undefined && account.account_status !== 1) {
    console.log(`  ⚠ Account status ${account.account_status} — not ACTIVE.`);
  }
} catch (error) {
  fail(
    `The token cannot read act_${config.adAccountId}.`,
    describe(error),
    "Check META_AD_ACCOUNT_ID, and that the System User is assigned to this ad account in Business Settings.",
  );
}

// --- 3. Does it return spend for the range? -------------------------------

console.log();
try {
  const { days, truncated } = await fetchMetaDailySpend(start, end);
  const total = days.reduce((acc, day) => acc + toMinor(day.spend), 0);

  console.log("✓ Insights returned");
  console.log(`  Days with data  ${days.length}`);
  console.log(`  Total spend     ${formatMoney(fromMinor(total))}`);
  if (truncated) console.log("  ⚠ The result was truncated — the range came back short.");

  if (days.length === 0) {
    console.log(
      "\n  No rows for this range. That is a real answer if the account was not\n" +
        "  running ads, but check the dates against Ads Manager before trusting it.",
    );
  }
} catch (error) {
  fail(
    "Insights could not be read.",
    describe(error),
    "The token authenticates and reaches the account, so this is usually a permission on Insights specifically, or a rate limit. Retry, then check the System User's asset assignment.",
  );
}

console.log("\n✓ Meta is working. Restart the dev server and Net Profit will calculate.\n");
