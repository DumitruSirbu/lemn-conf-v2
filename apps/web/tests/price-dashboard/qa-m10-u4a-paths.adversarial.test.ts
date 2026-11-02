// The hardware pages' addresses, held to the staff proxy as `cabinet-paths.test.ts` holds the cabinets' (marked as a
// staff page, reached by its matcher, one segment whatever the id holds). A class's id is minted by the server and is
// one segment under the list's own address; the creation form's segment, `new`, is the one a class's own address must
// never be.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { routing } from "../../src/i18n/routing";
import {
  hardwareClassPathOf,
  hardwareNewPathOf,
  hardwarePathOf,
} from "../../src/price-dashboard/hardware-paths";
import { config, proxy } from "../../src/proxy";

const ORIGIN = "https://lemnaria.test";
const ROUTES = join(
  import.meta.dirname,
  "../../src/app/[locale]/staff/catalog/hardware",
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
  "the hardware addresses in locale %s",
  (locale) => {
    const tierIds = [
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
      "hardware.looks-like-a-file.png",
      "hardware.Ab_-9xZ",
      "hardware.with space",
      "hardware.ö",
    ];

    it("marks the list, the form and every class's page as a staff page the proxy reaches", () => {
      for (const path of [
        hardwarePathOf(locale),
        hardwareNewPathOf(locale),
        ...tierIds.map((tierId) => hardwareClassPathOf(locale, tierId)),
      ]) {
        expect(path.startsWith(`/${locale}/staff/catalog/hardware`), path).toBe(
          true,
        );
        expect(isMarkedAsStaffPage(path), path).toBe(true);
        expect(
          unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` }),
          path,
        ).toBe(true);
      }
    });

    it("gives the creation form an address that is not any class's: the shipped classes and a server-shaped id never collide with it", () => {
      for (const tierId of [
        ...SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
        "hardware.k3j9x_Q-1",
      ]) {
        expect(hardwareClassPathOf(locale, tierId)).not.toBe(
          hardwareNewPathOf(locale),
        );
      }
    });

    propertyTest.prop(
      [fc.string({ unit: "binary", minLength: 1, maxLength: 24 })],
      {
        numRuns: 500,
      },
    )(
      "writes any id as exactly one segment under the list, which a URL parser keeps as one segment and never folds into the list or above it",
      (tierId) => {
        const path = hardwareClassPathOf(locale, tierId);
        const parsed = new URL(path, ORIGIN).pathname;
        const base = `${hardwarePathOf(locale)}/`;

        expect(parsed.startsWith(base)).toBe(true);
        expect(parsed.slice(base.length)).not.toContain("/");
        expect(parsed.slice(base.length)).not.toBe("");
        expect(/^\.{1,2}$/.test(parsed.slice(base.length))).toBe(false);
      },
    );

    it("has a route for each of its three pages, the form's beside the class's, so `new` is the form's and nothing else's", () => {
      expect(existsSync(join(ROUTES, "page.tsx"))).toBe(true);
      expect(existsSync(join(ROUTES, "new/page.tsx"))).toBe(true);
      expect(existsSync(join(ROUTES, "[tierId]/page.tsx"))).toBe(true);
    });
  },
);
