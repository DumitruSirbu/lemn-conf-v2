import { expect, test } from "@playwright/test";

import { MINT_POLICY_NAME } from "../../src/lib/server/rate-limit/limit-policy";
import { removeCountersOfTheRun } from "./support/e2e-rate-limit-run";
import {
  deleteMintedDesigns,
  findMintedDesignIds,
} from "./support/minted-designs";
import {
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

const MINTS_ALLOWED_A_DAY = 20;
const SERVER_START_TIMEOUT_MS = 300_000;
const LONGEST_WAIT_SECONDS = 90_000;

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

test.describe("the mint's own limit, through the real route, store and database", () => {
  let server: ProductionPolicyServer | undefined;
  const mintedIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    server = await startProductionPolicyServer();
  });

  test.afterAll(async () => {
    await server?.stop();
    await deleteMintedDesigns(mintedIds);
  });

  test("allows twenty mints from one shared bucket and refuses the twenty-first, writing nothing", async () => {
    if (server === undefined)
      throw new Error("the second server did not start");
    const allowed: MintAnswer[] = [];
    for (let mint = 0; mint < MINTS_ALLOWED_A_DAY; mint += 1) {
      allowed.push(await mintOn(server));
    }
    for (const answer of allowed) {
      const body = answer.body as { id?: string };
      if (typeof body.id === "string") mintedIds.push(body.id);
    }

    const refused = await mintOn(server);

    expect(allowed.map((answer) => answer.status)).toEqual(
      new Array<number>(MINTS_ALLOWED_A_DAY).fill(201),
    );
    expect(refused.status).toBe(429);
    const wait = Number(refused.retryAfter);
    expect(
      Number.isInteger(wait) && wait >= 1 && wait <= LONGEST_WAIT_SECONDS,
    ).toBe(true);
    expect(refused.body).toEqual({
      error: "The limit on new designs is reached for today.",
      code: "MINT_LIMIT_REACHED",
    });
    expect(refused.setCookies).toEqual([]);
    expect(await findMintedDesignIds(mintedIds)).toHaveLength(
      MINTS_ALLOWED_A_DAY,
    );

    const counted = await removeCountersOfTheRun(
      server.secret,
      MINT_POLICY_NAME,
    );
    expect(counted.mintsCounted).toBe(MINTS_ALLOWED_A_DAY + 1);
  });

  test("is not the policy the suite's own server runs under: that one is counted apart, under its own secret", async ({
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
