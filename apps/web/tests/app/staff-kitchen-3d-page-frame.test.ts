// What the staff 3D page draws for each answer of the staff gate: the kitchen page's answers for the same session, the
// id judged only after the gate, no kitchen read, and `version` handed on only when it names a copy.
// The gate is replaced.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { StaffKitchen3dScreen } from "@/staff/staff-kitchen-3d-screen";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import {
  StaffForbiddenScreen,
  type StaffShellContext,
} from "@/staff/staff-shell";

import type { StaffPageRead } from "@/lib/server/staff/staff-page";

import roMessages from "../../src/messages/ro.json";
import { withoutPriceBook } from "../support/price-book-wrapper";
import ruMessages from "../../src/messages/ru.json";

const world = vi.hoisted(() => ({
  answer: undefined as StaffPageRead | undefined,
  asked: [] as { locale: string; page: string }[],
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
// The screen imports the configurator, whose navigation helpers need the module's other exports.
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
    if (world.answer === undefined) throw new Error("no answer planned");
    return Promise.resolve(world.answer);
  },
}));

const { default: StaffKitchen3dPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/[id]/3d/page"
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
  ["with a path climbing out", "../../etc/passwd"],
  ["empty", ""],
] as const;

type Query = Record<string, string | string[] | undefined>;

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
});

function propsOf(locale: string, id: string = KITCHEN_ID, query: Query = {}) {
  return {
    params: Promise.resolve({ locale, id }),
    searchParams: Promise.resolve(query),
  };
}

async function pageFor(
  answer: StaffPageRead,
  id: string = KITCHEN_ID,
  query: Query = {},
) {
  world.answer = answer;
  return withoutPriceBook(await StaffKitchen3dPage(propsOf("ro", id, query)));
}

function versionOf(page: { props: unknown }): unknown {
  return (page.props as { version?: unknown }).version;
}

describe("the 3D page for each answer of the staff gate", () => {
  it("is the framework's not-found for a language the site does not serve, before the gate is asked", async () => {
    world.answer = { kind: "unavailable" };

    await expect(StaffKitchen3dPage(propsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(world.asked).toEqual([]);
  });

  it("asks the gate for the kitchens page, the kitchen page's own key", async () => {
    await pageFor({ kind: "unavailable" });

    expect(world.asked).toEqual([{ locale: "ro", page: "kitchens" }]);
  });

  it("hands the screen the id, the frame and no kitchen, for a staff member who may open it", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(StaffKitchen3dScreen);
    expect(page.props).toEqual({
      locale: "ro",
      context: SHELL,
      designId: KITCHEN_ID,
      version: undefined,
    });
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

  it("draws the account area's forbidden screen for anyone else", async () => {
    const page = await pageFor({ kind: "forbidden" });

    expect(page.type).toBe(ForbiddenScreen);
    expect(page.props).toEqual({ locale: "ro" });
  });

  it("draws the notice for a gate that could not read the session", async () => {
    const page = await pageFor({ kind: "unavailable" });

    expect(page.type).toBe(StaffKitchensUnavailableScreen);
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

      expect(staffRefused.type).toBe(StaffForbiddenScreen);
      expect(forbidden.type).toBe(ForbiddenScreen);
    },
  );
});

describe("the copy the link names", () => {
  it.each(["sent", "current"] as const)(
    "is handed to the screen when the query says %s",
    async (version) => {
      const page = await pageFor(
        { kind: "signed-in", shell: SHELL },
        KITCHEN_ID,
        {
          version,
        },
      );

      expect(versionOf(page)).toBe(version);
    },
  );

  it.each([
    ["an unknown word", "latest"],
    ["another case", "Sent"],
    ["empty", ""],
    ["repeated", ["sent", "current"]],
    ["absent", undefined],
  ])(
    "is dropped, so the endpoint's refusal is never asked for, when the query is %s",
    async (_, version) => {
      const page = await pageFor(
        { kind: "signed-in", shell: SHELL },
        KITCHEN_ID,
        {
          version,
        },
      );

      expect(versionOf(page)).toBeUndefined();
    },
  );

  it("mounts the screen keyed by the id and the copy, so a change of either is a new screen", async () => {
    const sent = await pageFor(
      { kind: "signed-in", shell: SHELL },
      KITCHEN_ID,
      {
        version: "sent",
      },
    );
    const current = await pageFor(
      { kind: "signed-in", shell: SHELL },
      KITCHEN_ID,
      { version: "current" },
    );

    expect(sent.key).not.toBe(current.key);
    expect(sent.key).toContain(KITCHEN_ID);
  });
});

describe("the page's title", () => {
  it.each(["ro", "ru"] as const)(
    "is the brand alone in %s: it is built before the gate, so it names neither the staff area nor a kitchen",
    async (locale) => {
      const metadata = await generateMetadata(propsOf(locale));

      expect(metadata.title).toBe(roMessages.brand);
      expect(JSON.stringify(metadata.title)).not.toContain(KITCHEN_ID);
    },
  );
});
