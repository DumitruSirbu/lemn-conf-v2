// What one cabinet's page draws for each answer of the catalog gate and of the cabinet's source. Both are replaced:
// this is the page's own mapping. The address is judged only once the gate has admitted the reader, so a caller who may
// not read prices is answered alike for a cabinet that exists and one that does not.
import { createTranslator } from "next-intl";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { CabinetDetailEditor } from "@/price-dashboard/cabinet-detail";
import { CabinetListUnavailableScreen } from "@/price-dashboard/cabinet-list";
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
  gateAsked: [] as { locale: string; page: string }[],
  detail: undefined as CabinetDetailRead | undefined,
  detailAsked: [] as unknown[][],
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
  readCatalogPage: (request: { locale: string; page: string }) => {
    world.gateAsked.push(request);
    if (world.gate === undefined) throw new Error("no answer planned");
    return Promise.resolve(world.gate);
  },
}));
vi.mock("@/price-dashboard/cabinet-list-source", () => ({
  readCabinetDetail: (...args: unknown[]) => {
    world.detailAsked.push(args);
    if (world.detail === undefined) throw new Error("no cabinet planned");
    return Promise.resolve(world.detail);
  },
}));

const { default: CabinetPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/catalog/cabinets/[ruleId]/page"
);

const SHELL: StaffShellContext = {
  role: "administrator",
  email: "staff@example.test",
  navigation: ["kitchens", "audit", "cabinets"],
};
const RULE = "cabinet.base-cabinet";

beforeEach(() => {
  world.gate = undefined;
  world.gateAsked = [];
  world.detail = { kind: "ready", page: pageOf() };
  world.detailAsked = [];
});

async function pageFor(
  answer: CatalogPageRead,
  ruleId = RULE,
  locale = "ro",
): Promise<ReactElement<Record<string, unknown>>> {
  world.gate = answer;
  const drawn = await CabinetPage({
    params: Promise.resolve({ locale, ruleId }),
  });
  if (!isValidElement<Record<string, unknown>>(drawn)) {
    throw new Error("the page drew no element");
  }
  return drawn;
}

describe("the cabinet's page for each answer of the catalog gate", () => {
  it("is the framework's not-found for a locale the site does not serve, before the gate is asked", async () => {
    world.gate = { kind: "unavailable" };

    await expect(pageFor({ kind: "unavailable" }, RULE, "xx")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(world.gateAsked).toEqual([]);
  });

  it("asks the gate for the cabinets page, in the page's language", async () => {
    await pageFor({ kind: "unavailable" });

    expect(world.gateAsked).toEqual([{ locale: "ro", page: "cabinets" }]);
  });

  it("draws the cabinet for an administrator, handing the editor the frame, the source's page and the rule's id", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(CabinetDetailEditor);
    expect(page.props).toEqual({
      locale: "ro",
      context: SHELL,
      page: world.detail?.kind === "ready" ? world.detail.page : undefined,
      ruleId: RULE,
    });
  });

  it("asks the source once, with the id as the address spelt it, handing it no cookies and no headers", async () => {
    await pageFor({ kind: "signed-in", shell: SHELL }, "cabinet.base-cabinet");

    expect(world.detailAsked).toEqual([["cabinet.base-cabinet"]]);
  });

  it("decodes the id the framework hands over encoded", async () => {
    await pageFor({ kind: "signed-in", shell: SHELL }, "cabinet%2Estranger");

    expect(world.detailAsked).toEqual([["cabinet.stranger"]]);
  });

  it("is the framework's not-found for an id that is not valid encoding, after the gate, and asks the source nothing", async () => {
    await expect(
      pageFor({ kind: "signed-in", shell: SHELL }, "%E0%A4%A"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(world.detailAsked).toEqual([]);
  });

  it("is the framework's not-found for a cabinet the book does not hold", async () => {
    world.detail = { kind: "not-found" };

    await expect(pageFor({ kind: "signed-in", shell: SHELL })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("draws the notice inside the frame when the source has no page, and keeps the frame's menu", async () => {
    world.detail = { kind: "unavailable" };

    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(CabinetListUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro", context: SHELL });
  });

  it("draws the forbidden screen inside the staff frame for an operator, and never reads the id", async () => {
    const operator: StaffShellContext = {
      ...SHELL,
      role: "operator",
      navigation: ["kitchens"],
    };

    const page = await pageFor(
      { kind: "staff-forbidden", shell: operator },
      "cabinet.stranger",
    );

    expect(page.type).toBe(StaffForbiddenScreen);
    expect(page.props).toEqual({
      locale: "ro",
      page: "cabinets",
      context: operator,
    });
    expect(world.detailAsked).toEqual([]);
  });

  it("answers anyone else the account area's forbidden screen alike for a cabinet that exists and one that does not", async () => {
    const existing = await pageFor({ kind: "forbidden" });
    const unknown = await pageFor({ kind: "forbidden" }, "cabinet.stranger");

    expect(existing.type).toBe(ForbiddenScreen);
    expect(unknown.type).toBe(ForbiddenScreen);
    expect(world.detailAsked).toEqual([]);
  });

  it("draws the notice for a gate that could not read the session, and never asks the source", async () => {
    const page = await pageFor({ kind: "unavailable" });

    expect(page.type).toBe(CatalogUnavailableScreen);
    expect(world.detailAsked).toEqual([]);
  });
});

describe("the cabinet page's title", () => {
  it("is the brand and nothing else, built before the gate runs", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ro", ruleId: RULE }),
    });

    expect(metadata).toEqual({ title: "Lemnaria" });
    expect(world.gateAsked).toEqual([]);
  });
});
