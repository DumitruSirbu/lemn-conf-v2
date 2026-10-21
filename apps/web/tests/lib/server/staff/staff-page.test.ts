import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import type { StaffPage } from "@/staff/staff-shell";

/**
 * The staff gate must answer what the signed-in page gate answers for the same page, so the staff area is not a second,
 * looser door. The session read and the framework's redirect are replaced; the capability table, the cookie name and
 * both gates are the real ones.
 */

const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
  failure: undefined as Error | undefined,
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
  readCurrentSessionOrThrow: () =>
    reading.failure === undefined
      ? Promise.resolve(reading.session)
      : Promise.reject(reading.failure),
}));

const { BUILT_STAFF_PAGES, readStaffPage, staffNavigationOf } = await import(
  "@/lib/server/staff/staff-page"
);
const { readSignedInPage } = await import(
  "@/lib/server/account/signed-in-page"
);

const STAFF_ADDRESS = "staff@example.test";
const CAPABILITY_ASKED_BY_PAGE = {
  kitchens: "design.read.any",
  audit: "audit.read",
} as const;
const PAGES = Object.keys(CAPABILITY_ASKED_BY_PAGE) as StaffPage[];

function signedIn(role: string, isEmailVerified = true): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role: role as Role,
    capabilities: [],
    isEmailVerified,
    email: STAFF_ADDRESS,
  };
}

interface Caller {
  readonly label: string;
  readonly session: CurrentSession;
  readonly hasSessionCookie: boolean;
  readonly failure?: Error;
}

const CALLERS: readonly Caller[] = [
  {
    label: "a visitor",
    session: { kind: "anonymous" },
    hasSessionCookie: false,
  },
  {
    label: "a cookie that names no live session",
    session: { kind: "anonymous" },
    hasSessionCookie: true,
  },
  {
    label: "a session store that cannot be read",
    session: { kind: "anonymous" },
    hasSessionCookie: true,
    failure: new Error("store down"),
  },
  {
    label: "a verified client",
    session: signedIn("client"),
    hasSessionCookie: true,
  },
  {
    label: "an unconfirmed client",
    session: signedIn("client", false),
    hasSessionCookie: true,
  },
  {
    label: "an unconfirmed operator",
    session: signedIn("operator", false),
    hasSessionCookie: true,
  },
  {
    label: "an unconfirmed administrator",
    session: signedIn("administrator", false),
    hasSessionCookie: true,
  },
  {
    label: "a role the table does not know",
    session: signedIn("ghost"),
    hasSessionCookie: true,
  },
  {
    label: "a verified operator",
    session: signedIn("operator"),
    hasSessionCookie: true,
  },
  {
    label: "a verified administrator",
    session: signedIn("administrator"),
    hasSessionCookie: true,
  },
];

function callerNamed(label: string): Caller {
  const caller = CALLERS.find((candidate) => candidate.label === label);
  if (caller === undefined) throw new Error(`no caller is named ${label}`);
  return caller;
}

function become(caller: Caller): void {
  reading.session = caller.session;
  reading.hasSessionCookie = caller.hasSessionCookie;
  reading.failure = caller.failure;
}

/** What a gate came to, with a redirect told by its address: the thing a person on the other side would see. */
async function outcomeOf(
  gate: () => Promise<{ readonly kind: string }>,
): Promise<string> {
  try {
    return (await gate()).kind;
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : "threw";
  }
}

beforeEach(() => {
  become(callerNamed("a visitor"));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("readStaffPage refuses as the signed-in page gate refuses", () => {
  describe.each(PAGES)("on the %s page", (page) => {
    it.each(CALLERS)(
      "answers $label what the gate answers for the page's capability",
      async (caller) => {
        become(caller);
        const staff = await outcomeOf(() =>
          readStaffPage({ locale: "ro", page }),
        );
        const staffAsGate = staff === "staff-forbidden" ? "forbidden" : staff;

        const gate = await outcomeOf(() =>
          readSignedInPage({
            locale: "ro",
            capability: CAPABILITY_ASKED_BY_PAGE[page],
          }),
        );

        expect(staffAsGate).toBe(gate);
      },
    );
  });

  it("sends a visitor to the plain login page and an expired session to the expired one", async () => {
    become(callerNamed("a visitor"));
    const visitor = await outcomeOf(() =>
      readStaffPage({ locale: "ru", page: "kitchens" }),
    );
    become(callerNamed("a cookie that names no live session"));
    const expired = await outcomeOf(() =>
      readStaffPage({ locale: "ru", page: "kitchens" }),
    );

    expect(visitor).toBe("redirect:/ru/account/login");
    expect(expired).toBe("redirect:/ru/account/login?reason=session-expired");
  });

  it("answers an unreadable session store with unavailable, never with a sign-in", async () => {
    become(callerNamed("a session store that cannot be read"));

    expect(await readStaffPage({ locale: "ro", page: "kitchens" })).toEqual({
      kind: "unavailable",
    });
  });

  it("refuses a locale the site does not serve as not found", async () => {
    expect(
      await outcomeOf(() => readStaffPage({ locale: "xx", page: "kitchens" })),
    ).toBe("not-found");
  });
});

describe("readStaffPage shows the staff frame to staff and to no one else", () => {
  it.each([
    "a verified client",
    "an unconfirmed client",
    "an unconfirmed operator",
    "an unconfirmed administrator",
    "a role the table does not know",
  ])(
    "answers %s the account area's 403, with no frame and no role",
    async (label) => {
      become(callerNamed(label));

      expect(await readStaffPage({ locale: "ro", page: "kitchens" })).toEqual({
        kind: "forbidden",
      });
    },
  );

  it("opens the kitchens page to a verified operator and draws the operator's frame", async () => {
    become(callerNamed("a verified operator"));

    expect(await readStaffPage({ locale: "ro", page: "kitchens" })).toEqual({
      kind: "signed-in",
      shell: {
        role: "operator",
        email: STAFF_ADDRESS,
        navigation: ["kitchens"],
      },
    });
  });

  it("answers an operator on an administrator's page with the 403 inside the frame, as S1D draws it", async () => {
    become(callerNamed("a verified operator"));

    expect(await readStaffPage({ locale: "ro", page: "audit" })).toEqual({
      kind: "staff-forbidden",
      shell: {
        role: "operator",
        email: STAFF_ADDRESS,
        navigation: ["kitchens"],
      },
    });
  });

  it("opens the audit page to a verified administrator", async () => {
    become(callerNamed("a verified administrator"));

    expect(await readStaffPage({ locale: "ro", page: "audit" })).toEqual({
      kind: "signed-in",
      shell: {
        role: "administrator",
        email: STAFF_ADDRESS,
        navigation: ["kitchens"],
      },
    });
  });
});

describe("staffNavigationOf", () => {
  const OPERATOR = { role: "operator", isEmailVerified: true } as const;
  const ADMINISTRATOR = {
    role: "administrator",
    isEmailVerified: true,
  } as const;

  it("lists an operator the kitchens page only, whatever is built", () => {
    expect(staffNavigationOf(OPERATOR, ["kitchens", "audit"])).toEqual([
      "kitchens",
    ]);
  });

  it("lists an administrator every built page they hold, in the navigation's order", () => {
    expect(staffNavigationOf(ADMINISTRATOR, ["audit", "kitchens"])).toEqual([
      "kitchens",
      "audit",
    ]);
  });

  it("leaves out a page that is not built, though the administrator holds its capability", () => {
    expect(staffNavigationOf(ADMINISTRATOR, ["kitchens"])).toEqual([
      "kitchens",
    ]);
    expect(staffNavigationOf(ADMINISTRATOR, [])).toEqual([]);
  });

  it.each([
    ["an unconfirmed operator", { role: "operator", isEmailVerified: false }],
    [
      "an unconfirmed administrator",
      { role: "administrator", isEmailVerified: false },
    ],
    ["a verified client", { role: "client", isEmailVerified: true }],
  ] as const)("lists %s nothing", (_label, holder) => {
    expect(staffNavigationOf(holder, ["kitchens", "audit"])).toEqual([]);
  });
});

describe("the pages the navigation may link to", () => {
  const LOCALE_DIRECTORY = join(
    import.meta.dirname,
    "../../../../src/app/[locale]",
  );
  const STAFF_PAGES_DIRECTORY = join(LOCALE_DIRECTORY, "staff");

  function navigablePagesOnDisk(): string[] {
    if (!existsSync(STAFF_PAGES_DIRECTORY)) return [];
    return readdirSync(STAFF_PAGES_DIRECTORY, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && PAGES.some((page) => page === entry.name),
      )
      .map((entry) => entry.name)
      .sort();
  }

  it("are exactly those with a page directory, so the navigation never links to a 404", () => {
    expect(existsSync(join(LOCALE_DIRECTORY, "account"))).toBe(true);
    expect([...BUILT_STAFF_PAGES].sort()).toEqual(navigablePagesOnDisk());
  });
});
