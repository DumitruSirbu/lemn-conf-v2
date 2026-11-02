// Adversarial QA of M10 wave U3, the source of one cabinet's page (`readCabinetDetail`). The developer's tests ask it for the
// base cabinet and a few unknown names. This asks it for ids that no address should be able to turn into a store query
// or a log line, and for each way the state can be wrong, with the question the page depends on: an unreachable or
// unreadable state is `unavailable` for every id and never `not-found`, because a cabinet must not be denied for a store
// that is down.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readCabinetDetail } from "@/price-dashboard/cabinet-list-source";

import { stateOf } from "./dashboard-state-fixture";

const world = vi.hoisted(() => ({
  answer: undefined as (() => Promise<unknown>) | undefined,
  asked: [] as unknown[][],
  reported: [] as unknown[],
}));

vi.mock("@/lib/server/price-dashboard/price-dashboard-service", () => ({
  PRICE_READ_EVENT: "staff-prices",
  readDashboardStateForAdmittedPage: (...args: unknown[]) => {
    world.asked.push(args);
    if (world.answer === undefined) throw new Error("no answer planned");
    return world.answer();
  },
}));
vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: (line: unknown) => {
    world.reported.push(line);
  },
}));

const KNOWN_RULE = "cabinet.base-cabinet";
const HOSTILE_IDS = [
  KNOWN_RULE,
  "cabinet.stranger",
  "",
  "__proto__",
  "constructor",
  "<script>alert(1)</script>",
  "'; drop table price_books; --",
  "a\nb",
  "x".repeat(100_000),
] as const;

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
  world.reported = [];
});

describe("a store that cannot answer", () => {
  it.each([
    ["rejects", () => Promise.reject(new Error("the store is down"))],
    ["answers nothing", () => Promise.resolve(undefined)],
    ["answers a string", () => Promise.resolve("<html>502</html>")],
    [
      "answers a draft that is not one",
      () => Promise.resolve({ active: stateOf().active, draft: 7 }),
    ],
  ])(
    "%s: every id, known or not, is unavailable and never not-found, and no id reaches the store or the log",
    async (_how, answer) => {
      world.answer = answer;

      for (const ruleId of HOSTILE_IDS) {
        const read = await readCabinetDetail(ruleId);

        expect(read, ruleId.slice(0, 20)).toEqual({ kind: "unavailable" });
      }
      expect(world.asked.every((args) => args.length === 0)).toBe(true);
      expect(JSON.stringify(world.reported)).not.toContain("alert(1)");
      expect(JSON.stringify(world.reported)).not.toContain("drop table");
      expect(JSON.stringify(world.reported)).not.toContain("xxxxxxxx");
    },
  );

  it("a draft that no longer makes a book is unavailable for an id the book lacks, as for one it holds", async () => {
    const unappliable = stateOf([
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.stranger",
          field: "anchorMinor",
        },
        value: 100_000,
      },
    ]);
    world.answer = () => Promise.resolve(unappliable);

    for (const ruleId of [KNOWN_RULE, "cabinet.stranger", "cabinet.other"]) {
      expect(await readCabinetDetail(ruleId), ruleId).toEqual({
        kind: "unavailable",
      });
    }
  });
});

describe("a store that answers", () => {
  it("is ready for the book's own rules only, and for none of the ids that name no rule, however long or strange", async () => {
    world.answer = () => Promise.resolve(stateOf());

    const kinds = await Promise.all(
      HOSTILE_IDS.map(
        async (ruleId) =>
          [ruleId, (await readCabinetDetail(ruleId)).kind] as const,
      ),
    );

    expect(
      kinds.filter(([, kind]) => kind === "ready").map(([ruleId]) => ruleId),
    ).toEqual([KNOWN_RULE]);
    expect(kinds.filter(([, kind]) => kind === "not-found")).toHaveLength(
      HOSTILE_IDS.length - 1,
    );
    expect(world.asked.every((args) => args.length === 0)).toBe(true);
  });

  it("answers the same page object for two reads of the same state, so a render is a read and nothing more", async () => {
    world.answer = () => Promise.resolve(stateOf());

    const first = await readCabinetDetail(KNOWN_RULE);
    const second = await readCabinetDetail(KNOWN_RULE);

    expect(first).toEqual(second);
    expect(world.reported).toEqual([]);
  });
});
