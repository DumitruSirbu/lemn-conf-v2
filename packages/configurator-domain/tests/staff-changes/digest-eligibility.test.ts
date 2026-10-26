// Which kitchens the daily digest lists (ADR 0178 A-13). Instants are epoch milliseconds: the domain holds no `Date`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  isDigestEligible,
  type DigestEligibilityFacts,
} from "../../src/staff-changes/digest-eligibility.js";
import {
  REQUEST_STATUSES,
  type RequestStatus,
} from "../../src/staff/request-status.js";

// Written out here, not read from the module, so the module's window is checked against the plan's number.
const MS_PER_HOUR = 3_600_000;
const THIRTY_DAYS_MS = 30 * 24 * MS_PER_HOUR;
const STOPPING: readonly RequestStatus[] = ["offer-sent", "closed"];

describe("eligible if and only if changed, not digested since seen, inside thirty days, and not at a stopping status", () => {
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

  propertyTest.prop(
    [
      fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) }),
      ageMsArbitrary,
      fc.constantFrom(...REQUEST_STATUSES),
      fc.boolean(),
      fc.boolean(),
    ],
    { numRuns: 2000 },
  )(
    "holds for random facts, with every condition made to flip",
    (nowMs, ageMs, status, isChangedSinceSeen, isDigestedSinceSeen) => {
      const facts: DigestEligibilityFacts = {
        nowMs,
        sentAtMs: nowMs - ageMs,
        status,
        isChangedSinceSeen,
        isDigestedSinceSeen,
      };

      const expected =
        isChangedSinceSeen &&
        !isDigestedSinceSeen &&
        ageMs < THIRTY_DAYS_MS &&
        !STOPPING.includes(status);

      expect(isDigestEligible(facts)).toBe(expected);
    },
  );

  it("lists a kitchen whose first send is a few milliseconds ahead of the reader's clock", () => {
    const nowMs = Date.UTC(2026, 9, 26, 5);

    const isListed = isDigestEligible({
      nowMs,
      sentAtMs: nowMs + 5,
      status: "new",
      isChangedSinceSeen: true,
      isDigestedSinceSeen: false,
    });

    expect(isListed).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A kitchen appears once per round of changes, over a random timeline of saves and sightings. The store is stood in
// for by revisions: a save raises the revision, a sighting records the revision displayed, a digest records an entry.

const DAYS_SIMULATED = 36;
const DIGEST_HOUR = 8;
const HOURS_BEFORE_DIGEST = [2, 5] as const;
const HOURS_AFTER_DIGEST = [10, 15] as const;
const TIMELINE_START_MS = Date.UTC(2026, 0, 5);
const SUBMITTED_REVISION = 1;

type Operation = "none" | "save" | "seen" | "seen-on-a-stale-page";
type DayOperations = readonly [Operation, Operation, Operation, Operation];

function atHour(day: number, hour: number): number {
  return TIMELINE_START_MS + (day * 24 + hour) * MS_PER_HOUR;
}

function dayOperationsArbitrary(
  operations: readonly Operation[],
): fc.Arbitrary<DayOperations> {
  const operation = fc.constantFrom(...operations);
  return fc.tuple(operation, operation, operation, operation);
}

function timelineArbitrary(
  operations: readonly Operation[],
): fc.Arbitrary<readonly DayOperations[]> {
  return fc.array(dayOperationsArbitrary(operations), {
    minLength: DAYS_SIMULATED,
    maxLength: DAYS_SIMULATED,
  });
}

class StoredKitchen {
  revision = SUBMITTED_REVISION;
  seenRevision: number | undefined;
  digestedRevisions: number[] = [];

  apply(operation: Operation): void {
    if (operation === "save") this.revision += 1;
    if (operation === "seen") this.seenRevision = this.revision;
    if (operation === "seen-on-a-stale-page") {
      this.seenRevision = Math.max(
        this.effectiveSeenRevision,
        this.revision - 1,
      );
    }
  }

  get effectiveSeenRevision(): number {
    return this.seenRevision ?? SUBMITTED_REVISION;
  }

  factsAtDigest(day: number, status: RequestStatus): DigestEligibilityFacts {
    return {
      nowMs: atHour(day, DIGEST_HOUR),
      sentAtMs: TIMELINE_START_MS,
      status,
      isChangedSinceSeen: this.revision !== this.effectiveSeenRevision,
      isDigestedSinceSeen: this.digestedRevisions.some(
        (digested) => digested > this.effectiveSeenRevision,
      ),
    };
  }
}

function runTimeline(
  timeline: readonly DayOperations[],
  status: RequestStatus,
  onDigestDay: (kitchen: StoredKitchen, isListed: boolean, day: number) => void,
): void {
  const kitchen = new StoredKitchen();
  timeline.forEach((operations, day) => {
    HOURS_BEFORE_DIGEST.forEach((_hour, slot) => {
      kitchen.apply(operations[slot] ?? "none");
    });

    const isListed = isDigestEligible(kitchen.factsAtDigest(day, status));
    onDigestDay(kitchen, isListed, day);
    if (isListed) kitchen.digestedRevisions.push(kitchen.revision);

    HOURS_AFTER_DIGEST.forEach((_hour, slot) => {
      kitchen.apply(operations[HOURS_BEFORE_DIGEST.length + slot] ?? "none");
    });
  });
}

describe("a kitchen is listed once per round of changes over a random timeline", () => {
  propertyTest.prop(
    [
      timelineArbitrary(["none", "none", "save", "seen"]),
      fc.constantFrom(...REQUEST_STATUSES),
    ],
    { numRuns: 300 },
  )(
    "lists a kitchen on the first morning it is changed in a round, and on no later morning of that round",
    (timeline, status) => {
      let hasBeenListedThisRound = false;
      let lastSeenRevision = SUBMITTED_REVISION;
      runTimeline(timeline, status, (kitchen, isListed, day) => {
        if (kitchen.effectiveSeenRevision !== lastSeenRevision) {
          lastSeenRevision = kitchen.effectiveSeenRevision;
          hasBeenListedThisRound = false;
        }
        const ageHours = day * 24 + DIGEST_HOUR;
        const shouldBeListed =
          kitchen.revision !== kitchen.effectiveSeenRevision &&
          !hasBeenListedThisRound &&
          ageHours < 30 * 24 &&
          !STOPPING.includes(status);

        expect(isListed).toBe(shouldBeListed);
        if (isListed) hasBeenListedThisRound = true;
      });
    },
  );

  propertyTest.prop(
    [
      timelineArbitrary(["none", "save", "seen", "seen-on-a-stale-page"]),
      fc.constantFrom(...REQUEST_STATUSES),
    ],
    { numRuns: 500 },
  )(
    "never lists a revision a digest already held, even after a sighting of an older revision",
    (timeline, status) => {
      runTimeline(timeline, status, (kitchen, isListed) => {
        if (isListed) {
          expect(kitchen.digestedRevisions).not.toContain(kitchen.revision);
        }
      });
    },
  );
});
