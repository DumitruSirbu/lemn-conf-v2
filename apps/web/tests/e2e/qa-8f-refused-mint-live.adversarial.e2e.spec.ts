// A refused mint through the real route, store and database, for a browser that already owns designs: it is
// handed no cookie, its designs still open under the visitor it holds, every request was counted once, and of
// any number of mints sent at once no more than the day's twenty are made.
//
// It needs a server under the production policy, which is the first server's production build started again on
// a port of its own, so it runs under CI only. What it cannot see: a design row whose id no answer gave.
import { expect, test } from "@playwright/test";

import {
  MINT_DAILY_FIGURE,
  MINT_POLICY_NAME,
} from "../../src/lib/server/rate-limit/limit-policy";
import { removeCountersOfTheRun } from "./support/e2e-rate-limit-run";
import {
  deleteMintedDesigns,
  findMintedDesignIds,
} from "./support/minted-designs";
import type { ProductionPolicyServer } from "./support/production-policy-server";

/** A port of this spec's own, so the server it starts never meets the one another spec starts beside the suite's. */
const OWN_PORT = "4323";
const PORT_VARIABLE = "E2E_PRODUCTION_POLICY_PORT";
const SERVER_START_TIMEOUT_MS = 300_000;
const MINTS_OF_THE_OWNER = 14;
const MINTS_SENT_AT_ONCE = 12;
const ROOM_LEFT = MINT_DAILY_FIGURE - MINTS_OF_THE_OWNER;

const RUN_UNDER_CI =
  "It needs the production build the first server makes under CI, and builds nothing itself. Run it with: " +
  "CI=1 pnpm --filter @lemnaria/web exec playwright test " +
  "tests/e2e/qa-8f-refused-mint-live.adversarial.e2e.spec.ts --project=mobile";

interface Answer {
  readonly status: number;
  readonly setCookies: readonly string[];
  readonly retryAfter: string | null;
  readonly body: unknown;
}

/** The cookies a browser would hold: each answer's `Set-Cookie` replaces the cookie of the same name. */
class CookieJar {
  private readonly valuesByName = new Map<string, string>();

  keep(setCookies: readonly string[]): void {
    for (const setCookie of setCookies) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      this.valuesByName.set(
        pair.slice(0, separator),
        pair.slice(separator + 1),
      );
    }
  }

  header(): string {
    return [...this.valuesByName]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function ask(
  server: ProductionPolicyServer,
  path: string,
  init: { method: "GET" | "POST"; cookie?: string },
): Promise<Answer> {
  const response = await fetch(`${server.origin}${path}`, {
    method: init.method,
    headers: {
      "sec-fetch-site": "same-origin",
      ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
    },
  });
  return {
    status: response.status,
    setCookies: response.headers.getSetCookie(),
    retryAfter: response.headers.get("retry-after"),
    body: await response.json().catch(() => undefined),
  };
}

function idOf(answer: Answer): string {
  const { id } = answer.body as { id?: unknown };
  if (typeof id !== "string") throw new Error("the mint answered no id");
  return id;
}

test.describe("a refused mint, for a browser that owns designs", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  const mintedIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    process.env[PORT_VARIABLE] = OWN_PORT;
    const { startProductionPolicyServer } = await import(
      "./support/production-policy-server"
    );
    server = await startProductionPolicyServer();
  });

  test.afterAll(async () => {
    await server?.stop();
    await deleteMintedDesigns(mintedIds);
  });

  test("leaves its cookies, its designs and the day's count as they were, and never makes a twenty-first", async () => {
    if (server === undefined) throw new Error("the server did not start");
    const origin = server;
    const jar = new CookieJar();
    const ownedIds: string[] = [];
    for (let made = 0; made < MINTS_OF_THE_OWNER; made += 1) {
      const answer = await ask(origin, "/api/designs", {
        method: "POST",
        cookie: jar.header(),
      });
      jar.keep(answer.setCookies);
      ownedIds.push(idOf(answer));
    }
    mintedIds.push(...ownedIds);

    const atOnce = await Promise.all(
      Array.from({ length: MINTS_SENT_AT_ONCE }, () =>
        ask(origin, "/api/designs", { method: "POST" }),
      ),
    );
    const madeAtOnce = atOnce.filter(({ status }) => status === 201);
    mintedIds.push(...madeAtOnce.map(idOf));

    const cookiesBefore = jar.header();
    const refused = await ask(origin, "/api/designs", {
      method: "POST",
      cookie: cookiesBefore,
    });
    const stillOpen = [];
    for (const id of ownedIds) {
      const read = await ask(origin, `/api/designs/${id}`, {
        method: "GET",
        cookie: cookiesBefore,
      });
      stillOpen.push(read.status);
    }
    const withoutTheVisitor = await ask(
      origin,
      `/api/designs/${ownedIds[0] ?? ""}`,
      {
        method: "GET",
      },
    );
    const counted = await removeCountersOfTheRun(
      origin.secret,
      MINT_POLICY_NAME,
    );

    expect(madeAtOnce).toHaveLength(ROOM_LEFT);
    expect(atOnce.filter(({ status }) => status === 429)).toHaveLength(
      MINTS_SENT_AT_ONCE - ROOM_LEFT,
    );
    expect(refused.status).toBe(429);
    expect(refused.setCookies).toEqual([]);
    expect(refused.body).toEqual({
      error: "The limit on new designs is reached for today.",
      code: "MINT_LIMIT_REACHED",
    });
    expect(stillOpen).toEqual(new Array<number>(MINTS_OF_THE_OWNER).fill(200));
    expect(withoutTheVisitor.status).toBe(404);
    expect(await findMintedDesignIds(mintedIds)).toHaveLength(
      MINT_DAILY_FIGURE,
    );
    expect(counted).toEqual({
      rowsRemoved: 1,
      mintsCounted: MINTS_OF_THE_OWNER + MINTS_SENT_AT_ONCE + 1,
    });
  });
});
