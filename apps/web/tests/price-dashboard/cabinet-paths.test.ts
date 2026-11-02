// The two addresses of the cabinets. The staff proxy marks both as staff pages (never indexed, never cached) and its
// matcher reaches the cabinet's even when the rule id ends like a static file; a rule id with a dot is one segment.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { routing } from "../../src/i18n/routing";
import {
  cabinetPathOf,
  cabinetsPathOf,
} from "../../src/price-dashboard/cabinet-paths";
import { config, proxy } from "../../src/proxy";

const ORIGIN = "https://lemnaria.test";
const ROUTES = join(
  import.meta.dirname,
  "../../src/app/[locale]/staff/catalog/cabinets",
);

function isMarkedAsStaffPage(path: string): boolean {
  const answer = proxy(new NextRequest(new URL(path, ORIGIN)));
  if (answer instanceof Promise) throw new Error("the answer waited");
  return (
    answer.headers.get("x-robots-tag") === "noindex, nofollow" &&
    answer.headers.get("cache-control") === "private, no-store"
  );
}

describe.each(routing.locales)(
  "the cabinet addresses in locale %s",
  (locale) => {
    const ruleIds = [
      ...SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId }) => ruleId),
      "cabinet.looks-like-a-file.png",
    ];

    it("marks the list and every cabinet's page as a staff page the proxy reaches", () => {
      for (const path of [
        cabinetsPathOf(locale),
        ...ruleIds.map((ruleId) => cabinetPathOf(locale, ruleId)),
      ]) {
        expect(path.startsWith(`/${locale}/staff/catalog/cabinets`)).toBe(true);
        expect(isMarkedAsStaffPage(path), path).toBe(true);
        expect(
          unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` }),
          path,
        ).toBe(true);
      }
    });

    it("writes a rule id under the list's own address, as one segment whatever it holds", () => {
      expect(cabinetPathOf(locale, "cabinet.base-cabinet")).toBe(
        `${cabinetsPathOf(locale)}/cabinet.base-cabinet`,
      );
      expect(
        cabinetPathOf(locale, "a/b?c#d").slice(
          cabinetsPathOf(locale).length + 1,
        ),
      ).not.toMatch(/[/?#]/);
    });
  },
);

describe("the routes", () => {
  it("has a page for the list and one for a cabinet, the id a dynamic segment of its own", () => {
    expect(existsSync(join(ROUTES, "page.tsx"))).toBe(true);
    expect(existsSync(join(ROUTES, "[ruleId]/page.tsx"))).toBe(true);
  });
});
