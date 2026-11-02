// Adversarial QA of M10 wave U3, the cabinet's route (`/[locale]/staff/catalog/cabinets/[ruleId]`). The developer's page
// test tries one malformed encoding, and only for an admitted reader. Here the address is hostile: every refused answer
// of the gate is given an address that does not decode and must still be answered as itself, a table of ids that try to
// leave the segment, name a prototype member or overrun, and the address a rule id is written into must stay under the
// cabinets for every id a book may hold. Reading the source through a store that is down is `unavailable` for an id that
// exists and for one that does not.
import { createTranslator } from "next-intl";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { CabinetDetailEditor } from "@/price-dashboard/cabinet-detail";
import { cabinetPathOf } from "@/price-dashboard/cabinet-paths";
import type { CabinetDetailRead } from "@/price-dashboard/cabinet-list-source";
import { CatalogUnavailableScreen } from "@/price-dashboard/catalog-states";
import {
  StaffForbiddenScreen,
  type StaffShellContext,
} from "@/staff/staff-shell";

import type { StaffPageRead as CatalogPageRead } from "@/lib/server/staff/staff-page";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { pageOf } from "../price-dashboard/dashboard-state-fixture";

const world = vi.hoisted(() => ({
  gate: undefined as CatalogPageRead | undefined,
  detail: undefined as ((ruleId: string) => CabinetDetailRead) | undefined,
  detailAsked: [] as string[],
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: ({ locale }: { locale: "ro" | "ru" }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: (locale === "ru"
          ? ruMessages
          : roMessages) as typeof roMessages,
      }),
    ),
}));
vi.mock("../../src/app/[locale]/staff/catalog/_lib/read-catalog-page", () => ({
  readCatalogPage: () => {
    if (world.gate === undefined) throw new Error("no answer planned");
    return Promise.resolve(world.gate);
  },
}));
vi.mock("@/price-dashboard/cabinet-list-source", () => ({
  readCabinetDetail: (ruleId: string) => {
    world.detailAsked.push(ruleId);
    if (world.detail === undefined) throw new Error("no cabinet planned");
    return Promise.resolve(world.detail(ruleId));
  },
}));

const { default: CabinetPage } = await import(
  "../../src/app/[locale]/staff/catalog/cabinets/[ruleId]/page"
);

const SHELL: StaffShellContext = {
  role: "administrator",
  email: "staff@example.test",
  navigation: ["kitchens", "audit", "cabinets"],
};
const UNDECODABLE = "%E0%A4%A";
const KNOWN_RULE = "cabinet.base-cabinet";

beforeEach(() => {
  world.gate = undefined;
  world.detail = (ruleId) =>
    ruleId === KNOWN_RULE
      ? { kind: "ready", page: pageOf() }
      : { kind: "not-found" };
  world.detailAsked = [];
});

async function pageFor(
  answer: CatalogPageRead,
  ruleId: string,
): Promise<ReactElement<Record<string, unknown>>> {
  world.gate = answer;
  const drawn = await CabinetPage({
    params: Promise.resolve({ locale: "ro", ruleId }),
  });
  if (!isValidElement<Record<string, unknown>>(drawn)) {
    throw new Error("the page drew no element");
  }
  return drawn;
}

describe("an address that does not decode, met by each answer of the gate (the gate comes before the address)", () => {
  const OPERATOR: StaffShellContext = {
    ...SHELL,
    role: "operator",
    navigation: ["kitchens"],
  };

  it.each([
    [
      "a visitor who may not read prices",
      { kind: "forbidden" } as const,
      ForbiddenScreen,
    ],
    [
      "an operator",
      { kind: "staff-forbidden", shell: OPERATOR } as const,
      StaffForbiddenScreen,
    ],
    [
      "a gate that could not read the session",
      { kind: "unavailable" } as const,
      CatalogUnavailableScreen,
    ],
  ])(
    "%s is answered by its own screen, not by the framework's not-found, and the source is never asked",
    async (_who, answer, screen) => {
      const page = await pageFor(answer, UNDECODABLE);

      expect(page.type).toBe(screen);
      expect(world.detailAsked).toEqual([]);
    },
  );

  it("is the framework's not-found only for a reader the gate admitted", async () => {
    await expect(
      pageFor({ kind: "signed-in", shell: SHELL }, UNDECODABLE),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(world.detailAsked).toEqual([]);
  });
});

describe("an address that tries to be something it is not, for an admitted reader", () => {
  const LONG = "x".repeat(10_000);
  const HOSTILE: readonly [string, string, string][] = [
    ["a dot segment", "..", ".."],
    ["a single dot", ".", "."],
    ["an encoded dot segment", "%2e%2e", ".."],
    ["an encoded slash", "a%2Fb", "a/b"],
    ["a lone encoded slash", "%2F", "/"],
    ["a backslash", "a%5Cb", "a\\b"],
    ["a null byte", "cabinet.base-cabinet%00", "cabinet.base-cabinet\u0000"],
    ["a unicode name, encoded", "%C3%A9cole", "école"],
    ["a unicode name, raw", "école", "école"],
    ["a name with a right-to-left mark", "%E2%80%8Fabc", "‏abc"],
    ["an overlong name", LONG, LONG],
    ["a prototype name", "__proto__", "__proto__"],
    ["an encoded prototype name", "%5F%5Fproto%5F%5F", "__proto__"],
    ["constructor", "constructor", "constructor"],
    ["toString", "toString", "toString"],
    ["hasOwnProperty", "hasOwnProperty", "hasOwnProperty"],
    ["a double-encoded dot, decoded once only", "%252E", "%2E"],
    [
      "the known id with a trailing space",
      "cabinet.base-cabinet%20",
      "cabinet.base-cabinet ",
    ],
    [
      "the known id with a leading space",
      "%20cabinet.base-cabinet",
      " cabinet.base-cabinet",
    ],
    [
      "the known id in capitals",
      "CABINET.BASE-CABINET",
      "CABINET.BASE-CABINET",
    ],
    [
      "the known id with a trailing slash",
      "cabinet.base-cabinet%2F",
      "cabinet.base-cabinet/",
    ],
    [
      "the known id with a query",
      "cabinet.base-cabinet%3Fx%3D1",
      "cabinet.base-cabinet?x=1",
    ],
  ];

  it.each(HOSTILE)(
    "%s: the source is asked once with the id decoded once, and the page is the framework's not-found",
    async (_name, segment, decoded) => {
      await expect(
        pageFor({ kind: "signed-in", shell: SHELL }, segment),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(world.detailAsked).toEqual([decoded]);
    },
  );

  it("draws the cabinet only for the exact id, and hands the editor the id as decoded", async () => {
    const page = await pageFor(
      { kind: "signed-in", shell: SHELL },
      "cabinet%2Ebase-cabinet",
    );

    expect(page.type).toBe(CabinetDetailEditor);
    expect(page.props.ruleId).toBe(KNOWN_RULE);
    expect(world.detailAsked).toEqual([KNOWN_RULE]);
  });
});

describe("the address a rule id is written into", () => {
  // A book's rule id is any string up to the identifier bound (`refuseUnusableIdentifier`), so these are ids a stored
  // book may hold, and the link the list draws to each must lead to that cabinet's own page.
  const IDS_A_BOOK_MAY_HOLD = [
    "cabinet.base-cabinet",
    "a/b",
    "a?b",
    "a#b",
    "a b",
    "école",
    "%2e%2e",
  ] as const;

  it.each(IDS_A_BOOK_MAY_HOLD)(
    "%s: resolves, as a browser reads it, to one segment under the cabinets' address",
    (ruleId) => {
      const resolved = new URL(
        cabinetPathOf("ro", ruleId),
        "https://staff.test",
      );
      const underCabinets = "/ro/staff/catalog/cabinets/";

      expect(
        resolved.pathname.startsWith(underCabinets),
        resolved.pathname,
      ).toBe(true);
      expect(resolved.pathname.slice(underCabinets.length)).not.toContain("/");
      expect(resolved.search).toBe("");
      expect(resolved.hash).toBe("");
      expect(
        decodeURIComponent(resolved.pathname.slice(underCabinets.length)),
      ).toBe(ruleId);
    },
  );
});

describe("a rule id that is a dot segment (LOW: no shipped rule is named so; `cabinet-paths.ts` says one segment whatever it holds)", () => {
  it.each([".", ".."])(
    "%j: `encodeURIComponent` leaves the dots as they are, so the link the list draws resolves out of the cabinets' address",
    (ruleId) => {
      const resolved = new URL(
        cabinetPathOf("ro", ruleId),
        "https://staff.test",
      );

      expect(resolved.pathname.startsWith("/ro/staff/catalog/cabinets/")).toBe(
        true,
      );
      expect(resolved.pathname).not.toBe("/ro/staff/catalog/cabinets/");
    },
  );
});
