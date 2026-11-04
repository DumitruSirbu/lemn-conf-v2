// Adversarial reading of the staff kitchen page's server half (wave L3-U3): the order of its judgements, and the address it
// is asked for. The gate comes first, so a visitor with an address that names no kitchen still leaves for the login page, and
// a client with one is told what any client is told; only a person the gate has let in is told a kitchen does not exist. The
// judgement of the address is the shape of a design id and nothing looser, whatever the characters.
import { createTranslator } from "next-intl";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import {
  StaffForbiddenScreen,
  type StaffShellContext,
} from "@/staff/staff-shell";

import type { StaffPageRead } from "@/lib/server/staff/staff-page";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { withoutPriceBook } from "../support/price-book-wrapper";

const world = vi.hoisted(() => ({
  answer: undefined as StaffPageRead | "redirect" | undefined,
  asked: [] as { locale: string; page: string }[],
  notFoundCalls: 0,
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    world.notFoundCalls += 1;
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
    if (world.answer === undefined) throw new Error("no answer planned");
    if (world.answer === "redirect") throw new Error("NEXT_REDIRECT");
    return Promise.resolve(world.answer);
  },
}));

const { default: StaffKitchenPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/[id]/page"
);

const SHELL: StaffShellContext = {
  role: "operator",
  email: "staff@example.test",
  navigation: ["kitchens"],
};
const SIGNED_IN: StaffPageRead = { kind: "signed-in", shell: SHELL };
const KITCHEN_ID = "k".repeat(21);
/** The shape of a design id, written out here again so the page is not its own witness. */
const A_DESIGN_ID = /^[A-Za-z0-9_-]{21}$/;

const NOT_ID_SHAPED: readonly (readonly [string, string])[] = [
  ["twenty characters", "k".repeat(20)],
  ["twenty-two characters", "k".repeat(22)],
  ["a trailing line feed", `${KITCHEN_ID}\n`],
  ["a leading line feed", `\n${KITCHEN_ID}`],
  ["a trailing carriage return", `${KITCHEN_ID}\r`],
  ["twenty characters and a line feed", `${"k".repeat(20)}\n`],
  ["a trailing space", `${"k".repeat(20)} `],
  ["a NUL", `${"k".repeat(20)}\u0000`],
  ["a Cyrillic letter that looks like k", "\u043A".repeat(21)],
  ["a full-width letter", `${"k".repeat(20)}ｋ`],
  ["a combining accent", `${"k".repeat(20)}́`],
  ["an emoji", `${"k".repeat(19)}\u{1F600}`],
  ["a zero-width space", `${"k".repeat(20)}\u200B`],
  ["a dot segment", ".."],
  ["a single dot", "."],
  ["a path out of the segment", "../../etc/passwd"],
  ["an encoded dot segment", "%2e%2e"],
  ["an encoded slash", `${"k".repeat(15)}%2F${"k".repeat(3)}`],
  ["a slash", `${"k".repeat(10)}/${"k".repeat(10)}`],
  ["a backslash", `${"k".repeat(10)}\\${"k".repeat(10)}`],
  ["a query", `${"k".repeat(15)}?a=bcde`],
  ["a fragment", `${"k".repeat(15)}#abcde`],
  ["nothing", ""],
  ["a very long string", "k".repeat(100_000)],
];

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
  world.notFoundCalls = 0;
});

function paramsOf(locale: string, id: string = KITCHEN_ID) {
  return { params: Promise.resolve({ locale, id }) };
}

describe("a person the gate sends away is sent away whatever the address says", () => {
  it.each(NOT_ID_SHAPED)(
    "leaves for the sign-in page, never for a not-found, when the address holds %s",
    async (_, id) => {
      world.answer = "redirect";

      await expect(StaffKitchenPage(paramsOf("ro", id))).rejects.toThrow(
        "NEXT_REDIRECT",
      );

      expect(world.notFoundCalls).toBe(0);
      expect(world.asked).toEqual([{ locale: "ro", page: "kitchens" }]);
    },
  );

  it.each(NOT_ID_SHAPED)(
    "is told the same thing with %s as with a kitchen's id by every caller the gate refuses",
    async (_, id) => {
      for (const refusal of [
        { kind: "staff-forbidden", shell: SHELL },
        { kind: "forbidden" },
        { kind: "unavailable" },
      ] satisfies StaffPageRead[]) {
        world.answer = refusal;
        const withKitchen = await StaffKitchenPage(paramsOf("ro", KITCHEN_ID));
        const withAddress = await StaffKitchenPage(paramsOf("ro", id));

        expect(withAddress.type).toBe(withKitchen.type);
        expect(withAddress.props).toEqual(withKitchen.props);
        expect(withAddress.key).toBe(withKitchen.key);
      }
      expect(world.notFoundCalls).toBe(0);
    },
  );
});

describe("the address a signed-in person may open", () => {
  it.each(NOT_ID_SHAPED)(
    "is the framework's not-found when it holds %s",
    async (_, id) => {
      world.answer = SIGNED_IN;

      await expect(StaffKitchenPage(paramsOf("ro", id))).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    },
  );

  it.each([
    ["only dashes", "-".repeat(21)],
    ["only underscores", "_".repeat(21)],
    ["only digits", "0".repeat(21)],
    ["every kind of character", `aZ09_-${"x".repeat(15)}`],
  ])("opens %s, which is the shape of an id", async (_, id) => {
    world.answer = SIGNED_IN;

    const page = withoutPriceBook(await StaffKitchenPage(paramsOf("ru", id)));

    expect(page.type).toBe(StaffKitchenScreen);
    expect(page.props).toMatchObject({ locale: "ru", designId: id });
  });

  it("opens exactly the strings that are the shape of a design id, over strings of every kind", async () => {
    world.answer = SIGNED_IN;
    const oneOfTheIdAlphabet = fc.constantFrom(..."abcXYZ0189_-".split(""));
    const nearlyAnId = fc.oneof(
      fc.stringMatching(A_DESIGN_ID),
      fc
        .array(oneOfTheIdAlphabet, { minLength: 18, maxLength: 24 })
        .map((characters) => characters.join("")),
      fc.string({ unit: "binary", maxLength: 30 }),
      fc.string({ unit: "grapheme", maxLength: 30 }),
      fc
        .tuple(
          fc.stringMatching(A_DESIGN_ID),
          fc.string({ unit: "binary", maxLength: 2 }),
        )
        .map(([id, extra]) => `${id}${extra}`),
    );

    await fc.assert(
      fc.asyncProperty(nearlyAnId, async (id) => {
        const outcome = await StaffKitchenPage(paramsOf("ro", id)).then(
          () => "opened",
          (failure: unknown) =>
            failure instanceof Error ? failure.message : "other",
        );

        expect(outcome, JSON.stringify(id)).toBe(
          A_DESIGN_ID.test(id) ? "opened" : "NEXT_NOT_FOUND",
        );
      }),
      { numRuns: 600 },
    );
  });

  it("keys the screen by the id, so two kitchens are two screens, and hands it the id it was given", async () => {
    world.answer = SIGNED_IN;
    const first = withoutPriceBook(
      await StaffKitchenPage(paramsOf("ro", "a".repeat(21))),
    );
    const second = withoutPriceBook(
      await StaffKitchenPage(paramsOf("ro", "b".repeat(21))),
    );

    expect(first.key).toBe("a".repeat(21));
    expect(second.key).toBe("b".repeat(21));
    expect(first.key).not.toBe(second.key);
    expect(second.props).toMatchObject({ designId: "b".repeat(21) });
  });

  it("asks the gate exactly once, for the list's capability, before it looks at the address", async () => {
    world.answer = SIGNED_IN;

    await StaffKitchenPage(paramsOf("ru", KITCHEN_ID));

    expect(world.asked).toEqual([{ locale: "ru", page: "kitchens" }]);
  });
});

describe("a language the site does not serve", () => {
  it.each([
    "RO",
    "Ru",
    "ro-MD",
    "ro_MD",
    "en",
    "xx",
    "",
    " ro",
    "ro ",
    "ro\n",
    "ro/",
    "ro%2F",
    "%72o",
    "../ro",
    "__proto__",
    "constructor",
  ])(
    "%j is the framework's not-found, from the page and from its title, before the gate is asked",
    async (locale) => {
      world.answer = SIGNED_IN;

      await expect(StaffKitchenPage(paramsOf(locale))).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      await expect(generateMetadata(paramsOf(locale))).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );

      expect(world.asked).toEqual([]);
    },
  );
});

describe("the title", () => {
  it.each(["ro", "ru"] as const)(
    "is one generic title in %s for every address, holds only a title, and asks the gate nothing",
    async (locale) => {
      const titles = new Set<string>();
      for (const id of [
        KITCHEN_ID,
        "z".repeat(21),
        "../..",
        "",
        ...NOT_ID_SHAPED.map(([, id]) => id),
      ]) {
        const metadata = await generateMetadata(paramsOf(locale, id));

        expect(Object.keys(metadata)).toEqual(["title"]);
        titles.add(JSON.stringify(metadata.title));
        if (id.length > 1) {
          expect(JSON.stringify(metadata.title)).not.toContain(id);
        }
      }

      expect(titles.size).toBe(1);
      expect(world.asked).toEqual([]);
    },
  );
});

describe("the screens a refusal draws are the same ones the list draws", () => {
  it("draws the staff frame's forbidden screen, the account area's, and the unavailable notice", async () => {
    world.answer = { kind: "staff-forbidden", shell: SHELL };
    expect((await StaffKitchenPage(paramsOf("ro"))).type).toBe(
      StaffForbiddenScreen,
    );
    world.answer = { kind: "forbidden" };
    expect((await StaffKitchenPage(paramsOf("ro"))).type).toBe(ForbiddenScreen);
    world.answer = { kind: "unavailable" };
    expect((await StaffKitchenPage(paramsOf("ro"))).type).toBe(
      StaffKitchensUnavailableScreen,
    );
  });
});
