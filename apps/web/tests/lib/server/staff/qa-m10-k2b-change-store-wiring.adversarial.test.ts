import { afterEach, describe, expect, it, vi } from "vitest";

import { getKitchenChangeStore } from "@/lib/server/staff/kitchen-change-store-instance";

/**
 * The seen route's production store is this module's, unmocked. A route whose store is a call that throws marks no
 * kitchen seen for anyone, so no badge can ever clear. The instance is made on first use and never at import, as the
 * staff kitchen reader's is, so building the app opens no connection.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the kitchen change store the seen route uses in production", () => {
  it("is a store with the marking method, not a call that throws", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://application:placeholder@localhost/placeholder",
    );

    const store = getKitchenChangeStore();

    expect(typeof store.markSeen).toBe("function");
  });

  it("is the one instance for every call, as the reader's is", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://application:placeholder@localhost/placeholder",
    );

    expect(getKitchenChangeStore()).toBe(getKitchenChangeStore());
  });
});
