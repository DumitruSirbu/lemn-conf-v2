// W3b adversarial QA: the 3D page answers every staff-gate outcome as the kitchen's own page does ("each is the detail page's
// answer for the same session", plan W3b-4), for every locale and for a hostile id, and calls the gate with the same key. The
// two pages are run side by side under the same planned gate answer and compared, so a drift of either is a failure here.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPageRead } from "@/lib/server/staff/staff-page";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { withoutPriceBook } from "../support/price-book-wrapper";

const world = vi.hoisted(() => ({
  answer: undefined as StaffPageRead | undefined,
  asked: [] as { locale: string; page: string }[],
  reads: 0,
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
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
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: (request: { locale: string; page: string }) => {
    world.asked.push(request);
    world.reads += 1;
    if (world.answer === undefined) throw new Error("no answer planned");
    return Promise.resolve(world.answer);
  },
}));

const { default: DetailPage, generateMetadata: detailMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/[id]/page"
);
const { default: ThreeDPage, generateMetadata: threeDMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/[id]/3d/page"
);

const SHELL: StaffShellContext = {
  role: "operator",
  email: "staff@example.test",
  navigation: ["kitchens"],
};
const ID = "k".repeat(21);
const HOSTILE_IDS = [
  "",
  "abc",
  "../../x",
  "k".repeat(22),
  `${"k".repeat(20)}%`,
];
const REFUSALS: readonly StaffPageRead[] = [
  { kind: "staff-forbidden", shell: SHELL },
  { kind: "forbidden" },
  { kind: "unavailable" },
];

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
  world.reads = 0;
});

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

async function renderedBy(
  page: typeof DetailPage | typeof ThreeDPage,
  { answer, locale, id }: { answer: StaffPageRead; locale: string; id: string },
): Promise<Rendered> {
  world.answer = answer;
  const props = {
    params: Promise.resolve({ locale, id }),
    searchParams: Promise.resolve({}),
  };
  return withoutPriceBook(await page(props)) as unknown as Rendered;
}

describe.each(["ro", "ru"])("in locale %s", (locale) => {
  describe.each(REFUSALS)("a gate that answers $kind", (answer) => {
    it.each([ID, ...HOSTILE_IDS])(
      "draws the same screen as the kitchen's page, whatever the id (%j)",
      async (id) => {
        const detail = await renderedBy(DetailPage, { answer, locale, id });
        const threeD = await renderedBy(ThreeDPage, { answer, locale, id });

        expect(threeD.type).toBe(detail.type);
        expect(threeD.props).toEqual(detail.props);
      },
    );
  });

  it("asks the gate for the same page key, once, as the kitchen's page", async () => {
    await renderedBy(DetailPage, {
      answer: { kind: "signed-in", shell: SHELL },
      locale,
      id: ID,
    });
    const detailAsked = [...world.asked];
    world.asked = [];

    await renderedBy(ThreeDPage, {
      answer: { kind: "signed-in", shell: SHELL },
      locale,
      id: ID,
    });

    expect(world.asked).toEqual(detailAsked);
    expect(world.asked).toHaveLength(1);
  });

  it("hands the signed-in screen the same locale and frame as the kitchen's page, and no kitchen", async () => {
    const detail = await renderedBy(DetailPage, {
      answer: { kind: "signed-in", shell: SHELL },
      locale,
      id: ID,
    });
    const threeD = await renderedBy(ThreeDPage, {
      answer: { kind: "signed-in", shell: SHELL },
      locale,
      id: ID,
    });

    expect(threeD.props.locale).toBe(detail.props.locale);
    expect(threeD.props.context).toEqual(detail.props.context);
    expect(Object.keys(threeD.props).sort()).toEqual(
      ["context", "designId", "locale", "version"].sort(),
    );
  });

  it("gives the page the same title as the kitchen's page, the brand alone", async () => {
    const args = {
      params: Promise.resolve({ locale, id: ID }),
      searchParams: Promise.resolve({}),
    };

    expect(await threeDMetadata(args)).toEqual(await detailMetadata(args));
  });
});

describe("a hostile id after a signed-in gate", () => {
  it.each(HOSTILE_IDS)(
    "is the framework's not-found for %j, as for the kitchen's page",
    async (id) => {
      const answer: StaffPageRead = { kind: "signed-in", shell: SHELL };

      await expect(
        renderedBy(DetailPage, { answer, locale: "ro", id }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(
        renderedBy(ThreeDPage, { answer, locale: "ro", id }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );
});
