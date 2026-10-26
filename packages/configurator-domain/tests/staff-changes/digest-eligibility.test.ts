// M10 K1: which kitchens the daily digest lists (ADR 0178 A-13; plan §10 Lane K, K1-a).
// Instants are epoch milliseconds: the domain holds no `Date` (tests/contact/qa-8h-package-purity).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_DAYS,
  DIGEST_WINDOW_MS,
  isDigestEligible,
  type DigestEligibilityFacts,
} from "../../src/staff-changes/digest-eligibility.js";
import {
  REQUEST_STATUSES,
  type RequestStatus,
} from "../../src/staff/request-status.js";

// Written out here, not read from the module, so the module's constant is checked against the plan's number.
const MS_PER_HOUR = 3_600_000;
const THIRTY_DAYS_MS = 30 * 24 * MS_PER_HOUR;
const NOW_MS = Date.parse("2026-10-26T05:00:00.000Z");

function eligibleFacts(
  overrides: Partial<DigestEligibilityFacts> = {},
): DigestEligibilityFacts {
  return {
    nowMs: NOW_MS,
    sentAtMs: NOW_MS - 2 * 24 * MS_PER_HOUR,
    status: "new",
    isChangedSinceSeen: true,
    ...overrides,
  };
}

describe("the digest window and stopping statuses", () => {
  it("are thirty days of twenty-four hours and the two statuses after which staff no longer chase a request", () => {
    expect(DIGEST_WINDOW_DAYS).toBe(30);
    expect(DIGEST_WINDOW_MS).toBe(THIRTY_DAYS_MS);
    expect(DIGEST_STOPPING_STATUSES).toEqual(["offer-sent", "closed"]);
  });

  it("are a frozen list, so a caller cannot widen what the digest stops at", () => {
    expect(Object.isFrozen(DIGEST_STOPPING_STATUSES)).toBe(true);
  });
});

describe("isDigestEligible, one condition failing at a time", () => {
  it("lists a changed, recently sent, undigested kitchen at a working status", () => {
    expect(isDigestEligible(eligibleFacts())).toBe(true);
  });

  it("does not list a kitchen that has not changed after it was seen", () => {
    expect(isDigestEligible(eligibleFacts({ isChangedSinceSeen: false }))).toBe(
      false,
    );
  });

  it.each(["offer-sent", "closed"] as const)(
    "does not list a kitchen at status %s",
    (status) => {
      expect(isDigestEligible(eligibleFacts({ status }))).toBe(false);
    },
  );

  it.each(["new", "contacted"] as const)(
    "still lists a kitchen at status %s",
    (status) => {
      expect(isDigestEligible(eligibleFacts({ status }))).toBe(true);
    },
  );

  it("does not list a kitchen a digest already held in this round of changes", () => {
    expect(
      isDigestEligible(
        eligibleFacts({
          lastSeenAtMs: NOW_MS - 5 * 24 * MS_PER_HOUR,
          lastDigestedAtMs: NOW_MS - MS_PER_HOUR,
        }),
      ),
    ).toBe(false);
  });
});

describe("the thirty-day edge", () => {
  it("lists a kitchen sent one millisecond short of thirty days ago", () => {
    const sentAtMs = NOW_MS - (THIRTY_DAYS_MS - 1);

    expect(isDigestEligible(eligibleFacts({ sentAtMs }))).toBe(true);
  });

  it("drops a kitchen sent exactly thirty days of twenty-four hours ago: the edge is exclusive", () => {
    const sentAtMs = NOW_MS - THIRTY_DAYS_MS;

    expect(isDigestEligible(eligibleFacts({ sentAtMs }))).toBe(false);
  });

  it("drops a kitchen sent one millisecond past thirty days ago", () => {
    const sentAtMs = NOW_MS - (THIRTY_DAYS_MS + 1);

    expect(isDigestEligible(eligibleFacts({ sentAtMs }))).toBe(false);
  });

  it("counts fixed hours, so a daylight-saving change inside the window moves nothing", () => {
    // Sent 2026-09-26 05:00 UTC; the clocks go back on 2026-10-25, inside the window. Thirty days of 24 hours
    // after the send is 2026-10-26 05:00 UTC, whatever the wall clock reads in Chisinau.
    const sentAtMs = Date.parse("2026-09-26T05:00:00.000Z");
    const justBeforeMs = Date.parse("2026-10-26T04:59:59.999Z");
    const atTheEdgeMs = Date.parse("2026-10-26T05:00:00.000Z");

    expect(
      isDigestEligible(eligibleFacts({ sentAtMs, nowMs: justBeforeMs })),
    ).toBe(true);
    expect(
      isDigestEligible(eligibleFacts({ sentAtMs, nowMs: atTheEdgeMs })),
    ).toBe(false);
  });

  it("lists a kitchen whose first send is a few milliseconds ahead of the reader's clock", () => {
    const sentAtMs = NOW_MS + 5;

    expect(isDigestEligible(eligibleFacts({ sentAtMs }))).toBe(true);
  });
});

describe("once per round of changes: seen and digested instants", () => {
  const seenAtMs = NOW_MS - 10 * MS_PER_HOUR;

  it("lists a changed kitchen no digest has ever held", () => {
    expect(isDigestEligible(eligibleFacts({ lastSeenAtMs: seenAtMs }))).toBe(
      true,
    );
  });

  it("lists a kitchen again once staff saw it after the digest that held it", () => {
    const facts = eligibleFacts({
      lastSeenAtMs: seenAtMs,
      lastDigestedAtMs: seenAtMs - 1,
    });

    expect(isDigestEligible(facts)).toBe(true);
  });

  it("does not list a kitchen digested after it was last seen", () => {
    const facts = eligibleFacts({
      lastSeenAtMs: seenAtMs,
      lastDigestedAtMs: seenAtMs + 1,
    });

    expect(isDigestEligible(facts)).toBe(false);
  });

  it("counts a digest at the very instant of the last seen as holding the kitchen: a repeat is the worse error", () => {
    const facts = eligibleFacts({
      lastSeenAtMs: seenAtMs,
      lastDigestedAtMs: seenAtMs,
    });

    expect(isDigestEligible(facts)).toBe(false);
  });

  it("does not list a never-seen kitchen a digest has already held", () => {
    const facts = eligibleFacts({ lastDigestedAtMs: NOW_MS - MS_PER_HOUR });

    expect(isDigestEligible(facts)).toBe(false);
  });
});

describe("an instant that is not a time fails closed", () => {
  it.each([
    ["nowMs", { nowMs: Number.NaN }],
    ["sentAtMs", { sentAtMs: Number.NaN }],
    ["lastSeenAtMs", { lastSeenAtMs: Number.NaN }],
    ["lastDigestedAtMs", { lastDigestedAtMs: Number.NaN }],
    ["sentAtMs, infinite", { sentAtMs: Number.NEGATIVE_INFINITY }],
  ] as const)("when %s is not finite", (_name, overrides) => {
    expect(isDigestEligible(eligibleFacts(overrides))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// K1-a. Eligible if and only if (changed) and (not digested since last seen) and (now - sentAt < 30 days) and
// (status not offer-sent or closed). Every conjunct is made to flip: ages are biased onto the edge, and the digest
// history is chosen by *scenario*, not recomputed from instants, so the expected answer does not restate the code.

type DigestHistory =
  | "never-seen-never-digested"
  | "never-digested"
  | "digested-before-seen"
  | "digested-after-seen"
  | "digested-at-the-seen-instant"
  | "digested-never-seen";

const HISTORIES: readonly DigestHistory[] = [
  "never-seen-never-digested",
  "never-digested",
  "digested-before-seen",
  "digested-after-seen",
  "digested-at-the-seen-instant",
  "digested-never-seen",
];

const HISTORIES_THAT_HOLD_THE_KITCHEN = new Set<DigestHistory>([
  "digested-after-seen",
  "digested-at-the-seen-instant",
  "digested-never-seen",
]);

const STOPPING: readonly RequestStatus[] = ["offer-sent", "closed"];

const ageMsArbitrary = fc.oneof(
  fc.constantFrom(
    THIRTY_DAYS_MS - 1,
    THIRTY_DAYS_MS,
    THIRTY_DAYS_MS + 1,
    0,
    -1,
  ),
  fc.integer({ min: -MS_PER_HOUR, max: 2 * THIRTY_DAYS_MS }),
);

function instantsFor(
  history: DigestHistory,
  seenAtMs: number,
  gapMs: number,
): Pick<DigestEligibilityFacts, "lastSeenAtMs" | "lastDigestedAtMs"> {
  switch (history) {
    case "never-seen-never-digested":
      return {};
    case "never-digested":
      return { lastSeenAtMs: seenAtMs };
    case "digested-before-seen":
      return { lastSeenAtMs: seenAtMs, lastDigestedAtMs: seenAtMs - gapMs };
    case "digested-after-seen":
      return { lastSeenAtMs: seenAtMs, lastDigestedAtMs: seenAtMs + gapMs };
    case "digested-at-the-seen-instant":
      return { lastSeenAtMs: seenAtMs, lastDigestedAtMs: seenAtMs };
    case "digested-never-seen":
      return { lastDigestedAtMs: seenAtMs };
  }
}

describe("K1-a: eligible if and only if changed, not digested since seen, inside thirty days, and not at a stopping status", () => {
  propertyTest.prop(
    [
      fc.integer({
        min: Date.UTC(2020, 0, 1),
        max: Date.UTC(2035, 0, 1),
      }),
      ageMsArbitrary,
      fc.constantFrom(...REQUEST_STATUSES),
      fc.boolean(),
      fc.constantFrom(...HISTORIES),
      fc.integer({ min: 0, max: 400 * 24 * MS_PER_HOUR }),
      fc.integer({ min: 1, max: 40 * 24 * MS_PER_HOUR }),
    ],
    { numRuns: 2000 },
  )(
    "holds for random facts",
    (nowMs, ageMs, status, isChangedSinceSeen, history, seenAgoMs, gapMs) => {
      const facts: DigestEligibilityFacts = {
        nowMs,
        sentAtMs: nowMs - ageMs,
        status,
        isChangedSinceSeen,
        ...instantsFor(history, nowMs - seenAgoMs, gapMs),
      };

      const expected =
        isChangedSinceSeen &&
        !HISTORIES_THAT_HOLD_THE_KITCHEN.has(history) &&
        ageMs < THIRTY_DAYS_MS &&
        !STOPPING.includes(status);

      expect(isDigestEligible(facts)).toBe(expected);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// A kitchen appears once per round of changes (frame D10D), over a random timeline of saves and sightings. The
// expectation is kept by a flag that resets at each sighting; the rule under test sees only instants.

const DAYS_SIMULATED = 36;
const DIGEST_HOUR = 8;
const HOURS_BEFORE_DIGEST = [2, 5] as const;
const HOURS_AFTER_DIGEST = [10, 15] as const;
const TIMELINE_START_MS = Date.UTC(2026, 0, 5);

type Operation = "none" | "save" | "seen";
type DayOperations = readonly [Operation, Operation, Operation, Operation];

const operationArbitrary = fc.constantFrom<Operation>(
  "none",
  "none",
  "save",
  "seen",
);
const dayOperationsArbitrary: fc.Arbitrary<DayOperations> = fc.tuple(
  operationArbitrary,
  operationArbitrary,
  operationArbitrary,
  operationArbitrary,
);

const timelineArbitrary = fc.array(dayOperationsArbitrary, {
  minLength: DAYS_SIMULATED,
  maxLength: DAYS_SIMULATED,
});

function atHour(day: number, hour: number): number {
  return TIMELINE_START_MS + (day * 24 + hour) * MS_PER_HOUR;
}

/** What the test knows about one kitchen, kept as flags and instants the way a person reasons about it. */
interface KitchenTimeline {
  isChanged: boolean;
  hasBeenHeldThisRound: boolean;
  lastSeenAtMs?: number;
  lastDigestedAtMs?: number;
}

function applyOperation(
  kitchen: KitchenTimeline,
  operation: Operation,
  atMs: number,
): void {
  if (operation === "save") kitchen.isChanged = true;
  if (operation === "seen") {
    kitchen.isChanged = false;
    kitchen.hasBeenHeldThisRound = false;
    kitchen.lastSeenAtMs = atMs;
  }
}

function factsAtDigest(
  kitchen: KitchenTimeline,
  status: RequestStatus,
  day: number,
): DigestEligibilityFacts {
  return {
    nowMs: atHour(day, DIGEST_HOUR),
    sentAtMs: TIMELINE_START_MS,
    status,
    isChangedSinceSeen: kitchen.isChanged,
    ...(kitchen.lastSeenAtMs !== undefined
      ? { lastSeenAtMs: kitchen.lastSeenAtMs }
      : {}),
    ...(kitchen.lastDigestedAtMs !== undefined
      ? { lastDigestedAtMs: kitchen.lastDigestedAtMs }
      : {}),
  };
}

function shouldBeListedAtDigest(
  kitchen: KitchenTimeline,
  status: RequestStatus,
  day: number,
): boolean {
  const ageHours = day * 24 + DIGEST_HOUR;
  return (
    kitchen.isChanged &&
    !kitchen.hasBeenHeldThisRound &&
    ageHours < 30 * 24 &&
    !STOPPING.includes(status)
  );
}

describe("once per round of changes over a random timeline", () => {
  propertyTest.prop([timelineArbitrary, fc.constantFrom(...REQUEST_STATUSES)], {
    numRuns: 300,
  })(
    "a digest holds a kitchen on the first morning it is changed in a round, and on no later morning of that round",
    (timeline, status) => {
      const kitchen: KitchenTimeline = {
        isChanged: false,
        hasBeenHeldThisRound: false,
      };

      timeline.forEach((operations, day) => {
        HOURS_BEFORE_DIGEST.forEach((hour, slot) => {
          applyOperation(
            kitchen,
            operations[slot] ?? "none",
            atHour(day, hour),
          );
        });

        const isListed = isDigestEligible(factsAtDigest(kitchen, status, day));

        expect(isListed).toBe(shouldBeListedAtDigest(kitchen, status, day));
        if (isListed) {
          kitchen.hasBeenHeldThisRound = true;
          kitchen.lastDigestedAtMs = atHour(day, DIGEST_HOUR);
        }

        HOURS_AFTER_DIGEST.forEach((hour, slot) => {
          const operation = operations[HOURS_BEFORE_DIGEST.length + slot];
          applyOperation(kitchen, operation ?? "none", atHour(day, hour));
        });
      });
    },
  );
});
