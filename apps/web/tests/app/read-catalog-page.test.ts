import type { Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

/**
 * The gate of the price dashboard's pages must never be a looser door than the signed-in gate asked for `price.edit`: a
 * page of it opens for exactly the sessions that gate opens for, and only for staff among them. The session read and the
 * framework's redirect are replaced; the capability table, the cookie name and the gates are the real ones.
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

const { readCatalogPage } = await import(
  "../../src/app/[locale]/staff/catalog/_lib/read-catalog-page"
);
const { readSignedInPage } = await import(
  "@/lib/server/account/signed-in-page"
);

const STAFF_ADDRESS = "staff@example.test";

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

describe("readCatalogPage is no looser than the signed-in gate asked for price.edit", () => {
  it.each(CALLERS)(
    "opens the page for $label exactly when that gate does, and only for staff",
    async (caller) => {
      become(caller);
      const catalog = await outcomeOf(() => readCatalogPage({ locale: "ro" }));
      const priceGate = await outcomeOf(() =>
        readSignedInPage({ locale: "ro", capability: "price.edit" }),
      );

      expect(catalog === "signed-in").toBe(
        priceGate === "signed-in" &&
          caller.session.kind === "signed-in" &&
          ["operator", "administrator"].includes(caller.session.role),
      );
    },
  );

  it("sends a visitor to the plain login page and an expired session to the expired one", async () => {
    become(callerNamed("a visitor"));
    const visitor = await outcomeOf(() => readCatalogPage({ locale: "ru" }));
    become(callerNamed("a cookie that names no live session"));
    const expired = await outcomeOf(() => readCatalogPage({ locale: "ru" }));

    expect(visitor).toBe("redirect:/ru/account/login");
    expect(expired).toBe("redirect:/ru/account/login?reason=session-expired");
  });

  it("answers an unreadable session store with unavailable, never with a sign-in", async () => {
    become(callerNamed("a session store that cannot be read"));

    expect(await outcomeOf(() => readCatalogPage({ locale: "ro" }))).toBe(
      "unavailable",
    );
  });

  it("is the framework's not-found for a locale the site does not serve", async () => {
    become(callerNamed("a verified administrator"));

    expect(await outcomeOf(() => readCatalogPage({ locale: "xx" }))).toBe(
      "not-found",
    );
  });
});

describe("what each kind of account is shown", () => {
  it.each([
    "a verified client",
    "an unconfirmed client",
    "a role the table does not know",
  ])(
    "gives %s the account area's 403 and nothing of the staff area",
    async (label) => {
      become(callerNamed(label));

      expect(await readCatalogPage({ locale: "ro" })).toEqual({
        kind: "forbidden",
      });
    },
  );

  it("gives a verified operator the 403 inside the staff frame, with only the customers' page in the menu", async () => {
    become(callerNamed("a verified operator"));

    expect(await readCatalogPage({ locale: "ro" })).toEqual({
      kind: "staff-forbidden",
      shell: {
        role: "operator",
        email: STAFF_ADDRESS,
        navigation: ["kitchens"],
      },
    });
  });

  it.each(["an unconfirmed administrator", "an unconfirmed operator"])(
    "gives %s the account area's 403, as the staff gate does: an unconfirmed address holds no staff capability",
    async (label) => {
      become(callerNamed(label));

      expect(await readCatalogPage({ locale: "ro" })).toEqual({
        kind: "forbidden",
      });
    },
  );

  it("opens the page for a verified administrator, whose menu lists the built catalog pages after the staff pages", async () => {
    become(callerNamed("a verified administrator"));

    expect(await readCatalogPage({ locale: "ro" })).toEqual({
      kind: "signed-in",
      shell: {
        role: "administrator",
        email: STAFF_ADDRESS,
        navigation: ["kitchens", "audit", "cabinets"],
      },
    });
  });
});
