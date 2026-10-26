// Adversarial QA of M10 wave U1: the catalog gate against the staff gate it says it stands beside, over every role the
// domain names and both states of the address. The session read and the framework's redirect are replaced; the
// capability table, the cookie name and both gates are the real ones.
import { ROLES, type Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import { CATALOG_PAGES, isCatalogPage } from "@/staff/staff-paths";

const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
  hasSessionCookie: false,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        reading.hasSessionCookie && name === SESSION_COOKIE_NAME
          ? { value: "x".repeat(43) }
          : undefined,
    }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/lib/server/account/current-session", () => ({
  readCurrentSessionOrThrow: () => Promise.resolve(reading.session),
}));

const { readCatalogPage } = await import(
  "../../src/app/[locale]/staff/catalog/_lib/read-catalog-page"
);
const { readStaffPage } = await import("@/lib/server/staff/staff-page");

const ROLE_NAMES = Object.keys(ROLES) as Role[];

function signedIn(role: string, isEmailVerified: boolean): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role: role as Role,
    capabilities: [],
    isEmailVerified,
    email: "staff@example.test",
  };
}

async function answerOf(gate: () => Promise<{ readonly kind: string }>) {
  try {
    return await gate();
  } catch (thrown) {
    return { kind: thrown instanceof Error ? thrown.message : "threw" };
  }
}

beforeEach(() => {
  reading.hasSessionCookie = true;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const CALLERS: readonly [string, CurrentSession][] = [
  ...ROLE_NAMES.flatMap((role): [string, CurrentSession][] => [
    [`a verified ${role}`, signedIn(role, true)],
    [`an unconfirmed ${role}`, signedIn(role, false)],
  ]),
  ["a role the table does not know", signedIn("ghost", true)],
  ["a role named like an object member", signedIn("constructor", true)],
  ["an expired or absent session", { kind: "anonymous" }],
];

describe("what the catalog gate shows each caller, held against the staff gate", () => {
  it.each(CALLERS)(
    "answers %s with a navigation holding a catalog page only when it opens the page",
    async (_label, session) => {
      reading.session = session;
      const answer = await answerOf(() => readCatalogPage({ locale: "ro" }));
      const navigation =
        "shell" in answer
          ? (answer.shell as { navigation: readonly string[] }).navigation
          : [];

      const listsACatalogPage = navigation.some((page) =>
        isCatalogPage(page as never),
      );
      expect(listsACatalogPage).toBe(answer.kind === "signed-in");
    },
  );

  it.each(CALLERS)(
    "gives %s no staff frame when the staff gate gives it none",
    async (_label, session) => {
      reading.session = session;
      const staff = await answerOf(() =>
        readStaffPage({ locale: "ro", page: "kitchens" }),
      );
      const catalog = await answerOf(() => readCatalogPage({ locale: "ro" }));

      const staffSeesNoFrame = !("shell" in staff);
      if (staffSeesNoFrame) {
        expect(catalog.kind, "the catalog gate's answer").not.toBe(
          "staff-forbidden",
        );
        expect(catalog).not.toHaveProperty("shell");
      }
    },
  );

  it.each(CALLERS)(
    "answers %s with the same answer as the staff gate whenever the catalog gate does not open",
    async (_label, session) => {
      reading.session = session;
      const staff = await answerOf(() =>
        readStaffPage({ locale: "ro", page: "kitchens" }),
      );
      const catalog = await answerOf(() => readCatalogPage({ locale: "ro" }));

      if (catalog.kind !== "signed-in" && catalog.kind !== "staff-forbidden") {
        expect(catalog.kind).toBe(
          staff.kind === "signed-in" ? "forbidden" : staff.kind,
        );
      }
    },
  );

  it("never lets a role that is not the administrator's open any catalog page", async () => {
    for (const role of ROLE_NAMES) {
      reading.session = signedIn(role, true);
      const answer = await answerOf(() => readCatalogPage({ locale: "ro" }));

      expect(answer.kind === "signed-in", role).toBe(role === "administrator");
    }
  });

  it("lists every catalog page only to the one role that may edit prices", async () => {
    reading.session = signedIn("administrator", true);
    const answer = (await readCatalogPage({ locale: "ro" })) as {
      shell: { navigation: readonly string[] };
    };

    const listed = answer.shell.navigation.filter((page) =>
      CATALOG_PAGES.some((catalogPage) => catalogPage === page),
    );
    expect(listed).toEqual(["cabinets"]);
  });
});
