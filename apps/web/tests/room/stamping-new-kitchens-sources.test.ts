// Where the new-kitchen defaults are read from, as a claim about the source (M10 R4b3, rules 3, 6 and 8):
// - only the two creation paths that stamp a customer's new kitchen read them for the customer, and the duplicate route
//   reads them nowhere (a duplicate is not a new kitchen, A-9);
// - the customer read touches no draft and no archive (R-d), which `qa-m10-r3-versions-and-leaks` allows these two
//   importers on the strength of.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");
const CUSTOMER_READ = "lib/server/price-dashboard/new-kitchen-defaults.ts";

const importersOf = (specifier: string): readonly string[] =>
  filesUnder(SOURCE_ROOT)
    .filter((path) => readFileSync(path, "utf8").includes(specifier))
    .map((path) => relative(SOURCE_ROOT, path))
    .sort();

describe("the customer read of the saved defaults", () => {
  it("is imported by the dashboard's own modules and by the room page and the seeded mint, and by nothing else", () => {
    expect(importersOf("price-dashboard/new-kitchen-defaults")).toEqual(
      [
        "app/[locale]/configurator/room/page.tsx",
        "app/api/designs/route.ts",
        "app/api/staff/prices/defaults/route.ts",
        "lib/server/price-dashboard/kitchen-defaults-save.ts",
        "price-dashboard/kitchen-defaults-source.ts",
      ].sort(),
    );
  });

  it("is not reached by the duplicate route or the account's kitchen mutations (rule 8)", () => {
    const accountKitchens = filesUnder(SOURCE_ROOT)
      .map((path) => relative(SOURCE_ROOT, path))
      .filter(
        (path) =>
          path.startsWith("app/api/account/kitchens/") ||
          path.startsWith("lib/server/account/kitchen"),
      );

    expect(accountKitchens.length).toBeGreaterThan(0);
    for (const path of accountKitchens) {
      const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8");
      expect(source, path).not.toMatch(
        /new-kitchen-defaults|stampedDesignOf|stampedSettingsOf|readNewKitchenDefaults/,
      );
    }
  });

  it("names no draft read, archive read or publish", () => {
    const source = readFileSync(resolve(SOURCE_ROOT, CUSTOMER_READ), "utf8");

    expect(source).not.toMatch(
      /\.(?:readVersion|listVersions|readDraft|writeDraft)\b|\bversion-wire\b|\breadVersionBook\b|\bpriceBook\.publish\b/,
    );
  });
});
