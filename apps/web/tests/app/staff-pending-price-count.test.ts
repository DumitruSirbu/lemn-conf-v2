import type { Role } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import type { StaffAreaPage } from "@/staff/staff-paths";

/**
 * The count of waiting prices reaches every staff page through the gate: one read of the draft's count per page, only for a
 * person whose menu offers the publish page, handed on as it was read (a zero stays a zero, an unknown stays unknown), and
 * never the reason a page is refused. The session read and the framework are replaced; the gate and the pages' table are real.
 */

const reading = vi.hoisted(() => ({
  session: { kind: "anonymous" } as CurrentSession,
  count: vi.fn<() => Promise<number | undefined>>(),
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
vi.mock("@/price-dashboard/publish-source", () => ({
  readPendingPriceCount: () => reading.count(),
}));

const { readStaffPage } = await import("@/lib/server/staff/staff-page");

function signedIn(role: Role): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role,
    capabilities: [],
    isEmailVerified: true,
    email: "staff@example.test",
  };
}

const EVERY_PAGE: readonly StaffAreaPage[] = [
  "kitchens",
  "audit",
  "cabinets",
  "defaults",
  "publish",
];

async function shellOf(page: StaffAreaPage) {
  const read = await readStaffPage({ locale: "ro", page });
  if (read.kind !== "signed-in") throw new Error(`the page is ${read.kind}`);
  return read.shell;
}

beforeEach(() => {
  reading.count.mockReset();
  reading.session = signedIn("administrator");
});

describe("an administrator", () => {
  it.each(EVERY_PAGE)(
    "is handed the count the draft holds on the %s page",
    async (page) => {
      reading.count.mockResolvedValue(7);

      expect((await shellOf(page)).pendingPriceCount).toBe(7);
    },
  );

  it("is handed a zero as a zero, which the frame reads as 'all published'", async () => {
    reading.count.mockResolvedValue(0);

    const shell = await shellOf("kitchens");

    expect(shell.pendingPriceCount).toBe(0);
  });

  it("is handed no count when the count is not known", async () => {
    reading.count.mockResolvedValue(undefined);

    const shell = await shellOf("audit");

    expect(shell.pendingPriceCount).toBeUndefined();
    expect(shell.navigation).toContain("publish");
  });

  it("still gets the page when the count cannot be read: the number is a decoration, not a condition", async () => {
    reading.count.mockRejectedValue(new Error("the draft cannot be read"));

    const shell = await shellOf("kitchens");

    expect(shell.pendingPriceCount).toBeUndefined();
    expect(shell.navigation).toEqual([
      "kitchens",
      "audit",
      "cabinets",
      "defaults",
      "publish",
    ]);
  });

  it("reads the count once for a page", async () => {
    reading.count.mockResolvedValue(3);

    await shellOf("kitchens");

    expect(reading.count).toHaveBeenCalledTimes(1);
  });
});

describe("an operator, whose menu has no publish page", () => {
  it("is not handed a count and the draft is not read for them", async () => {
    reading.session = signedIn("operator");
    reading.count.mockResolvedValue(7);

    const shell = await shellOf("kitchens");

    expect(shell.pendingPriceCount).toBeUndefined();
    expect(shell.navigation).toEqual(["kitchens"]);
    expect(reading.count).not.toHaveBeenCalled();
  });
});
