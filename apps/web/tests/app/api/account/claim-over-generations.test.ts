import type { DesignId } from "@lemnaria/configurator-domain";
import type {
  AuthorizedConfigurationRepository,
  DesignClaimRepository,
  DesignVersion,
  MintDesign,
  RateLimitBucket,
  VisitorDesignsClaim,
} from "@lemnaria/persistence";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

import {
  accountRequest,
  aDesignId,
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
  jsonOf,
  seedUnverifiedAccount,
  setCookieLinesOf,
  sha256Hex,
} from "../../../support/account-world";
import { UNUSED_STORE_READS } from "../../../support/unused-store-reads";

/**
 * Lot 2 U15-6 (plan M8B Lot 2 section 14.2): for n from 1 to 5 kitchens minted in one browser, after register and
 * confirm `GET /api/account/claim` answers `claimable: n`. If it does not, the A16B card's "o poti atasa" is false and
 * U15d does not ship.
 *
 * What is real: the mint route (`resolveVisitorForMint`, the cookie it sets), the confirm route (`verifyEmail`, the
 * sign-in count, the session it starts), the claim route's GET and POST, `readVisitorHash`, the capability check and
 * the limiter's decision. What is replaced: the database. `OneBrowserRowsStore` is the single place that stands in for
 * `designs`, and its `mint` does what `NeonConfigurationRepository.mintStatements` does (retag every row of
 * `fromVisitorHash`, then insert) and its claim does what `claimVisitorDesigns` does (`visitor_hash = $1 and account_id
 * is null`). That SQL itself is `packages/persistence`'s live suite; this file pins the web layer's half: that the
 * cookie chain a browser carries from mint to mint to confirm to claim names the same rows throughout.
 *
 * Registration is not driven through `POST /api/account/register` here: its mail is queued after the response and the
 * token it carries is not readable from the fake sender without the full mail pipeline. The account is seeded
 * unconfirmed and its confirmation token is issued through the store, which is the state registration leaves.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const MINT_PATH = "/api/designs";
const CLAIM_PATH = "/api/account/claim";
const CONFIRM_PATH = "/api/account/verify-email";
const SEED = 20261020;
const NUMBER_OF_RUNS = 25;
const MINTS_PER_BROWSER = fc.integer({ min: 1, max: 5 });

const store = vi.hoisted(() => ({ current: undefined as unknown }));
const countingLimiter = vi.hoisted(() => ({
  current: undefined as unknown,
}));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => store.current,
}));
vi.mock("@/lib/server/account/design-claim-instance", () => ({
  getDesignClaimRepository: () => store.current,
}));
vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
// The mint limiter's figure is 20 a day for one network block; a property that mints in many runs would be refused for a
// reason that is not its subject. Every bucket is counted as its first hit, the judgement stays the real one.
vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => countingLimiter.current,
}));

const { POST: mintRoute } = await import("@/app/api/designs/route");
const { POST: confirmRoute } = await import(
  "@/app/api/account/verify-email/route"
);
const { GET: claimCountRoute, POST: claimRoute } = await import(
  "@/app/api/account/claim/route"
);
const { mintEmailToken } = await import("@/lib/server/account/email-token");

interface HeldDesign {
  readonly id: DesignId;
  visitorHash: string;
  accountId: string | undefined;
}

class OneBrowserRowsStore
  implements
    Pick<AuthorizedConfigurationRepository, "mint">,
    DesignClaimRepository
{
  readonly rows: HeldDesign[] = [];

  mint({ visitor, accountId }: MintDesign): Promise<DesignVersion> {
    if (visitor.kind === "rotate") {
      for (const row of this.rows) {
        if (row.visitorHash === visitor.fromVisitorHash) {
          row.visitorHash = visitor.visitorHash;
        }
      }
    }
    const id = aDesignId();
    this.rows.push({ id, visitorHash: visitor.visitorHash, accountId });
    return Promise.resolve({ id, revision: "1" });
  }

  countClaimable(visitorHash: string): Promise<number> {
    return Promise.resolve(this.unclaimedOf(visitorHash).length);
  }

  claimVisitorDesigns({
    visitorHash,
    accountId,
  }: VisitorDesignsClaim): Promise<readonly DesignId[]> {
    const claimed = this.unclaimedOf(visitorHash);
    for (const row of claimed) row.accountId = accountId;
    return Promise.resolve(claimed.map((row) => row.id));
  }

  heldBy(accountId: string): readonly HeldDesign[] {
    return this.rows.filter((row) => row.accountId === accountId);
  }

  private unclaimedOf(visitorHash: string): HeldDesign[] {
    return this.rows.filter(
      (row) => row.visitorHash === visitorHash && row.accountId === undefined,
    );
  }
}

/** The cookies one browser holds, kept as a browser keeps them: each `Set-Cookie` replaces the one of its name. */
class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(answer: Response): void {
    for (const line of setCookieLinesOf(answer)) {
      const [pair = ""] = line.split(";");
      const separator = pair.indexOf("=");
      this.values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header(): string {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  visitorValue(): string | undefined {
    return this.values.get(VISITOR_COOKIE_NAME);
  }
}

let rows: OneBrowserRowsStore;

beforeEach(() => {
  countingLimiter.current = {
    recordHits: (buckets: readonly RateLimitBucket[]) =>
      Promise.resolve(buckets.map(() => 1)),
    ...UNUSED_STORE_READS,
  };
  captureConsole();
  startAFreshWorld();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function startAFreshWorld(): void {
  freshAccountWorld();
  rows = new OneBrowserRowsStore();
  store.current = rows;
}

async function mintOneKitchenIn(jar: CookieJar): Promise<void> {
  const before = jar.visitorValue();
  const answer = await mintRoute(
    accountRequest(MINT_PATH, {
      method: "POST",
      cookie: jar.header(),
    }),
  );
  expect(answer.status).toBe(201);
  jar.absorb(answer);
  expect(jar.visitorValue()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(jar.visitorValue()).not.toBe(before);
}

/** The state registration leaves (an unconfirmed account and its live token), then the confirmation link's own route. */
async function registerAndConfirmIn(
  jar: CookieJar,
  address: string,
): Promise<{ accountId: string; signInClaimable: unknown }> {
  const account = await seedUnverifiedAccount(address);
  const token = mintEmailToken();
  await currentAccountWorld().accounts.issueToken({
    accountId: account.id,
    purpose: "verify-email",
    tokenHash: token.hash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const answer = await confirmRoute(
    accountRequest(CONFIRM_PATH, {
      method: "POST",
      json: { token: token.value, password: account.password },
      cookie: jar.header(),
    }),
  );
  expect(answer.status).toBe(200);
  jar.absorb(answer);
  expect(jar.header()).toContain(`${SESSION_COOKIE_NAME}=`);
  const body = (await jsonOf(answer)) as { claimable: unknown };
  return { accountId: account.id, signInClaimable: body.claimable };
}

async function claimableFor(jar: CookieJar): Promise<unknown> {
  const answer = await claimCountRoute(
    accountRequest(CLAIM_PATH, { cookie: jar.header() }),
  );
  expect(answer.status).toBe(200);
  return ((await jsonOf(answer)) as { claimable: unknown }).claimable;
}

async function claimEverythingFor(jar: CookieJar): Promise<unknown> {
  const answer = await claimRoute(
    accountRequest(CLAIM_PATH, { method: "POST", cookie: jar.header() }),
  );
  expect(answer.status).toBe(200);
  return ((await jsonOf(answer)) as { claimed: unknown }).claimed;
}

describe("U15-6: the kitchens one browser mints stay claimable together", () => {
  propertyTest.prop([MINTS_PER_BROWSER], {
    seed: SEED,
    numRuns: NUMBER_OF_RUNS,
  })(
    "after register and confirm, the claim count is the number of kitchens minted (n = 1..5), and one claim takes all of them",
    async (mintCount) => {
      startAFreshWorld();
      const jar = new CookieJar();
      for (let minted = 0; minted < mintCount; minted += 1) {
        await mintOneKitchenIn(jar);
      }

      const { accountId, signInClaimable } = await registerAndConfirmIn(
        jar,
        "ana@example.test",
      );

      expect(signInClaimable).toBe(mintCount);
      expect(await claimableFor(jar)).toBe(mintCount);
      expect(await claimEverythingFor(jar)).toBe(mintCount);
      expect(rows.heldBy(accountId)).toHaveLength(mintCount);
      expect(await claimableFor(jar)).toBe(0);
    },
  );

  it("every kitchen of the browser sits under the one visitor hash of its last mint, whatever n", async () => {
    const jar = new CookieJar();
    for (let minted = 0; minted < 5; minted += 1) {
      await mintOneKitchenIn(jar);
    }

    const lastHash = sha256Hex(jar.visitorValue() ?? "");
    expect(rows.rows.map((row) => row.visitorHash)).toEqual(
      Array(5).fill(lastHash),
    );
  });

  propertyTest.prop(
    [
      fc.array(fc.constantFrom("first", "second"), {
        minLength: 1,
        maxLength: 8,
      }),
    ],
    { seed: SEED, numRuns: NUMBER_OF_RUNS },
  )(
    "two browsers minting in any interleaving each claim exactly their own kitchens and none of the other's",
    async (order) => {
      startAFreshWorld();
      const jars = { first: new CookieJar(), second: new CookieJar() };
      const minted = { first: 0, second: 0 };
      for (const browser of order) {
        await mintOneKitchenIn(jars[browser]);
        minted[browser] += 1;
      }
      const { accountId } = await registerAndConfirmIn(
        jars.first,
        "first@example.test",
      );

      expect(await claimableFor(jars.first)).toBe(minted.first);
      expect(await claimEverythingFor(jars.first)).toBe(minted.first);

      expect(rows.heldBy(accountId)).toHaveLength(minted.first);
      const unclaimed = rows.rows.filter((row) => row.accountId === undefined);
      expect(unclaimed).toHaveLength(minted.second);
    },
  );

  it("a browser that minted nothing has nothing to claim after register and confirm", async () => {
    const jar = new CookieJar();

    const { signInClaimable } = await registerAndConfirmIn(
      jar,
      "ana@example.test",
    );

    expect(signInClaimable).toBe(0);
    expect(await claimableFor(jar)).toBe(0);
  });
});
