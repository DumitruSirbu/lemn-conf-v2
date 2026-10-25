import { fc } from "@fast-check/vitest";
import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";
import type { RateLimitStore } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  NOTES_ROUTE,
  STATUS_ROUTE,
  UNHIDE_ROUTE,
  UNKNOWN_ID,
  WRITE_ROUTES,
  type WriteRoute,
} from "../../../support/staff-write-routes";
import {
  freshStaffActionsWorld,
  plantActionKitchen,
  signedInStaffNamed,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import { freshStaffWorld, type StaffWorld } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-actions-store-instance", () =>
  import("../../../support/staff-actions-world").then((world) =>
    world.staffKitchenActionsStoreModule(),
  ),
);

/**
 * Adversarial QA of wave L3-S7, part three: the three buckets (where an hour and a UTC day turn over, which requests
 * they count, what a limiter store that cannot be trusted does to a write) and what the writes do when several are
 * made at once. The real limiter and the real fakes are used; only the clock's `Date` is replaced where a test is about
 * a window's edge.
 */

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86_400;
const RATE_LIMIT_DEADLINE_MS = 3000;

let world: AccountWorld;
let staffWorld: StaffWorld;
let actions: StaffActionsWorld;
let ledgerCounting: RateLimitStore["recordHits"] | undefined;
let operatorsSeeded = 0;

beforeEach(() => {
  operatorsSeeded = 0;
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  actions = freshStaffActionsWorld();
  ledgerCounting = vi
    .spyOn(getRateLimitStore(), "recordHits")
    .getMockImplementation();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signedInOperator(name = "Operator") {
  operatorsSeeded += 1;
  const email = `operator-${String(operatorsSeeded)}@example.test`;
  const staff = await signedInStaffNamed({ role: "operator" }, email, name);
  return { ...staff, email };
}

async function askMany(
  route: WriteRoute,
  id: string,
  cookie: string,
  count: number,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let asked = 0; asked < count; asked += 1) {
    statuses.push((await route.ask(id, { cookie })).status);
  }
  return statuses;
}

function isServedOrConflicted(status: number): boolean {
  return [200, 201, 204, 409].includes(status);
}

describe.each([
  {
    route: NOTES_ROUTE,
    figure: 120,
    window: "hour",
    before: "2026-10-21T10:59:59.000Z",
    lastMillisecond: "2026-10-21T10:59:59.999Z",
    turn: "2026-10-21T11:00:00.000Z",
    fullWaitSeconds: HOUR_SECONDS,
  },
  {
    route: STATUS_ROUTE,
    figure: 120,
    window: "hour",
    before: "2026-10-21T10:59:59.000Z",
    lastMillisecond: "2026-10-21T10:59:59.999Z",
    turn: "2026-10-21T11:00:00.000Z",
    fullWaitSeconds: HOUR_SECONDS,
  },
  {
    route: UNHIDE_ROUTE,
    figure: 60,
    window: "UTC day",
    before: "2026-10-21T23:59:59.000Z",
    lastMillisecond: "2026-10-21T23:59:59.999Z",
    turn: "2026-10-22T00:00:00.000Z",
    fullWaitSeconds: DAY_SECONDS,
  },
])(
  "$route.name: the $window turns over at its edge",
  ({ route, figure, before, lastMillisecond, turn, fullWaitSeconds }) => {
    it("waits one second at the last second, allows again at the turn, and then holds the whole window", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(before));
      const { session } = await signedInOperator();
      const id = route.plantReady();
      const within = await askMany(route, id, session.cookie, figure);

      const refused = await route.ask(id, { cookie: session.cookie });
      vi.setSystemTime(new Date(lastMillisecond));
      const stillRefused = await route.ask(id, { cookie: session.cookie });

      expect(within.every(isServedOrConflicted)).toBe(true);
      expect([refused.status, stillRefused.status]).toEqual([429, 429]);
      expect(refused.headers.get("retry-after")).toBe("1");
      expect(stillRefused.headers.get("retry-after")).toBe("1");

      vi.setSystemTime(new Date(turn));
      const nextWindow = await askMany(route, id, session.cookie, figure);
      const refusedAgain = await route.ask(id, { cookie: session.cookie });

      expect(nextWindow.every(isServedOrConflicted)).toBe(true);
      expect(refusedAgain.status).toBe(429);
      expect(refusedAgain.headers.get("retry-after")).toBe(
        String(fullWaitSeconds),
      );
    });

    it("counts a request of the window's last millisecond in that window and not the next", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(lastMillisecond));
      const { session } = await signedInOperator();
      const id = route.plantReady();
      await askMany(route, id, session.cookie, figure);

      vi.setSystemTime(new Date(turn));
      const firstOfTheNext = await route.ask(id, { cookie: session.cookie });

      expect(isServedOrConflicted(firstOfTheNext.status)).toBe(true);
      vi.setSystemTime(new Date(lastMillisecond));
      expect((await route.ask(id, { cookie: session.cookie })).status).toBe(
        429,
      );
    });
  },
);

describe("the unhide day is the UTC day and not Chisinau's", () => {
  it("is still full at the Chisinau midnight (21:00 UTC in October) and says three hours remain", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T20:59:59.000Z"));
    const { session } = await signedInOperator();
    const id = UNHIDE_ROUTE.plantReady();
    await askMany(UNHIDE_ROUTE, id, session.cookie, 60);

    vi.setSystemTime(new Date("2026-10-21T21:00:00.000Z"));
    const answer = await UNHIDE_ROUTE.ask(id, { cookie: session.cookie });

    expect(answer.status).toBe(429);
    expect(answer.headers.get("retry-after")).toBe(String(3 * HOUR_SECONDS));
  });
});

describe.each(WRITE_ROUTES)(
  "$name: the bucket is the account's alone",
  (route) => {
    it("is shared by every network the account writes from, and by a request that names no network", async () => {
      limiterLedger.subjects.push(
        { kind: "ipv4-block", subject: "198.51.100" },
        { kind: "ipv4-block", subject: "203.0.113" },
      );
      const { session } = await signedInOperator();
      const id = route.plantReady();
      const third = route.policy.figure / 3;
      const fromNetwork = (network: string) => async () => {
        for (let asked = 0; asked < third; asked += 1) {
          await route.ask(id, {
            cookie: session.cookie,
            headers: { "x-forwarded-for": network },
          });
        }
      };
      await fromNetwork("192.0.2.10")();
      await fromNetwork("198.51.100.20")();
      await fromNetwork("203.0.113.30")();

      const fromAFourth = await route.ask(id, {
        cookie: session.cookie,
        headers: { "x-forwarded-for": "192.0.2.99" },
      });

      expect(fromAFourth.status).toBe(429);
    });

    it("is served, and counted, for a request that carries no network header", async () => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      const body = route.takesBody
        ? JSON.stringify(route.validBody)
        : undefined;

      const answer = await route.askRaw(id, {
        cookie: session.cookie,
        body: body ?? "",
        contentType: "application/json",
        network: null,
      });

      expect(answer.status).toBe(route.success);
      expect(limiterLedger.counted).toEqual([route.policy.name]);
    });
  },
);

describe("which requests a bucket counts", () => {
  it("counts a request the store answers with 503, one that it answers with 401 and one that is a conflict or an unknown kitchen, once each", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantActionKitchen();
    const sent = plantActionKitchen({ isSent: false });
    const countedAfter = async (
      route: WriteRoute,
      id: string,
    ): Promise<[number, string[]]> => {
      limiterLedger.counted.length = 0;
      const answer = await route.ask(id, { cookie: session.cookie });
      return [answer.status, [...limiterLedger.counted]];
    };

    actions.failStore = true;
    const storeFails = await countedAfter(NOTES_ROUTE, kitchen.id);
    actions.failStore = false;
    const conflict = await countedAfter(STATUS_ROUTE, sent.id);
    const unknown = await countedAfter(UNHIDE_ROUTE, UNKNOWN_ID);
    const notHidden = await countedAfter(UNHIDE_ROUTE, kitchen.id);
    const saved = await countedAfter(STATUS_ROUTE, kitchen.id);
    const staleAgain = await countedAfter(STATUS_ROUTE, kitchen.id);

    expect(storeFails).toEqual([503, [NOTES_ROUTE.policy.name]]);
    expect(conflict).toEqual([409, [STATUS_ROUTE.policy.name]]);
    expect(unknown).toEqual([404, [UNHIDE_ROUTE.policy.name]]);
    expect(notHidden).toEqual([409, [UNHIDE_ROUTE.policy.name]]);
    expect(saved).toEqual([200, [STATUS_ROUTE.policy.name]]);
    // The same page asks again from `new`, which the save moved on: a conflict, counted once like any other.
    expect(staleAgain).toEqual([409, [STATUS_ROUTE.policy.name]]);
  });

  it("counts a request whose session ended after the route read it", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();
    const realAddNote = actions.store.addNote.bind(actions.store);
    vi.spyOn(actions.store, "addNote").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(account.id);
      return realAddNote(request);
    });

    const answer = await NOTES_ROUTE.ask(id, { cookie: session.cookie });

    expect(answer.status).toBe(401);
    expect(limiterLedger.counted).toEqual([NOTES_ROUTE.policy.name]);
  });

  it("keeps the three buckets apart when one is truly full: 120 notes leave a status and an unhide free, and 60 unhides leave a note free", async () => {
    const { session } = await signedInOperator();
    const hidden = plantActionKitchen({ isHidden: true });
    const sent = plantActionKitchen();
    await askMany(NOTES_ROUTE, sent.id, session.cookie, 120);
    expect(
      (await NOTES_ROUTE.ask(sent.id, { cookie: session.cookie })).status,
    ).toBe(429);

    const status = await STATUS_ROUTE.ask(sent.id, { cookie: session.cookie });
    const unhidden = await UNHIDE_ROUTE.ask(hidden.id, {
      cookie: session.cookie,
    });
    await askMany(UNHIDE_ROUTE, hidden.id, session.cookie, 59);

    expect([status.status, unhidden.status]).toEqual([200, 204]);
    expect(
      (await UNHIDE_ROUTE.ask(hidden.id, { cookie: session.cookie })).status,
    ).toBe(429);
    // The same page asks again from `new`, which the first save has moved on: a 409 is the status bucket answering, a 429
    // would be it full.
    expect(
      (await STATUS_ROUTE.ask(sent.id, { cookie: session.cookie })).status,
    ).toBe(409);
    expect(
      (await NOTES_ROUTE.ask(sent.id, { cookie: session.cookie })).status,
    ).toBe(429);
  });
});

/** The buckets of `policyNames` are answered by `answerWith`; every other bucket is counted as the ledger counts. */
function answerTheBucketsWith(
  policyNames: readonly string[],
  answerWith: () => unknown,
): void {
  const counting = ledgerCounting;
  if (counting === undefined) throw new Error("the limiter is not watched");
  vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation((buckets) => {
    const counted = counting(buckets);
    const isTheirs = limiterLedger.counted
      .slice(-buckets.length)
      .some((name) => policyNames.includes(name));
    return isTheirs ? (answerWith() as Promise<number[]>) : counted;
  });
}

describe.each(WRITE_ROUTES)(
  "$name: a limiter store that cannot be trusted",
  (route) => {
    const answerTheBucketWith = (answerWith: () => unknown) => {
      answerTheBucketsWith([route.policy.name], answerWith);
    };

    async function expectNothingWritten(answer: Response, id: string) {
      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(answer.headers.get("retry-after")).toBeNull();
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(actions.calls).toEqual([]);
      expect(staffWorld.audit.heldEvents()).toEqual([]);
      expect(actions.store.heldNotes(id)).toEqual([]);
      expect(actions.store.heldStatus(id)).toBeUndefined();
    }

    it.each([
      ["a count of not-a-number", [Number.NaN]],
      ["a count of nought", [0]],
      ["a negative count", [-1]],
      ["a fractional count", [1.5]],
      ["an infinite count", [Number.POSITIVE_INFINITY]],
      ["a count that is text", ["1"]],
      ["no counts", []],
      ["nothing at all", undefined],
    ])("writes nothing for %s", async (_title, counts) => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      answerTheBucketWith(() => Promise.resolve(counts));

      await expectNothingWritten(
        await route.ask(id, { cookie: session.cookie }),
        id,
      );
    });

    it("writes nothing for a store that rejects, and for one that throws before it returns a promise", async () => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      answerTheBucketWith(() => Promise.reject(new Error("driver text")));
      await expectNothingWritten(
        await route.ask(id, { cookie: session.cookie }),
        id,
      );

      answerTheBucketWith(() => {
        throw new Error("driver text, thrown at once");
      });
      await expectNothingWritten(
        await route.ask(id, { cookie: session.cookie }),
        id,
      );
    });
  },
);

describe("a limiter store that never answers", () => {
  it("writes nothing on any of the three routes, after the limiter's own deadline", async () => {
    const { session } = await signedInOperator();
    const kitchens = WRITE_ROUTES.map((route) => route.plantReady());
    answerTheBucketsWith(
      WRITE_ROUTES.map(({ policy }) => policy.name),
      () => new Promise<never>(() => undefined),
    );
    const startedAt = Date.now();

    const answers = await Promise.all(
      WRITE_ROUTES.map((route, index) =>
        route.ask(kitchens[index] ?? "", { cookie: session.cookie }),
      ),
    );

    expect(answers.map(({ status }) => status)).toEqual([503, 503, 503]);
    for (const answer of answers) {
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(answer.headers.get("retry-after")).toBeNull();
    }
    expect(actions.calls).toEqual([]);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      RATE_LIMIT_DEADLINE_MS - 100,
    );
    expect(Date.now() - startedAt).toBeLessThan(RATE_LIMIT_DEADLINE_MS + 2000);
  });
});

describe("writes made at once", () => {
  it("a note sent twice at once is two notes and two audit rows: there is no idempotency to rely on", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answers = await Promise.all([
      NOTES_ROUTE.ask(id, { cookie: session.cookie, json: { text: "Same" } }),
      NOTES_ROUTE.ask(id, { cookie: session.cookie, json: { text: "Same" } }),
    ]);

    expect(answers.map(({ status }) => status)).toEqual([201, 201]);
    const ids = await Promise.all(
      answers.map(async (answer) => {
        const { note } = (await jsonOf(answer)) as { note: { id: string } };
        return note.id;
      }),
    );
    expect(new Set(ids).size).toBe(2);
    expect(actions.store.heldNotes(id)).toHaveLength(2);
    expect(staffWorld.audit.heldEvents().map(({ action }) => action)).toEqual([
      "note-added",
      "note-added",
    ]);
    expect(limiterLedger.counted).toEqual([
      NOTES_ROUTE.policy.name,
      NOTES_ROUTE.policy.name,
    ]);
  });

  it("an unhide sent three times at once is one 204, two 409 and one audit row", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });

    const answers = await Promise.all([
      UNHIDE_ROUTE.ask(id, { cookie: session.cookie }),
      UNHIDE_ROUTE.ask(id, { cookie: session.cookie }),
      UNHIDE_ROUTE.ask(id, { cookie: session.cookie }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([204, 409, 409]);
    expect(staffWorld.audit.heldEvents().map(({ action }) => action)).toEqual([
      "kitchen-unhidden",
    ]);
    expect(actions.store.heldKitchen(id)?.isHidden).toBe(false);
  });

  it("a note, a status and an unhide at once on one hidden kitchen all succeed and leave three rows and each change", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });

    const answers = await Promise.all([
      NOTES_ROUTE.ask(id, { cookie: session.cookie }),
      STATUS_ROUTE.ask(id, { cookie: session.cookie }),
      UNHIDE_ROUTE.ask(id, { cookie: session.cookie }),
    ]);

    expect(answers.map(({ status }) => status)).toEqual([201, 200, 204]);
    expect(staffWorld.audit.heldEvents()).toHaveLength(3);
    expect(actions.store.heldNotes(id)).toHaveLength(1);
    expect(actions.store.heldStatus(id)?.status).toBe("contacted");
    expect(actions.store.heldKitchen(id)?.isHidden).toBe(false);
  });

  it("any mix of status saves made at once leaves rows that chain from new to the status the kitchen holds, whoever sent them", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.constantFrom(...REQUEST_STATUSES),
            fc.integer({ min: 0, max: 1 }),
          ),
          { minLength: 1, maxLength: 6 },
        ),
        async (sends) => {
          const operators = [
            await signedInOperator(),
            await signedInOperator(),
          ];
          const { id } = plantActionKitchen();
          const rowsBefore = staffWorld.audit.heldEvents().length;

          const answers = await Promise.all(
            sends.map(([status, who]) =>
              STATUS_ROUTE.ask(id, {
                cookie: operators[who]?.session.cookie ?? "",
                json: { status, from: "new" },
              }),
            ),
          );

          expect(
            answers.every(({ status }) => status === 200 || status === 409),
          ).toBe(true);
          const rows = staffWorld.audit
            .heldEvents()
            .slice(rowsBefore)
            .filter(({ designId }) => designId === id);
          let previous = "new";
          for (const row of rows) {
            const detail = row.detail as { from: string; to: string };
            expect(detail.from).toBe(previous);
            expect(detail.to).not.toBe(detail.from);
            previous = detail.to;
          }
          const held = actions.store.heldStatus(id);
          expect(held?.status).toBe(rows.length === 0 ? undefined : previous);
          const lastRow = rows[rows.length - 1];
          if (lastRow !== undefined) {
            expect(held?.changedByAccountId).toBe(lastRow.actorAccountId);
          }
          const served = answers.filter(({ status }) => status === 200).length;
          expect(rows.length).toBeLessThanOrEqual(served);
          for (const answer of answers.filter(({ status }) => status === 409)) {
            expect(await jsonOf(answer)).toEqual({
              status: "changed-meanwhile",
            });
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("notes sent at once by two operators are each written under the account that sent it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 1 }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (senders) => {
          const operators = [
            await signedInOperator("Operator Zero"),
            await signedInOperator("Operator One"),
          ];
          const { id } = plantActionKitchen();

          const answers = await Promise.all(
            senders.map((who, index) =>
              NOTES_ROUTE.ask(id, {
                cookie: operators[who]?.session.cookie ?? "",
                json: { text: `note ${String(index)} by ${String(who)}` },
              }),
            ),
          );

          const bodies = (await Promise.all(answers.map(jsonOf))) as {
            note: { text: string; author: { email: string } };
          }[];
          bodies.forEach(({ note }, index) => {
            const who = senders[index] ?? 0;
            expect(note.text).toBe(`note ${String(index)} by ${String(who)}`);
            expect(note.author.email).toBe(operators[who]?.email);
          });
          for (const held of actions.store.heldNotes(id)) {
            const who = Number(held.text.slice(-1));
            expect(held.authorAccountId).toBe(operators[who]?.account.id);
          }
          expect(actions.store.heldNotes(id)).toHaveLength(senders.length);
        },
      ),
      { numRuns: 20 },
    );
  });
});
