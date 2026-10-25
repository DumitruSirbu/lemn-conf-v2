// The staff kitchens page and its title for every spelling of a language: only the two the site serves, spelt exactly, get
// a page or a title; every other spelling is the framework's not-found before the staff gate or the catalogue is asked. The
// title holds the list's own words and nothing from any kitchen. The gate is replaced, as in the sibling frame test.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const world = vi.hoisted(() => ({
  gateAsked: [] as unknown[],
  translationsAsked: [] as string[],
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: ({ locale }: { locale: "ro" | "ru" }) => {
    world.translationsAsked.push(locale);
    return Promise.resolve(
      createTranslator({
        locale,
        messages: (locale === "ru"
          ? ruMessages
          : roMessages) as typeof roMessages,
      }),
    );
  },
}));
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: (request: unknown) => {
    world.gateAsked.push(request);
    return Promise.resolve({
      kind: "signed-in",
      shell: {
        role: "operator",
        email: "staff@example.test",
        navigation: ["kitchens"],
      },
    });
  },
}));

const { default: StaffKitchensPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/page"
);

const paramsOf = (locale: string) => ({ params: Promise.resolve({ locale }) });

beforeEach(() => {
  world.gateAsked = [];
  world.translationsAsked = [];
});

const HOSTILE_LOCALES = [
  ["an upper-case spelling", "RO"],
  ["a region", "ro-MD"],
  ["a language the site lacks", "en"],
  ["nothing", ""],
  ["a space around the language", " ro"],
  ["a trailing slash", "ro/"],
  ["an escaped letter", "r%6F"],
  ["a path climbing out", "ro/../x"],
  ["a word of Object.prototype", "constructor"],
  ["the prototype key", "__proto__"],
  ["a NUL after the language", "ro\u0000"],
  ["a longer word that begins with a served language", "rom"],
] as const;

describe.each(HOSTILE_LOCALES)("a locale that is %s", (_label, locale) => {
  it("is not found for the page, and the gate is not asked", async () => {
    await expect(StaffKitchensPage(paramsOf(locale))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(world.gateAsked).toEqual([]);
  });

  it("is not found for the title, and the catalogue is not read", async () => {
    await expect(generateMetadata(paramsOf(locale))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(world.translationsAsked).toEqual([]);
  });
});

describe.each([
  ["ro", roMessages],
  ["ru", ruMessages],
] as const)("the language %s", (locale, messages) => {
  it("is asked of the gate in that language, and handed to the screen", async () => {
    const page = await StaffKitchensPage(paramsOf(locale));

    expect(world.gateAsked).toEqual([{ locale, page: "kitchens" }]);
    expect(page.type).toBe(StaffKitchensScreen);
    expect(page.props).toMatchObject({ locale });
  });

  it("has the brand alone for a title, and no member that could carry a kitchen", async () => {
    const metadata = await generateMetadata(paramsOf(locale));

    expect(metadata.title).toBe(messages.brand);
    expect(
      Object.keys(metadata).filter((member) => member !== "title"),
      "a description or a share card would be a place for a kitchen's words",
    ).toEqual(
      Object.keys(metadata).filter(
        (member) => member === "robots" && metadata.robots !== "index",
      ),
    );
  });
});
