/**
 * No invented business or person may reach the screen.
 *
 * Three fictional stores and a pair of name lists once rendered on the Orders
 * page directly beneath live Shopify totals. They are gone, and this keeps them
 * gone: it scans the shipped source rather than any one module's exports, so a
 * fixture reintroduced anywhere — a new page, a seed file, a fallback branch —
 * fails the build instead of quietly appearing under a real store's name.
 *
 * A placeholder is allowed, but it has to read as one. "Connected store" is
 * obviously not a business; "Northbeam Supply Co." is exactly the kind of
 * plausible name that gets mistaken for real.
 */

import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { describe, it } from "node:test";

/** Names that once shipped, and anything shaped like them. */
const BANNED = [
  "Northbeam",
  "northbeam",
  "Trailhead",
  "trailhead",
  "Aurora Skincare",
  "aurora-skincare",
  "Miles Jensen",
  "Felix Tanaka",
  "Dana Reyes",
  "owner@northbeam.co",
];

const SOURCE_ROOT = new URL("../src/", import.meta.url).pathname;
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".json"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (EXTENSIONS.has(extname(entry.name))) files.push(full);
  }

  return files;
}

describe("sample fixtures", () => {
  it("appear nowhere in the shipped source", async () => {
    const files = await sourceFiles(SOURCE_ROOT);
    assert.ok(files.length > 20, "expected to have scanned the source tree");

    const hits: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, "utf8");
      for (const banned of BANNED) {
        if (contents.includes(banned)) {
          hits.push(`${file.replace(SOURCE_ROOT, "src/")}: ${banned}`);
        }
      }
    }

    assert.deepEqual(hits, [], `sample fixtures found:\n${hits.join("\n")}`);
  });

  it("leaves a placeholder that could not be mistaken for a real business", async () => {
    const { STORES, ORGANIZATION } = await import("../src/lib/data/catalog");
    // Shown only until Shopify answers with the real name.
    assert.equal(STORES[0].name, "Connected store");
    assert.equal(ORGANIZATION.name, "Connected store");
  });

  it("keeps the Orders page off the generated dataset entirely", async () => {
    const page = await readFile(
      new URL("../src/app/(dashboard)/orders/page.tsx", import.meta.url).pathname,
      "utf8",
    );
    // getOrders() is the generated-data reader that used to feed this table.
    assert.equal(page.includes("getOrders"), false, "Orders page still reads generated orders");
    assert.equal(page.includes("getLiveOrders"), true, "Orders page must read live orders");
    assert.equal(page.includes("Shopify Live"), true, "Orders page must carry the source label");
  });

  it("no longer ships a generated-order reader at all", async () => {
    // Deleted rather than left unused: a reader that returns plausible orders
    // is one import away from being wired back in.
    const data = await import("../src/lib/data");
    assert.equal("getOrders" in data, false, "getOrders must not exist");
    assert.equal(typeof data.getLiveOrders, "function");
  });
});
