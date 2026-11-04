// The three addresses under "Publicare prețuri": the pending prices, the history and one version. They stand under the publish
// page's own address, so the staff proxy marks them as staff pages (never indexed, never cached) without a list of their own,
// and a version's address never reads as the history.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { routing } from "../../src/i18n/routing";
import {
  historyPathOf,
  publishPathOf,
  versionPathOf,
} from "../../src/price-dashboard/publish-paths";
import { config, proxy } from "../../src/proxy";

const ORIGIN = "https://lemnaria.test";
const VERSION_ID = "sample-version-00000004";
const ROUTES = join(
  import.meta.dirname,
  "../../src/app/[locale]/staff/catalog/publish",
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
  "the publish addresses in locale %s",
  (locale) => {
    it.each([
      ["the pending prices", publishPathOf(locale)],
      ["the history", historyPathOf(locale)],
      ["one version", versionPathOf(locale, VERSION_ID)],
    ])("%s is a staff page the proxy reaches and marks", (_name, path) => {
      expect(path.startsWith(`/${locale}/staff/catalog/publish`)).toBe(true);
      expect(isMarkedAsStaffPage(path)).toBe(true);
      expect(
        unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` }),
      ).toBe(true);
    });

    it("writes a version under its own segment, never under the history's", () => {
      expect(versionPathOf(locale, VERSION_ID)).toBe(
        `${publishPathOf(locale)}/${VERSION_ID}`,
      );
      expect(historyPathOf(locale)).toBe(`${publishPathOf(locale)}/history`);
    });

    it("keeps an id that is not a plain segment in one segment", () => {
      const path = versionPathOf(locale, "a/b?c#d");

      expect(path.slice(publishPathOf(locale).length + 1)).not.toMatch(/[/?#]/);
    });
  },
);

describe("the routes", () => {
  it("has a page for each address, the history as a segment of its own so a version id never reads as it", () => {
    expect(existsSync(join(ROUTES, "page.tsx"))).toBe(true);
    expect(existsSync(join(ROUTES, "history/page.tsx"))).toBe(true);
    expect(existsSync(join(ROUTES, "[versionId]/page.tsx"))).toBe(true);
  });
});
