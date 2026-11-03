import type { Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

/**
 * Every staff page reads the frame's count through the same module. A price store that cannot be read must leave the pages
 * open without a count, and take down nothing but the publish page's own read: no staff page may fail to load, or be refused,
 * for it.
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
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => Promise.reject(new Error("the price store is down")),
}));

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

describe("a price store that cannot be read", () => {
  it("answers every read as unavailable, with no count", async () => {
    expect(await readPublishPage()).toEqual({ kind: "unavailable" });
    expect(await readVersionDetail("A".repeat(21))).toEqual({
      kind: "unavailable",
    });
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
