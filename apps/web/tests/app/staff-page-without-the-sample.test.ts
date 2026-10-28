import type { Role } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

/**
 * The invented prices are built by computation, and every staff page reads the frame's count through the same module. A
 * sample that cannot be built (a domain change that its books no longer satisfy) must take down the publish page in a build
 * that shows samples, and nothing in a build that does not: no staff page may fail to load, or be refused, for it.
 */

const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === SESSION_COOKIE_NAME ? { value: "x".repeat(43) } : undefined,
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
vi.mock("@/price-dashboard/publish-sample", () => {
  throw new Error("the sample books do not make books");
});

const { readStaffPage } = await import("@/lib/server/staff/staff-page");
const { readPendingPriceCount, readPublishPage, readVersionDetail } =
  await import("@/price-dashboard/publish-source");

function signedInAdministrator(): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role: "administrator" satisfies Role,
    capabilities: [],
    isEmailVerified: true,
    email: "staff@example.test",
  };
}

beforeEach(() => {
  reading.session = signedInAdministrator();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a production build whose sample cannot be built", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("still answers every read as unavailable, because it never loads the sample", async () => {
    expect(await readPublishPage()).toEqual({ kind: "unavailable" });
    expect(await readVersionDetail("any")).toEqual({ kind: "unavailable" });
    expect(await readPendingPriceCount()).toBeUndefined();
  });

  it.each(["kitchens", "audit", "cabinets", "publish"] as const)(
    "still opens the %s page to an administrator, with no count",
    async (page) => {
      const read = await readStaffPage({ locale: "ro", page });

      expect(read.kind).toBe("signed-in");
      if (read.kind !== "signed-in") return;
      expect(read.shell.pendingPriceCount).toBeUndefined();
      expect(read.shell.navigation).toContain("publish");
    },
  );
});

describe("a build that shows samples, whose sample cannot be built", () => {
  it("fails the publish page's own read, where the sample is wanted", async () => {
    await expect(readPublishPage()).rejects.toThrow();
  });

  it("does not refuse a staff page for the count: the page opens without one", async () => {
    const read = await readStaffPage({ locale: "ro", page: "kitchens" });

    expect(read.kind).toBe("signed-in");
    if (read.kind !== "signed-in") return;
    expect(read.shell.pendingPriceCount).toBeUndefined();
  });
});
