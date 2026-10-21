// What the staff kitchen page draws for each answer of the staff gate, and for an id that is not a kitchen's. The page stands
// on the list's gate and capability, so its answers are the list's; the id is judged only after the gate has let the person
// in, so every caller who may not read a kitchen is answered alike whatever the address says. The gate is replaced, as in the
// list page's frame test, so the answer `staff-forbidden`, which no real role reaches today, is mapped too.
import { createTranslator } from "next-intl";
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

const world = vi.hoisted(() => ({
  answer: undefined as StaffPageRead | undefined,
  asked: [] as { locale: string; page: string }[],
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
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: (request: { locale: string; page: string }) => {
    world.asked.push(request);
    if (world.answer === undefined) throw new Error("no answer planned");
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
const KITCHEN_ID = "k".repeat(21);
const MALFORMED_IDS = [
  ["too short", "abc"],
  ["too long", "k".repeat(22)],
  ["with a dot", `${"k".repeat(20)}.`],
  ["with an escaped slash", `${"k".repeat(15)}%2F${"k".repeat(3)}`],
  ["with a path climbing out", "../../etc/passwd"],
  ["empty", ""],
] as const;

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
});

function paramsOf(locale: string, id: string = KITCHEN_ID) {
  return { params: Promise.resolve({ locale, id }) };
}

async function pageFor(answer: StaffPageRead, id: string = KITCHEN_ID) {
  world.answer = answer;
  return StaffKitchenPage(paramsOf("ro", id));
}

describe("the page for each answer of the staff gate", () => {
  it("is the framework's not-found for a language the site does not serve, before the gate is asked", async () => {
    world.answer = { kind: "unavailable" };

    await expect(StaffKitchenPage(paramsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(world.asked).toEqual([]);
  });

  it("asks the gate for the kitchens page, the list's own capability, in the page's language", async () => {
    await pageFor({ kind: "unavailable" });

    expect(world.asked).toEqual([{ locale: "ro", page: "kitchens" }]);
  });

  it("draws the kitchen for a staff member who may open it, handing the screen the id and the frame", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(StaffKitchenScreen);
    expect(page.props).toEqual({
      locale: "ro",
      context: SHELL,
      designId: KITCHEN_ID,
    });
  });

  it("mounts the screen keyed by the id, so two kitchens are two screens", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.key).toBe(KITCHEN_ID);
  });

  it("draws the forbidden screen inside the staff frame for a staff member refused the page", async () => {
    const page = await pageFor({ kind: "staff-forbidden", shell: SHELL });

    expect(page.type).toBe(StaffForbiddenScreen);
    expect(page.props).toEqual({
      locale: "ro",
      page: "kitchens",
      context: SHELL,
    });
  });

  it("draws the account area's forbidden screen, with no word of the staff area, for anyone else", async () => {
    const page = await pageFor({ kind: "forbidden" });

    expect(page.type).toBe(ForbiddenScreen);
    expect(page.props).toEqual({ locale: "ro" });
  });

  it("draws the notice for a gate that could not read the session", async () => {
    const page = await pageFor({ kind: "unavailable" });

    expect(page.type).toBe(StaffKitchensUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro" });
  });
});

describe("an id that cannot name a kitchen", () => {
  it.each(MALFORMED_IDS)(
    "is the framework's not-found for a staff member when it is %s",
    async (_, id) => {
      await expect(
        pageFor({ kind: "signed-in", shell: SHELL }, id),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );

  it.each(MALFORMED_IDS)(
    "is answered as any id is, before the id is looked at, for everyone else, when it is %s",
    async (_, id) => {
      const staffRefused = await pageFor(
        { kind: "staff-forbidden", shell: SHELL },
        id,
      );
      const forbidden = await pageFor({ kind: "forbidden" }, id);
      const unavailable = await pageFor({ kind: "unavailable" }, id);

      expect(staffRefused.type).toBe(StaffForbiddenScreen);
      expect(forbidden.type).toBe(ForbiddenScreen);
      expect(unavailable.type).toBe(StaffKitchensUnavailableScreen);
    },
  );
});

describe("the page's title", () => {
  it.each([
    ["ro", roMessages.staffKitchen.metaTitle],
    ["ru", ruMessages.staffKitchen.metaTitle],
  ] as const)(
    "is the generic one in %s, naming no kitchen and holding no id",
    async (locale, template) => {
      const metadata = await generateMetadata(paramsOf(locale));

      expect(metadata.title).toBe(
        template.replace("{brand}", roMessages.brand),
      );
      expect(JSON.stringify(metadata.title)).not.toContain(KITCHEN_ID);
    },
  );

  it("is the framework's not-found for a language the site does not serve", async () => {
    await expect(generateMetadata(paramsOf("RO"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
