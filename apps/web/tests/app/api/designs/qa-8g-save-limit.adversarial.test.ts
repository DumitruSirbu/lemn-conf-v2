// The limit on saves through the real route, counted in the shared setup's in-memory store with nothing of the
// limiter replaced: what a refused save writes and where, who can spend whose bucket, the figure and the next
// save for each bucket alone and together, and that a save which cannot be judged is never stored.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { RateLimitBucket } from "@lemnaria/persistence";
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  E2E_SAVES_PER_BLOCK_FIGURE,
  SAVES_PER_BLOCK_FIGURE,
  SAVES_PER_CREDENTIAL_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { everyReadingOf } from "../../../lib/server/mail/qa-8j-support";
import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../../../lib/server/mail/mail-test-support";

const SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";
const FLAG_VARIABLE = "LEMNARIA_E2E_RATE_LIMIT_POLICY";
const SECRET_VARIABLE = "DIGEST_SECRET";
const USABLE_SECRET = "5d81c0".repeat(10) + "0a1b";
const A_DESIGN = "QaDesign5d81c0QaDesig";
const ANOTHER_DESIGN = "QaOther5d81c0QaOtherX";
const OWNER_TOKEN = "QA-OWNER-TOKEN-5d81c0";
const ONE_BLOCK = "203.0.113.7";
const ANOTHER_BLOCK = "198.51.100.7";
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const MINUTES_INTO_THE_HOUR = 7;
const AN_HOUR_STARTS = Date.parse("2026-11-03T14:00:00.000Z");
const STORED = 200;
/** What a save answers once the limiter let it through with a body that is no design: the body was read. */
const BODY_REFUSED = 400;
const LIMITED = 429;
const UNAVAILABLE = 503;

const saved = vi.hoisted(() => ({ designs: [] as unknown[] }));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    saveAuthorized: (write: { id: string }) => {
      saved.designs.push(write);
      return Promise.resolve({
        id: write.id,
        revision: String(saved.designs.length + 1),
        ownsVisitor: false,
      });
    },
  }),
}));

const route = await import("../../../../src/app/api/designs/[id]/route");

interface Save {
  readonly design?: string;
  readonly token?: string | undefined;
  readonly from?: string;
  readonly revision?: string | undefined;
  readonly body?: string;
}

function requestOf(method: "PUT" | "PATCH", save: Save): NextRequest {
  const design = save.design ?? A_DESIGN;
  const token = "token" in save ? save.token : OWNER_TOKEN;
  const revision = "revision" in save ? save.revision : "1";
  return new NextRequest(`https://lemnaria.test/api/designs/${design}`, {
    method,
    headers: {
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": save.from ?? ONE_BLOCK,
      ...(token === undefined
        ? {}
        : { cookie: `lemnaria_write_token_${design}=${token}` }),
      ...(revision === undefined ? {} : { "x-expected-revision": revision }),
    },
    body: save.body ?? "{}",
  });
}

function hitsRecorded() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

type HitsSpy = ReturnType<typeof hitsRecorded>;

function bucketsHit(spy: HitsSpy): RateLimitBucket[] {
  return spy.mock.calls.flatMap(([buckets]) => [...buckets]);
}

function standAt(instantMs: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instantMs));
}

beforeEach(() => {
  saved.designs.length = 0;
  vi.stubEnv(SECRET_VARIABLE, USABLE_SECRET);
  vi.stubEnv(SOURCE_VARIABLE, "vercel");
  vi.stubEnv(FLAG_VARIABLE, undefined as unknown as string);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(["PUT", "PATCH"] as const)(
  "%s of a design, under a named host",
  (method) => {
    function send(save: Save = {}): Promise<NextResponse> {
      const request = requestOf(method, save);
      return route[method](request, {
        params: Promise.resolve({ id: save.design ?? A_DESIGN }),
      });
    }

    /** The block's bucket and the credential's, as one allowed save of `save` is counted in them. */
    async function bucketsOf(save: Save = {}) {
      const spy = hitsRecorded();
      const { status } = await send(save);
      const [block, credential] = bucketsHit(spy);
      spy.mockRestore();
      if (status !== BODY_REFUSED || !block || !credential) {
        throw new Error("the save was not counted in two buckets");
      }
      return { block, credential };
    }

    /** Counts until `bucket` holds `count` hits, one of which a save already made. */
    async function fillTo(
      bucket: RateLimitBucket,
      count: number,
    ): Promise<void> {
      for (let hit = 1; hit < count; hit += 1) {
        await getRateLimitStore().recordHits([bucket]);
      }
    }

    describe("a save its block refuses", () => {
      it("is counted against the block alone: no row is written for its credential", async () => {
        const { block, credential } = await bucketsOf();
        await fillTo(block, SAVES_PER_BLOCK_FIGURE);
        const hits = hitsRecorded();

        const refused = await send();

        expect(refused.status).toBe(LIMITED);
        expect(bucketsHit(hits).map(({ key }) => key)).toEqual([block.key]);
        expect(credential.key).not.toBe(block.key);
      });

      it("reads no body, stores nothing, and sets, clears or refreshes no cookie", async () => {
        const { block } = await bucketsOf();
        await fillTo(block, SAVES_PER_BLOCK_FIGURE);
        const request = requestOf(method, {
          body: JSON.stringify(KITCHEN_L_DESIGN),
        });

        const refused = await route[method](request, {
          params: Promise.resolve({ id: A_DESIGN }),
        });

        expect(refused.status).toBe(LIMITED);
        expect(request.bodyUsed).toBe(false);
        expect(saved.designs).toEqual([]);
        expect(refused.headers.getSetCookie()).toEqual([]);
      });

      it("writes a row for no credential however many a caller invents once the block is spent", async () => {
        const { block } = await bucketsOf();
        const roomLeft = 10;
        await fillTo(block, SAVES_PER_BLOCK_FIGURE - roomLeft);
        const hits = hitsRecorded();
        const statuses: number[] = [];
        for (let invented = 0; invented < 3 * roomLeft; invented += 1) {
          statuses.push(
            (await send({ token: `QA-INVENTED-${String(invented)}` })).status,
          );
        }

        const keysBesideTheBlock = new Set(
          bucketsHit(hits)
            .map(({ key }) => key)
            .filter((key) => key !== block.key),
        );
        expect(statuses.filter((status) => status === LIMITED)).toHaveLength(
          2 * roomLeft,
        );
        expect(keysBesideTheBlock.size).toBe(roomLeft);
      });
    });

    describe("whose bucket a save spends", () => {
      it("never spends an owner's allowance with a credential a stranger invents for the same design", async () => {
        const stranger = { token: "QA-INVENTED-TOKEN", from: ANOTHER_BLOCK };
        const owners = await bucketsOf();
        const strangers = await bucketsOf(stranger);
        await fillTo(strangers.credential, SAVES_PER_CREDENTIAL_FIGURE);

        const strangerNext = await send(stranger);
        const ownerNext = await send();

        expect(strangers.credential.key).not.toBe(owners.credential.key);
        expect(strangerNext.status).toBe(LIMITED);
        expect(ownerNext.status).toBe(BODY_REFUSED);
      });

      it("counts one credential under one key from two blocks, and refuses it from either at its figure", async () => {
        const fromOne = await bucketsOf();
        const fromAnother = await bucketsOf({ from: ANOTHER_BLOCK });
        await fillTo(fromOne.credential, SAVES_PER_CREDENTIAL_FIGURE - 1);

        const refusedFromOne = await send();
        const refusedFromAnother = await send({ from: ANOTHER_BLOCK });

        expect(fromAnother.credential.key).toBe(fromOne.credential.key);
        expect(fromAnother.block.key).not.toBe(fromOne.block.key);
        expect([refusedFromOne.status, refusedFromAnother.status]).toEqual([
          LIMITED,
          LIMITED,
        ]);
      });

      it("counts two designs of one block under one block key and two credential keys", async () => {
        const one = await bucketsOf();
        const other = await bucketsOf({
          design: ANOTHER_DESIGN,
          token: "QA-OTHER-TOKEN",
        });

        expect(other.block.key).toBe(one.block.key);
        expect(other.credential.key).not.toBe(one.credential.key);
      });

      it("refuses a third design of a block whose two designs have spent the block between them", async () => {
        const one = await bucketsOf();
        await bucketsOf({ design: ANOTHER_DESIGN, token: "QA-OTHER-TOKEN" });
        await fillTo(one.block, SAVES_PER_BLOCK_FIGURE - 1);

        const third = await send({
          design: "QaThird5d81c0",
          token: "QA-THIRD",
        });
        const fromAnotherBlock = await send({ from: ANOTHER_BLOCK });

        expect(third.status).toBe(LIMITED);
        expect(fromAnotherBlock.status).toBe(BODY_REFUSED);
      });

      it("does not let a credential in a cookie named for another design count for this one", async () => {
        const hits = hitsRecorded();
        const request = new NextRequest(
          `https://lemnaria.test/api/designs/${A_DESIGN}`,
          {
            method,
            headers: {
              "x-expected-revision": "1",
              cookie: `lemnaria_write_token_${ANOTHER_DESIGN}=${OWNER_TOKEN}`,
            },
            body: "{}",
          },
        );

        const refused = await route[method](request, {
          params: Promise.resolve({ id: A_DESIGN }),
        });

        expect(refused.status).toBe(403);
        expect(hits).not.toHaveBeenCalled();
      });
    });

    describe("each figure, and the save after it", () => {
      it("stores the credential's last allowed save and refuses the next, counting both buckets for it", async () => {
        const { block, credential } = await bucketsOf();
        await fillTo(credential, SAVES_PER_CREDENTIAL_FIGURE - 1);
        const design = JSON.stringify(KITCHEN_L_DESIGN);

        const lastAllowed = await send({ body: design });
        const hits = hitsRecorded();
        const next = await send({ body: design });

        expect(lastAllowed.status).toBe(STORED);
        expect(next.status).toBe(LIMITED);
        expect(saved.designs).toHaveLength(1);
        expect(bucketsHit(hits).map(({ key }) => key)).toEqual([
          block.key,
          credential.key,
        ]);
      });

      it("allows the block's last save and refuses the next, whatever credential carries it", async () => {
        const { block } = await bucketsOf();
        await fillTo(block, SAVES_PER_BLOCK_FIGURE - 1);

        const lastAllowed = await send({ token: "QA-ANOTHER-CREDENTIAL" });
        const next = await send({ token: "QA-A-THIRD-CREDENTIAL" });

        expect([lastAllowed.status, next.status]).toEqual([
          BODY_REFUSED,
          LIMITED,
        ]);
      });

      it("refuses at the block, and counts the block alone, when both buckets are past their figures", async () => {
        const { block, credential } = await bucketsOf();
        await fillTo(credential, SAVES_PER_CREDENTIAL_FIGURE + 1);
        await fillTo(block, SAVES_PER_BLOCK_FIGURE);
        const hits = hitsRecorded();

        const refused = await send();

        expect(refused.status).toBe(LIMITED);
        expect(bucketsHit(hits).map(({ key }) => key)).toEqual([block.key]);
      });

      it("keeps the credential's figure under the e2e flag, where only the block has a twin", async () => {
        spyOnEveryConsoleMethod();
        vi.stubEnv(SOURCE_VARIABLE, undefined as unknown as string);
        vi.stubEnv(FLAG_VARIABLE, "1");
        const { block, credential } = await bucketsOf();
        await fillTo(credential, SAVES_PER_CREDENTIAL_FIGURE);
        const atTheCredential = await send();
        // The block holds two hits already: the one that named the buckets and the save refused at the credential.
        await fillTo(block, E2E_SAVES_PER_BLOCK_FIGURE - 2);

        const lastOfTheBlock = await send({ token: "QA-ANOTHER-CREDENTIAL" });
        const pastTheBlock = await send({ token: "QA-A-THIRD-CREDENTIAL" });

        expect(atTheCredential.status).toBe(LIMITED);
        expect([lastOfTheBlock.status, pastTheBlock.status]).toEqual([
          BODY_REFUSED,
          LIMITED,
        ]);
      });
    });

    describe("the clock hour a save is counted in", () => {
      it("tells a refused save the hour at its first instant and one second in its last millisecond", async () => {
        standAt(AN_HOUR_STARTS);
        const { block } = await bucketsOf();
        await fillTo(block, SAVES_PER_BLOCK_FIGURE);
        const atTheStart = await send();
        standAt(AN_HOUR_STARTS + HOUR_MS - 1);

        const atTheEnd = await send();

        expect([...atTheStart.headers].sort()).toEqual([
          ["cache-control", "no-store"],
          ["content-type", "application/json"],
          ["retry-after", "3600"],
        ]);
        expect(atTheEnd.headers.get("Retry-After")).toBe("1");
      });

      it("allows a save again at the instant the hour turns, in both buckets", async () => {
        standAt(AN_HOUR_STARTS + 1);
        const { block, credential } = await bucketsOf();
        await fillTo(credential, SAVES_PER_CREDENTIAL_FIGURE + 1);
        await fillTo(block, SAVES_PER_BLOCK_FIGURE + 1);
        const refused = await send();
        standAt(AN_HOUR_STARTS + HOUR_MS);

        const theNextHour = await send();

        expect([refused.status, theNextHour.status]).toEqual([
          LIMITED,
          BODY_REFUSED,
        ]);
      });

      it("counts both buckets in the hour the save arrived in, though the hour turns between the counts", async () => {
        standAt(AN_HOUR_STARTS + HOUR_MS - 5);
        const store = getRateLimitStore();
        const count = store.recordHits.bind(store);
        const hits = hitsRecorded().mockImplementation((buckets) => {
          vi.setSystemTime(new Date(AN_HOUR_STARTS + HOUR_MS + 5));
          return count(buckets);
        });

        await send();

        const windows = bucketsHit(hits).map(({ window }) =>
          window.startsAt.toISOString(),
        );
        expect(windows).toEqual([
          new Date(AN_HOUR_STARTS).toISOString(),
          new Date(AN_HOUR_STARTS).toISOString(),
        ]);
      });
    });

    describe("a save the route refuses before it is counted", () => {
      it.each([
        ["no credential for the design", { token: undefined }, 403],
        ["no revision", { revision: undefined }, 400],
        ["a revision that is no revision", { revision: "latest" }, 400],
      ])("is never counted, with %s", async (_label, save, status) => {
        const hits = hitsRecorded();
        const statuses = new Set<number>();
        for (let sent = 0; sent < 20; sent += 1) {
          statuses.add((await send(save)).status);
        }

        expect([...statuses]).toEqual([status]);
        expect(hits).not.toHaveBeenCalled();
      });
    });

    describe("a save that cannot be judged", () => {
      const design = JSON.stringify(KITCHEN_L_DESIGN);

      const UNJUDGEABLE: readonly [string, () => void][] = [
        [
          "the store fails at the block",
          () => {
            hitsRecorded().mockRejectedValue(new Error("QA-STORE-DOWN"));
          },
        ],
        [
          "the store fails at the credential, the block already counted",
          () => {
            hitsRecorded()
              .mockResolvedValueOnce([1])
              .mockRejectedValue(new Error("QA-STORE-DOWN"));
          },
        ],
        [
          "the store throws before it answers",
          () => {
            hitsRecorded().mockImplementation(() => {
              throw new Error("QA-STORE-DOWN");
            });
          },
        ],
        [
          "the store answers what is no count",
          () => {
            hitsRecorded().mockResolvedValue([0]);
          },
        ],
        [
          "the secret is unusable",
          () => {
            vi.stubEnv(SECRET_VARIABLE, "");
          },
        ],
        [
          "the source is no host",
          () => {
            vi.stubEnv(SOURCE_VARIABLE, "not-a-host");
          },
        ],
        [
          "the e2e flag stands beside the host",
          () => {
            vi.stubEnv(FLAG_VARIABLE, "1");
          },
        ],
      ];

      it.each(UNJUDGEABLE)(
        "is never stored and never a 500 when %s: the one fixed 503, with no wait and no cookie",
        async (_label, arrange) => {
          spyOnEveryConsoleMethod();
          arrange();
          const request = requestOf(method, { body: design });

          const response = await route[method](request, {
            params: Promise.resolve({ id: A_DESIGN }),
          });

          expect(response.status).toBe(UNAVAILABLE);
          expect([...response.headers].sort()).toEqual([
            ["cache-control", "no-store"],
            ["content-type", "application/json"],
          ]);
          expect(await response.json()).toEqual({
            error: expect.any(String) as string,
            code: "SAVE_UNAVAILABLE",
          });
          expect(saved.designs).toEqual([]);
          expect(request.bodyUsed).toBe(false);
        },
      );
    });

    describe("what a refused or unjudged save says and writes", () => {
      it("holds no address, block, credential, key or secret in either answer or in any line", async () => {
        // A fixed instant: the wait the refusal states is then 3,180 seconds, which holds no figure of a policy. On the
        // wall clock a wait of 300, 1300 or 3005 seconds would read as the credential's figure.
        standAt(AN_HOUR_STARTS + MINUTES_INTO_THE_HOUR * MINUTE_MS);
        const { block, credential } = await bucketsOf();
        await fillTo(credential, SAVES_PER_CREDENTIAL_FIGURE);
        const consoleSpies = spyOnEveryConsoleMethod();

        const refused = await send();
        hitsRecorded().mockRejectedValue(new Error("QA-STORE-DOWN"));
        const unavailable = await send();

        const readings = everyReadingOf([
          [...refused.headers],
          await refused.text(),
          [...unavailable.headers],
          await unavailable.text(),
          consoleCallsOf(consoleSpies),
        ]);
        expect([refused.status, unavailable.status]).toEqual([
          LIMITED,
          UNAVAILABLE,
        ]);
        for (const kept of [
          "203.0.113",
          OWNER_TOKEN,
          block.key,
          credential.key,
          USABLE_SECRET,
          A_DESIGN,
          "QA-STORE-DOWN",
          String(SAVES_PER_CREDENTIAL_FIGURE),
        ]) {
          expect(readings).not.toContain(kept);
        }
      });
    });
  },
);

describe("the lines a flood of refused saves can buy", () => {
  it("is one line for each policy in a process, and one for each save that could not be judged", async () => {
    vi.resetModules();
    const fresh = await import("../../../../src/app/api/designs/[id]/route");
    const store = (
      await import("@/lib/server/rate-limit/rate-limit-store-instance")
    ).getRateLimitStore();
    const send = () =>
      fresh.PUT(requestOf("PUT", {}), {
        params: Promise.resolve({ id: A_DESIGN }),
      });
    const consoleSpies = spyOnEveryConsoleMethod();
    const flood = 15;
    const spy = vi.spyOn(store, "recordHits");

    spy.mockResolvedValue([SAVES_PER_BLOCK_FIGURE + 1]);
    for (let sent = 0; sent < flood; sent += 1) await send();
    let countsAsked = 0;
    spy.mockImplementation(() => {
      countsAsked += 1;
      const isTheBlocksCount = countsAsked % 2 === 1;
      return Promise.resolve([
        isTheBlocksCount ? 1 : SAVES_PER_CREDENTIAL_FIGURE + 1,
      ]);
    });
    for (let sent = 0; sent < flood; sent += 1) await send();
    spy.mockRejectedValue(new Error("QA-STORE-DOWN"));
    for (let sent = 0; sent < flood; sent += 1) await send();

    const lines = consoleCallsOf(consoleSpies).map(
      ([, line]) => line as { event: string; policy?: string },
    );
    const refusals = lines.filter(
      ({ event }) => event === "design-operation-refused",
    );
    expect(refusals.map(({ policy }) => policy).sort()).toEqual([
      "design-save-by-block-per-60-utc-minutes",
      "design-save-by-credential-per-60-utc-minutes",
    ]);
    expect(
      lines.filter(({ event }) => event === "design-operation-unavailable"),
    ).toHaveLength(flood);
  });
});

describe("saves where no source is named", () => {
  it("share the block's one bucket whatever address each claims, and keep a bucket for each credential", async () => {
    vi.stubEnv(SOURCE_VARIABLE, undefined as unknown as string);
    const hits = hitsRecorded();
    const send = (from: string, token: string) =>
      route.PUT(requestOf("PUT", { from, token }), {
        params: Promise.resolve({ id: A_DESIGN }),
      });

    await send(ONE_BLOCK, "QA-ONE");
    await send(ANOTHER_BLOCK, "QA-TWO");

    const [firstBlock, firstCredential, secondBlock, secondCredential] =
      bucketsHit(hits).map(({ key }) => key);
    expect(secondBlock).toBe(firstBlock);
    expect(secondCredential).not.toBe(firstCredential);
    expect(bucketsHit(hits)).toHaveLength(4);
  });
});
