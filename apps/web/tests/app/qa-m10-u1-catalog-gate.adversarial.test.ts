// Adversarial QA of M10 wave U1: the catalog gate against the staff gate it says it stands beside, over every role the
// domain names and both states of the address. The session read and the framework's redirect are replaced; the
// capability table, the cookie name and both gates are the real ones.
import { ROLES, type Role } from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
const { readStaffPage, staffNavigationOf } = await import(
  "@/lib/server/staff/staff-page"
);
const { BUILT_CATALOG_PAGES } = await import("@/price-dashboard/catalog-pages");

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
      const answer = await answerOf(() =>
        readCatalogPage({ locale: "ro", page: "cabinets" }),
      );
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
      const catalog = await answerOf(() =>
        readCatalogPage({ locale: "ro", page: "cabinets" }),
      );

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
      const catalog = await answerOf(() =>
        readCatalogPage({ locale: "ro", page: "cabinets" }),
      );

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
      const answer = await answerOf(() =>
        readCatalogPage({ locale: "ro", page: "cabinets" }),
      );

      expect(answer.kind === "signed-in", role).toBe(role === "administrator");
    }
  });

  it("lists every catalog page only to the one role that may edit prices", async () => {
    reading.session = signedIn("administrator", true);
    const answer = (await readCatalogPage({
      locale: "ro",
      page: "cabinets",
    })) as {
      shell: { navigation: readonly string[] };
    };

    const listed = answer.shell.navigation.filter((page) =>
      CATALOG_PAGES.some((catalogPage) => catalogPage === page),
    );
    expect(listed).toEqual(["cabinets"]);
  });
});

describe("the staff gate asked for each catalog page", () => {
  it.each(CATALOG_PAGES)(
    "judges %s by price.edit: an administrator opens it, an operator is shown the 403 in the frame, every other caller the account area's",
    async (page) => {
      const answerFor = async (session: CurrentSession) => {
        reading.session = session;
        return (await readStaffPage({ locale: "ro", page })).kind;
      };

      expect(await answerFor(signedIn("administrator", true))).toBe(
        "signed-in",
      );
      expect(await answerFor(signedIn("operator", true))).toBe(
        "staff-forbidden",
      );
      expect(await answerFor(signedIn("administrator", false))).toBe(
        "forbidden",
      );
      expect(await answerFor(signedIn("operator", false))).toBe("forbidden");
      expect(await answerFor(signedIn("client", true))).toBe("forbidden");
      expect(await answerFor(signedIn("ghost", true))).toBe("forbidden");
    },
  );
});

describe("the staff navigation, now that it lists the price dashboard's pages", () => {
  const holder = (role: Role, isEmailVerified = true) => ({
    role,
    isEmailVerified,
  });

  it("lists the administrator the staff pages and then the built catalog pages, and nothing unbuilt", () => {
    expect(staffNavigationOf(holder("administrator"))).toEqual([
      "kitchens",
      "audit",
      ...BUILT_CATALOG_PAGES,
    ]);
  });

  it.each(ROLE_NAMES.filter((role) => role !== "administrator"))(
    "lists a %s no catalog page, whatever pages are built",
    (role) => {
      const navigation = staffNavigationOf(holder(role), [
        "kitchens",
        "audit",
        ...CATALOG_PAGES,
      ]);

      expect(navigation.filter((page) => isCatalogPage(page))).toEqual([]);
    },
  );

  it("lists an unconfirmed administrator nothing at all", () => {
    expect(
      staffNavigationOf(holder("administrator", false), [
        "kitchens",
        "audit",
        ...CATALOG_PAGES,
      ]),
    ).toEqual([]);
  });

  it("lists the catalog pages in the closed list's order, whatever order the built list is given in", () => {
    expect(
      staffNavigationOf(holder("administrator"), ["publish", "cabinets"]),
    ).toEqual(["cabinets", "publish"]);
    expect(
      staffNavigationOf(holder("administrator"), [...CATALOG_PAGES].reverse()),
    ).toEqual([...CATALOG_PAGES]);
    expect(staffNavigationOf(holder("administrator"), [])).toEqual([]);
  });

  it("puts the staff pages before the catalog pages whatever order the built list is given in", () => {
    expect(
      staffNavigationOf(holder("administrator"), [
        "cabinets",
        "audit",
        "kitchens",
      ]),
    ).toEqual(["kitchens", "audit", "cabinets"]);
  });

  it("lists every page of the closed list to an administrator once all are built", () => {
    expect(
      staffNavigationOf(holder("administrator"), [
        "kitchens",
        "audit",
        ...CATALOG_PAGES,
      ]),
    ).toEqual(["kitchens", "audit", ...CATALOG_PAGES]);
  });

  it("never lists a page of the built list twice", () => {
    const navigation = staffNavigationOf(holder("administrator"));

    expect(new Set(navigation).size).toBe(navigation.length);
  });
});

describe("the catalog gate asked for each page", () => {
  it.each(CATALOG_PAGES)(
    "answers %s exactly as the staff gate does for that page, for every caller",
    async (page) => {
      for (const [label, session] of CALLERS) {
        reading.session = session;
        const staff = await answerOf(() =>
          readStaffPage({ locale: "ro", page }),
        );
        const catalog = await answerOf(() =>
          readCatalogPage({ locale: "ro", page }),
        );

        expect(catalog, `${label} on ${page}`).toEqual(staff);
      }
    },
  );

  it("maps every catalog page to price.edit in the staff gate's table, and no staff page to it", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../../src/lib/server/staff/staff-page.ts"),
      "utf8",
    );
    const table = /CAPABILITY_OF_PAGE[^{]*\{([^}]*)\}/.exec(source)?.[1] ?? "";
    const entries: Record<string, string | undefined> = {};
    for (const [, page, capability] of table.matchAll(/(\w+):\s*"([\w.]+)"/g)) {
      if (page !== undefined) entries[page] = capability;
    }

    for (const page of CATALOG_PAGES) {
      expect(entries[page], page).toBe("price.edit");
    }
    expect(entries.kitchens).toBe("design.read.any");
    expect(entries.audit).toBe("audit.read");
    expect(Object.keys(entries).sort()).toEqual(
      ["kitchens", "audit", ...CATALOG_PAGES].sort(),
    );
  });
});
