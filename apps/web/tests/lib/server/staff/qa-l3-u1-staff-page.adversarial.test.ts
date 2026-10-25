import type { Capability, Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import type { StaffPage } from "@/staff/staff-shell";

/**
 * Puts capabilities on the sessions that must not have them, so a gate reading the session's own capability list fails,
 * and reads the same cookie across a change of the account behind it.
 */

const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
  failure: undefined as Error | undefined,
  hasSessionCookie: true,
  storeReads: 0,
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
  readCurrentSessionOrThrow: () => {
    reading.storeReads += 1;
    return reading.failure === undefined
      ? Promise.resolve(reading.session)
      : Promise.reject(reading.failure);
  },
}));

const { readStaffPage, staffNavigationOf } = await import(
  "@/lib/server/staff/staff-page"
);

const ADDRESS = "staff@example.test";
const EVERY_STAFF_CAPABILITY: readonly Capability[] = [
  "design.read.any",
  "audit.read",
  "account.manage.own",
];
const PAGES: readonly StaffPage[] = ["kitchens", "audit"];

function sessionOf(
  role: string,
  { isEmailVerified = true, capabilities = [] as readonly Capability[] } = {},
): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role: role as Role,
    capabilities,
    isEmailVerified,
    email: ADDRESS,
  };
}

async function outcomeOf(page: StaffPage): Promise<string> {
  try {
    return (await readStaffPage({ locale: "ro", page })).kind;
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : "threw";
  }
}

beforeEach(() => {
  reading.session = { kind: "anonymous" };
  reading.failure = undefined;
  reading.hasSessionCookie = true;
  reading.storeReads = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the capability comes from the account's role and its confirmed address, never from a list the session carries", () => {
  it.each(PAGES)(
    "a verified client whose session lists every staff capability still gets the account area's 403 on %s",
    async (page) => {
      reading.session = sessionOf("client", {
        capabilities: EVERY_STAFF_CAPABILITY,
      });

      expect(await readStaffPage({ locale: "ro", page })).toEqual({
        kind: "forbidden",
      });
    },
  );

  it.each(PAGES)(
    "an unconfirmed operator whose session lists every staff capability still gets the account area's 403 on %s",
    async (page) => {
      reading.session = sessionOf("operator", {
        isEmailVerified: false,
        capabilities: EVERY_STAFF_CAPABILITY,
      });

      expect(await readStaffPage({ locale: "ro", page })).toEqual({
        kind: "forbidden",
      });
    },
  );

  it("an operator whose session lists audit.read is still refused the audit page, inside the frame", async () => {
    reading.session = sessionOf("operator", {
      capabilities: EVERY_STAFF_CAPABILITY,
    });

    expect(await readStaffPage({ locale: "ro", page: "audit" })).toMatchObject({
      kind: "staff-forbidden",
      shell: { role: "operator" },
    });
  });

  it("the navigation is judged on the holder's role, not on a list that rides along on the holder", () => {
    const clientCarryingCapabilities = {
      role: "client",
      isEmailVerified: true,
      capabilities: EVERY_STAFF_CAPABILITY,
    } as const;

    expect(
      staffNavigationOf(clientCarryingCapabilities, ["kitchens", "audit"]),
    ).toEqual([]);
  });
});

describe("a role the table does not know, as a database could hand it back", () => {
  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "",
    "Operator",
    "ADMINISTRATOR",
    "administrator ",
    "operator\u0000",
    "\u202eadministrator",
    "admin",
  ])(
    "%j is a 403 of the account area, with no frame, and never a throw",
    async (role) => {
      reading.session = sessionOf(role);

      for (const page of PAGES) {
        expect(await readStaffPage({ locale: "ro", page })).toEqual({
          kind: "forbidden",
        });
      }
    },
  );
});

describe("the account behind a cookie is read again on every request", () => {
  it("follows an administrator demoted to operator, then to client, then signed out, on the same cookie", async () => {
    reading.session = sessionOf("administrator");
    const asAdministrator = await outcomeOf("audit");
    reading.session = sessionOf("operator");
    const asOperator = await outcomeOf("audit");
    reading.session = sessionOf("client");
    const asClient = await outcomeOf("audit");
    reading.session = { kind: "anonymous" };
    const afterRevocation = await outcomeOf("audit");

    expect([asAdministrator, asOperator, asClient, afterRevocation]).toEqual([
      "signed-in",
      "staff-forbidden",
      "forbidden",
      "redirect:/ro/account/login?reason=session-expired",
    ]);
    expect(reading.storeReads).toBe(4);
  });

  it("follows an operator's address becoming unconfirmed, and back", async () => {
    reading.session = sessionOf("operator");
    const confirmed = await outcomeOf("kitchens");
    reading.session = sessionOf("operator", { isEmailVerified: false });
    const unconfirmed = await outcomeOf("kitchens");
    reading.session = sessionOf("operator");
    const confirmedAgain = await outcomeOf("kitchens");

    expect([confirmed, unconfirmed, confirmedAgain]).toEqual([
      "signed-in",
      "forbidden",
      "signed-in",
    ]);
  });
});

describe("an outage is told apart from an expired session (O18), page by page", () => {
  it.each(PAGES)(
    "an unreadable store answers unavailable on %s, which is neither the expired redirect nor the 403",
    async (page) => {
      reading.session = sessionOf("administrator");
      reading.failure = new Error("store down");
      const outage = await outcomeOf(page);

      reading.failure = undefined;
      reading.session = { kind: "anonymous" };
      const expired = await outcomeOf(page);
      reading.session = sessionOf("client");
      const forbidden = await outcomeOf(page);

      expect(outage).toBe("unavailable");
      expect(new Set([outage, expired, forbidden]).size).toBe(3);
    },
  );

  it("is not sticky: the request after the outage reads the store and is served", async () => {
    reading.session = sessionOf("administrator");
    reading.failure = new Error("store down");
    await outcomeOf("audit");
    reading.failure = undefined;

    expect(await outcomeOf("audit")).toBe("signed-in");
  });
});

describe("a visitor and an expired session learn nothing of which staff page they asked for", () => {
  it.each([
    ["no cookie at all", false, "redirect:/ro/account/login"],
    [
      "a cookie that names no live session",
      true,
      "redirect:/ro/account/login?reason=session-expired",
    ],
  ])(
    "%s is sent to the same address from every page",
    async (_label, hasCookie, expected) => {
      reading.hasSessionCookie = hasCookie;
      reading.session = { kind: "anonymous" };

      expect(await Promise.all(PAGES.map(outcomeOf))).toEqual(
        PAGES.map(() => expected),
      );
    },
  );
});
