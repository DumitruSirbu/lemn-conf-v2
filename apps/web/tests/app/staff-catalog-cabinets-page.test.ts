// What the cabinets page draws for each answer of the catalog gate and of the list's source, whatever produced it. The gate
// and the source are replaced: this is the page's own mapping, including the answer `staff-forbidden` (an operator, who is
// shown "Nu ai acces la această pagină" inside the staff frame) and the source's `unavailable`.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import {
  CabinetListScreen,
  CabinetListUnavailableScreen,
} from "@/price-dashboard/cabinet-list";
import type { CabinetListRead } from "@/price-dashboard/cabinet-list-source";
import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";
import { CatalogUnavailableScreen } from "@/price-dashboard/catalog-states";
import {
  StaffForbiddenScreen,
  type StaffShellContext,
} from "@/staff/staff-shell";

import type { StaffPageRead as CatalogPageRead } from "@/lib/server/staff/staff-page";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const world = vi.hoisted(() => ({
  gate: undefined as CatalogPageRead | undefined,
  gateAsked: [] as { locale: string; page: string }[],
  list: undefined as CabinetListRead | undefined,
  listAsked: 0,
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
  readCabinetList: () => {
    world.listAsked += 1;
    if (world.list === undefined) throw new Error("no list planned");
    return Promise.resolve(world.list);
  },
}));

const { default: CabinetsPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/catalog/cabinets/page"
);

const SHELL: StaffShellContext = {
  role: "administrator",
  email: "staff@example.test",
  navigation: ["kitchens", "audit", "cabinets"],
};

beforeEach(() => {
  world.gate = undefined;
  world.gateAsked = [];
  world.list = { kind: "ready", input: SAMPLE_CABINET_LIST };
  world.listAsked = 0;
});

async function pageFor(answer: CatalogPageRead) {
  world.gate = answer;
  return CabinetsPage({ params: Promise.resolve({ locale: "ro" }) });
}

describe("the cabinets page for each answer of the catalog gate", () => {
  it("is the framework's not-found for a locale the site does not serve, before the gate is asked", async () => {
    world.gate = { kind: "unavailable" };

    await expect(
      CabinetsPage({ params: Promise.resolve({ locale: "xx" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(world.gateAsked).toEqual([]);
  });

  it("asks the gate in the page's language", async () => {
    await pageFor({ kind: "unavailable" });

    expect(world.gateAsked).toEqual([{ locale: "ro", page: "cabinets" }]);
  });

  it("draws the list for an administrator, handing the screen the frame the server worked out and the source's facts", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(CabinetListScreen);
    expect(page.props).toEqual({
      locale: "ro",
      context: SHELL,
      input: SAMPLE_CABINET_LIST,
    });
  });

  it("draws the notice inside the frame when the source has no list, and keeps the frame's menu", async () => {
    world.list = { kind: "unavailable" };

    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(CabinetListUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro", context: SHELL });
  });

  it("draws the forbidden screen inside the staff frame for an operator, and never asks the source", async () => {
    const operator: StaffShellContext = {
      ...SHELL,
      role: "operator",
      navigation: ["kitchens"],
    };

    const page = await pageFor({ kind: "staff-forbidden", shell: operator });

    expect(page.type).toBe(StaffForbiddenScreen);
    expect(page.props).toEqual({
      locale: "ro",
      page: "cabinets",
      context: operator,
    });
    expect(world.listAsked).toBe(0);
  });

  it("draws the account area's forbidden screen, with no word of the staff area, for anyone else", async () => {
    const page = await pageFor({ kind: "forbidden" });

    expect(page.type).toBe(ForbiddenScreen);
    expect(page.props).toEqual({ locale: "ro" });
    expect(world.listAsked).toBe(0);
  });

  it("draws the notice for a gate that could not read the session, and never asks the source", async () => {
    const page = await pageFor({ kind: "unavailable" });

    expect(page.type).toBe(CatalogUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro" });
    expect(world.listAsked).toBe(0);
  });
});

describe("the cabinets page's title", () => {
  it("is the brand and nothing else, built before the gate runs", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ro" }),
    });

    expect(metadata).toEqual({ title: "Lemnaria" });
    expect(world.gateAsked).toEqual([]);
  });
});
