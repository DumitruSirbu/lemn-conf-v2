import { describe, expect, it } from "vitest";

import { codeOf } from "../support/source-import-closure";

/**
 * QA of M10 R4b3: the R-d allow-list (`qa-m10-r3-versions-and-leaks`) admits the seeded mint's route and the room page on
 * the strength of their importing the customer read alone. The list matches text, so it cannot see what these two files
 * would do with the stores; this pins it. The two files reach the dashboard's directory by one name, take no store of their
 * own, and name no draft, archive, publish or write. The customer read in turn reaches the stores only through three named
 * reads. Together with `qa-m10-r4b3-creation-paths`, which counts the store calls a mint and a page load make, a draft or an
 * archive reaching a customer needs an edit that turns one of these red.
 */
const TWO_CREATION_PATHS = [
  "app/api/designs/route.ts",
  "app/[locale]/configurator/room/page.tsx",
] as const;
const CUSTOMER_READ = "lib/server/price-dashboard/new-kitchen-defaults.ts";

const DRAFT_ARCHIVE_PUBLISH_OR_WRITE =
  /\.(?:readVersion|listVersions|readDraft|writeDraft|publish|setActive|save)\b|\bversion-wire\b|\breadVersionBook\b|\bgetPriceStores\b|lib\/server\/price-stores/;

/** Every module specifier the file imports from or re-exports from, in the order written. */
function specifiersOf(path: string): string[] {
  return [...codeOf(path).matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

/** The names the file imports from `specifier`, whatever the line breaks. */
function namesImportedFrom(path: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(
    `import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*"${escaped}"`,
    "g",
  );
  return [...codeOf(path).matchAll(pattern)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .sort();
}

describe("the two creation paths that read the saved defaults", () => {
  it.each(TWO_CREATION_PATHS)(
    "%s reaches the dashboard's directory by the customer read alone",
    (path) => {
      const fromTheDirectory = specifiersOf(path).filter((specifier) =>
        specifier.includes("lib/server/price-dashboard/"),
      );

      expect(fromTheDirectory).toEqual([
        "@/lib/server/price-dashboard/new-kitchen-defaults",
      ]);
    },
  );

  it.each(TWO_CREATION_PATHS)(
    "%s names no draft, archive, publish, write or store of its own",
    (path) => {
      expect(codeOf(path)).not.toMatch(DRAFT_ARCHIVE_PUBLISH_OR_WRITE);
    },
  );

  it.each(TWO_CREATION_PATHS)(
    "%s takes nothing of the customer read but readNewKitchenDefaults",
    (path) => {
      expect(
        namesImportedFrom(
          path,
          "@/lib/server/price-dashboard/new-kitchen-defaults",
        ),
      ).toEqual(["readNewKitchenDefaults"]);
    },
  );
});

describe("the customer read", () => {
  it("reaches the dashboard's directory by three reads and names no draft, archive, publish or write", () => {
    const fromTheDirectory = specifiersOf(CUSTOMER_READ)
      .filter((specifier) => specifier.includes("lib/server/price-dashboard/"))
      .sort();

    expect(fromTheDirectory).toEqual([
      "@/lib/server/price-dashboard/dashboard-state",
      "@/lib/server/price-dashboard/item-ref-reading",
      "@/lib/server/price-dashboard/saved-defaults",
    ]);
    const code = codeOf(CUSTOMER_READ).replace(
      /import\s*\{[^}]*\}\s*from\s*"@\/lib\/server\/price-stores";/,
      "",
    );
    expect(code).not.toMatch(
      /\.(?:readVersion|listVersions|readDraft|writeDraft|publish|setActive|save)\b|\bversion-wire\b|\breadVersionBook\b/,
    );
  });

  it("takes from the dashboard's state module the availability read and its error alone", () => {
    expect(
      namesImportedFrom(
        CUSTOMER_READ,
        "@/lib/server/price-dashboard/dashboard-state",
      ),
    ).toEqual(["DashboardStateUnreadableError", "readDashboardAvailability"]);
  });
});
