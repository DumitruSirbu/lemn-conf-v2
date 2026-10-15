import { expect, test } from "@playwright/test";

import { LONGEST_DAY_SECONDS } from "../../src/lib/server/rate-limit/chisinau-day";
import {
  MINT_DAILY_FIGURE,
  MINT_POLICY_NAME,
} from "../../src/lib/server/rate-limit/limit-policy";
import { removeCountersOfTheRun } from "./support/e2e-rate-limit-run";
import {
  deleteMintedDesigns,
  findMintedDesignIds,
} from "./support/minted-designs";
import {
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

const SERVER_START_TIMEOUT_MS = 300_000;

interface MintAnswer {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly setCookies: readonly string[];
  readonly body: unknown;
}

async function mintOn(server: ProductionPolicyServer): Promise<MintAnswer> {
  const response = await fetch(`${server.origin}/api/designs`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    setCookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

const RUN_UNDER_CI =
  "It needs the production build the first server makes under CI, and builds nothing itself. Run it with: " +
  "CI=1 pnpm --filter @lemnaria/web exec playwright test " +
  "tests/e2e/mint-limit-production-policy.e2e.spec.ts --project=mobile";

test.describe("the mint's own limit, through the real route, store and database", () => {
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test.describe("under the production policy, on a second server", () => {
    test.skip(process.env.CI === undefined, RUN_UNDER_CI);

    let server: ProductionPolicyServer | undefined;

    test.beforeAll(async () => {
      test.setTimeout(SERVER_START_TIMEOUT_MS);
      server = await startProductionPolicyServer();
    });

    test.afterAll(async () => {
      await server?.stop();
    });

    test("allows twenty mints from one shared bucket and refuses the twenty-first, writing nothing", async () => {
      if (server === undefined)
        throw new Error("the second server did not start");
      const allowed: MintAnswer[] = [];
      for (let mint = 0; mint < MINT_DAILY_FIGURE; mint += 1) {
        allowed.push(await mintOn(server));
      }
      for (const answer of allowed) {
        const body = answer.body as { id?: string };
        if (typeof body.id === "string") mintedIds.push(body.id);
      }

      const refused = await mintOn(server);

      expect(allowed.map((answer) => answer.status)).toEqual(
        new Array<number>(MINT_DAILY_FIGURE).fill(201),
      );
      expect(refused.status).toBe(429);
      const wait = Number(refused.retryAfter);
      expect(
        Number.isInteger(wait) && wait >= 1 && wait <= LONGEST_DAY_SECONDS,
      ).toBe(true);
      expect(refused.body).toEqual({
        error: "The limit on new designs is reached for today.",
        code: "MINT_LIMIT_REACHED",
      });
      expect(refused.setCookies).toEqual([]);
      expect(await findMintedDesignIds(mintedIds)).toHaveLength(
        MINT_DAILY_FIGURE,
      );

      const counted = await removeCountersOfTheRun(
        server.secret,
        MINT_POLICY_NAME,
      );
      expect(counted.mintsCounted).toBe(MINT_DAILY_FIGURE + 1);
    });
  });

  test("allows a mint on the suite's own server, which the run's teardown then counts", async ({
    request,
  }) => {
    const response = await request.post("/api/designs", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const body = (await response.json()) as { id?: string };
    if (typeof body.id === "string") mintedIds.push(body.id);

    expect(response.status()).toBe(201);
  });
});
