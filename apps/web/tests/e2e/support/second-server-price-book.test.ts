import { describe, expect, it } from "vitest";

import { selectPriceStores } from "@/lib/server/price-stores";

import { environmentOfTheServer } from "./production-policy-server";

// A second server is a production build the runner starts beside the suite's own. The suite's server is given the
// seeded price stores by `playwright.config.ts`, which the runner's environment never holds, so the second server's
// environment must carry the opt-in itself: without it every page it serves prices nothing (A-10, RK-16).

const OWN_VALUES = {
  secret: "a-secret-of-its-own",
  origin: "http://localhost:4399",
};
const UNREACHABLE_DATABASE_URL =
  "postgresql://nobody@unreachable.invalid:5432/none";

describe("the environment of a second e2e server", () => {
  it("selects the seeded price stores, with and without a network source of its own", () => {
    const options = { unreachableDatabaseUrl: UNREACHABLE_DATABASE_URL };

    const plain = environmentOfTheServer(OWN_VALUES, options);
    const namingASource = environmentOfTheServer(OWN_VALUES, {
      ...options,
      networkSource: "vercel",
    });

    expect(selectPriceStores({ ...plain, NODE_ENV: "production" })).toBe(
      "seeded-fakes",
    );
    expect(
      selectPriceStores({ ...namingASource, NODE_ENV: "production" }),
    ).toBe("seeded-fakes");
  });
});
