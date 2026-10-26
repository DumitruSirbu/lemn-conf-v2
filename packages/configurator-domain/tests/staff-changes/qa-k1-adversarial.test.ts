// M10 K1 adversarial QA: the digest rules attacked from outside the implementer's examples.
// The day key is compared with an independent oracle (EET/EEST), the window is swept across both 2026 clock changes,
// and the model is shuffled and fed smuggled fields. Instants are epoch milliseconds (tests/contact/qa-8h-package-purity).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { chisinauDayKey } from "../../src/staff-changes/chisinau-day.js";
import {
  DIGEST_WINDOW_MS,
  isDigestEligible,
  type DigestEligibilityFacts,
} from "../../src/staff-changes/digest-eligibility.js";
import {
  buildDigestModel,
  type DigestKitchenInput,
  type DigestModel,
} from "../../src/staff-changes/digest-model.js";
import * as domain from "../../src/index.js";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const WINDOW_HOURS = 720;

// ---------------------------------------------------------------------------------------------------------------------
// The day key against an oracle that shares no code with the module: Chisinau is UTC+2, and UTC+3 from the last
// Sunday of March to the last Sunday of October. The two rules for the changeover hour (Moldova's 00:00 UTC, the EU's
// 01:00 UTC) only differ while local time reads 02:00 to 04:00 on the change day itself, which has one date either way.

function lastSundayUtcMs(year: number, monthIndex: number): number {
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  const daysBackToSunday = lastDayOfMonth.getUTCDay();
  return Date.UTC(
    year,
    monthIndex,
    lastDayOfMonth.getUTCDate() - daysBackToSunday,
    1,
  );
}

function oracleOffsetHours(instantMs: number): number {
  const year = new Date(instantMs).getUTCFullYear();
  const summerStartsMs = lastSundayUtcMs(year, 2);
  const summerEndsMs = lastSundayUtcMs(year, 9);
  return instantMs >= summerStartsMs && instantMs < summerEndsMs ? 3 : 2;
}

function oracleDayKey(instantMs: number): string {
  const localMs = instantMs + oracleOffsetHours(instantMs) * MS_PER_HOUR;
  return new Date(localMs).toISOString().slice(0, 10);
}

describe("the Chisinau day key against an independent oracle", () => {
  const instants = fc.integer({
    min: Date.UTC(2020, 0, 1),
    max: Date.UTC(2035, 0, 1),
  });

  propertyTest.prop([instants], { numRuns: 3000 })(
    "agrees with UTC+2 / UTC+3 arithmetic at any instant in 2020-2035",
    (instantMs) => {
      expect(chisinauDayKey(instantMs)).toBe(oracleDayKey(instantMs));
    },
  );

  const aroundChangeDays = fc
    .constantFrom(2026, 2027, 2028, 2029)
    .chain((year) =>
      fc
        .constantFrom(2, 9)
        .chain((monthIndex) =>
          fc
            .integer({ min: -30, max: 30 })
            .map(
              (hoursFromChange) =>
                lastSundayUtcMs(year, monthIndex) +
                hoursFromChange * MS_PER_HOUR,
            ),
        ),
    );

  propertyTest.prop(
    [aroundChangeDays, fc.integer({ min: 0, max: MS_PER_HOUR - 1 })],
    { numRuns: 2000 },
  )(
    "agrees with the oracle within 30 hours of every clock change, at millisecond resolution",
    (hourStartMs, withinHourMs) => {
      const instantMs = hourStartMs + withinHourMs;

      expect(chisinauDayKey(instantMs)).toBe(oracleDayKey(instantMs));
    },
  );

  it("is a day of 23 hours on 2026-03-29, 25 hours on 2026-10-25, and 24 hours on every other day of 2026", () => {
    const hoursPerDay = new Map<string, number>();
    const startMs = Date.UTC(2025, 11, 31, 12);
    for (let hour = 0; hour < 24 * 400; hour += 1) {
      const key = chisinauDayKey(startMs + hour * MS_PER_HOUR);
      hoursPerDay.set(key, (hoursPerDay.get(key) ?? 0) + 1);
    }

    const completeDays2026 = [...hoursPerDay].filter(([key]) =>
      key.startsWith("2026-"),
    );
    const irregular = completeDays2026.filter(([, hours]) => hours !== 24);

    expect(completeDays2026).toHaveLength(365);
    expect(irregular).toEqual([
      ["2026-03-29", 23],
      ["2026-10-25", 25],
    ]);
  });
});

describe("the digest's own run instant, 0 5 * * * UTC (OQ-10)", () => {
  it("names a different, consecutive calendar day for every run from 2020 to 2035: no day skipped or repeated across a clock change", () => {
    let previousDayMs: number | undefined;

    for (
      let runMs = Date.UTC(2020, 0, 1, 5);
      runMs < Date.UTC(2035, 0, 1, 5);
      runMs += MS_PER_DAY
    ) {
      const dayMs = Date.parse(`${chisinauDayKey(runMs)}T00:00:00Z`);
      if (previousDayMs !== undefined) {
        expect(dayMs - previousDayMs).toBe(MS_PER_DAY);
      }
      previousDayMs = dayMs;
    }
  });

  it("names the UTC date of the run, local time being 07:00 or 08:00 of the same day", () => {
    for (
      let runMs = Date.UTC(2026, 0, 1, 5);
      runMs < Date.UTC(2027, 0, 1, 5);
      runMs += MS_PER_DAY
    ) {
      expect(chisinauDayKey(runMs)).toBe(
        new Date(runMs).toISOString().slice(0, 10),
      );
    }
  });

  it("gives two runs five minutes apart on one day the same key, so the claim by day key refuses the second", () => {
    const run = Date.UTC(2026, 9, 26, 5, 0, 0);

    expect(chisinauDayKey(run + 5 * 60_000)).toBe(chisinauDayKey(run));
  });
});

describe("the day key's refusals", () => {
  it.each([
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["beyond the minimum date", -8.64e15 - 1],
    ["not a number", Number.NaN],
  ])("refuses %s", (_label, value) => {
    expect(() => chisinauDayKey(value)).toThrow(RangeError);
  });

  it("accepts the two extreme representable instants", () => {
    expect(() => chisinauDayKey(8.64e15)).not.toThrow();
    expect(() => chisinauDayKey(-8.64e15)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Eligibility: the thirty-day window as fixed hours, swept over send instants through both clock changes.

function eligibleFacts(
  overrides: Partial<DigestEligibilityFacts> = {},
): DigestEligibilityFacts {
  const nowMs = overrides.nowMs ?? Date.UTC(2026, 9, 26, 5);
  return {
    nowMs,
    sentAtMs: nowMs - MS_PER_DAY,
    status: "contacted",
    isChangedSinceSeen: true,
    ...overrides,
  };
}

describe("the thirty-day window is 720 hours wherever the clocks change", () => {
  const sentInstants = fc.integer({
    min: Date.UTC(2026, 1, 1),
    max: Date.UTC(2026, 11, 1),
  });

  propertyTest.prop([sentInstants], { numRuns: 1000 })(
    "lists a kitchen at 720 hours less a millisecond and drops it at exactly 720 hours",
    (sentAtMs) => {
      const windowMs = WINDOW_HOURS * MS_PER_HOUR;

      expect(
        isDigestEligible(
          eligibleFacts({ sentAtMs, nowMs: sentAtMs + windowMs - 1 }),
        ),
      ).toBe(true);
      expect(
        isDigestEligible(
          eligibleFacts({ sentAtMs, nowMs: sentAtMs + windowMs }),
        ),
      ).toBe(false);
    },
  );

  it("exports the same 720 hours the sweep uses", () => {
    expect(DIGEST_WINDOW_MS).toBe(WINDOW_HOURS * MS_PER_HOUR);
  });

  it("drops a kitchen sent at 08:00 local on a summer day when the 30th morning after is on winter time (721 hours)", () => {
    const sentAtMs = Date.UTC(2026, 8, 26, 5); // 08:00 EEST
    const nowMs = Date.UTC(2026, 9, 26, 6); // 08:00 EET, thirty calendar days later

    expect(isDigestEligible(eligibleFacts({ sentAtMs, nowMs }))).toBe(false);
  });

  it("still lists a kitchen sent at 08:00 local on a winter day on the 30th morning after when spring came between (719 hours)", () => {
    const sentAtMs = Date.UTC(2026, 2, 20, 6); // 08:00 EET
    const nowMs = Date.UTC(2026, 3, 19, 5); // 08:00 EEST, thirty calendar days later

    expect(nowMs - sentAtMs).toBe(719 * MS_PER_HOUR);
    expect(isDigestEligible(eligibleFacts({ sentAtMs, nowMs }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Eligibility: metamorphic laws, valid and invalid instants over the whole double range.

const instantArbitrary = fc.double({
  min: -8.64e15,
  max: 8.64e15,
  noNaN: true,
});
const optionalInstant = fc.option(instantArbitrary, { nil: undefined });
const anyDouble = fc.double({ noDefaultInfinity: false });
const optionalAnyDouble = fc.option(anyDouble, { nil: undefined });

describe("isDigestEligible over every double", () => {
  propertyTest.prop(
    [anyDouble, anyDouble, optionalAnyDouble, optionalAnyDouble, fc.boolean()],
    { numRuns: 3000 },
  )(
    "is false whenever any instant is not finite, and never throws",
    (nowMs, sentAtMs, lastSeenAtMs, lastDigestedAtMs, isChangedSinceSeen) => {
      const facts: DigestEligibilityFacts = {
        nowMs,
        sentAtMs,
        status: "new",
        isChangedSinceSeen,
        ...(lastSeenAtMs !== undefined ? { lastSeenAtMs } : {}),
        ...(lastDigestedAtMs !== undefined ? { lastDigestedAtMs } : {}),
      };
      const isAnyInstantNotFinite = [
        nowMs,
        sentAtMs,
        lastSeenAtMs,
        lastDigestedAtMs,
      ].some((instant) => instant !== undefined && !Number.isFinite(instant));

      const result = isDigestEligible(facts);

      if (isAnyInstantNotFinite) expect(result).toBe(false);
      expect(typeof result).toBe("boolean");
    },
  );

  propertyTest.prop(
    [instantArbitrary, instantArbitrary, optionalInstant, optionalInstant],
    { numRuns: 3000 },
  )(
    "matches a plain restatement of the four conditions for any finite instants",
    (nowMs, sentAtMs, lastSeenAtMs, lastDigestedAtMs) => {
      const facts: DigestEligibilityFacts = {
        nowMs,
        sentAtMs,
        status: "new",
        isChangedSinceSeen: true,
        ...(lastSeenAtMs !== undefined ? { lastSeenAtMs } : {}),
        ...(lastDigestedAtMs !== undefined ? { lastDigestedAtMs } : {}),
      };
      const isHeld =
        lastDigestedAtMs !== undefined &&
        (lastSeenAtMs === undefined || lastDigestedAtMs >= lastSeenAtMs);

      expect(isDigestEligible(facts)).toBe(
        !isHeld && nowMs - sentAtMs < DIGEST_WINDOW_MS,
      );
    },
  );

  it.each([["offer-sent"], ["closed"]] as const)(
    "never lists status %s whatever else is true, even a kitchen sent in the future and never digested",
    (status) => {
      expect(
        isDigestEligible(
          eligibleFacts({ status, sentAtMs: Date.UTC(2030, 0, 1) }),
        ),
      ).toBe(false);
    },
  );
});

describe("isDigestEligible is monotone in each condition", () => {
  const seenAtMs = Date.UTC(2026, 9, 20, 10);

  it("re-arms a held kitchen when staff see it again after the digest, and holds it again once a digest follows", () => {
    const heldFacts = eligibleFacts({
      lastSeenAtMs: seenAtMs,
      lastDigestedAtMs: seenAtMs + MS_PER_HOUR,
    });
    const seenAgainFacts = {
      ...heldFacts,
      lastSeenAtMs: seenAtMs + 2 * MS_PER_HOUR,
    };
    const digestedAgainFacts = {
      ...seenAgainFacts,
      lastDigestedAtMs: seenAtMs + 3 * MS_PER_HOUR,
    };

    expect(isDigestEligible(heldFacts)).toBe(false);
    expect(isDigestEligible(seenAgainFacts)).toBe(true);
    expect(isDigestEligible(digestedAgainFacts)).toBe(false);
  });

  it("does not let an earlier digest hold a kitchen across a later sighting however long ago the digest ran", () => {
    const facts = eligibleFacts({
      lastSeenAtMs: seenAtMs,
      lastDigestedAtMs: seenAtMs - 20 * MS_PER_DAY,
    });

    expect(isDigestEligible(facts)).toBe(true);
  });

  it("is not changed by the order the facts are written in (a plain object, no hidden state)", () => {
    const first = eligibleFacts({ lastSeenAtMs: seenAtMs });
    const second = { ...first };
    const evaluations = [
      isDigestEligible(first),
      isDigestEligible(second),
      isDigestEligible(first),
    ];

    expect(new Set(evaluations).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The model: shuffled, smuggled and mutated inputs.

const NOW_MS = Date.UTC(2026, 9, 25, 12);

function kitchen(
  designId: string,
  overrides: Partial<DigestKitchenInput> = {},
): DigestKitchenInput {
  return {
    designId,
    customerName: `Client ${designId}`,
    sentAtMs: NOW_MS - 9 * MS_PER_DAY,
    updatedAtMs: NOW_MS - MS_PER_HOUR,
    ...overrides,
  } as DigestKitchenInput;
}

function digestOf(kitchens: readonly DigestKitchenInput[]): DigestModel {
  const model = buildDigestModel(kitchens);
  if (model.kind !== "digest") throw new Error("expected a digest");
  return model;
}

const uniqueKitchens = fc
  .uniqueArray(
    fc.record({
      designId: fc.string({ minLength: 1, maxLength: 6 }),
      updatedOffsetMs: fc.integer({ min: 0, max: 5 * MS_PER_DAY }),
      kitchenName: fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
      hasAccount: fc.boolean(),
    }),
    { minLength: 1, maxLength: 12, selector: (entry) => entry.designId },
  )
  .map((entries) =>
    entries.map(({ designId, updatedOffsetMs, kitchenName, hasAccount }) =>
      hasAccount
        ? kitchen(designId, {
            updatedAtMs: NOW_MS - updatedOffsetMs,
            ...(kitchenName !== undefined ? { kitchenName } : {}),
          })
        : ({
            designId,
            reference: `REQ-${designId}`,
            ...(kitchenName !== undefined ? { kitchenName } : {}),
            sentAtMs: NOW_MS - 9 * MS_PER_DAY,
            updatedAtMs: NOW_MS - updatedOffsetMs,
          } satisfies DigestKitchenInput),
    ),
  );

describe("the digest model over shuffled kitchens", () => {
  propertyTest.prop(
    [uniqueKitchens, fc.array(fc.nat(), { minLength: 12, maxLength: 12 })],
    {
      numRuns: 300,
    },
  )(
    "prints the same rows whatever order the store returns them in",
    (kitchens, sortKeys) => {
      const shuffled = [...kitchens]
        .map((entry, index) => ({ entry, key: sortKeys[index] ?? 0 }))
        .sort((first, second) => first.key - second.key)
        .map(({ entry }) => entry);

      expect(digestOf(shuffled)).toEqual(digestOf(kitchens));
    },
  );

  propertyTest.prop([uniqueKitchens], { numRuns: 300 })(
    "counts exactly the rows, one per design, ordered by latest change then design id",
    (kitchens) => {
      const model = digestOf(kitchens);

      expect(model.subjectCount).toBe(kitchens.length);
      expect(model.rows).toHaveLength(kitchens.length);
      for (let index = 1; index < model.rows.length; index += 1) {
        const previous = model.rows[index - 1];
        const current = model.rows[index];
        if (previous === undefined || current === undefined)
          throw new Error("row missing");
        const isOrdered =
          previous.updatedAtMs > current.updatedAtMs ||
          (previous.updatedAtMs === current.updatedAtMs &&
            previous.designId < current.designId);
        expect(isOrdered).toBe(true);
      }
    },
  );

  propertyTest.prop([uniqueKitchens], { numRuns: 200 })(
    "carries each row's two days as the Chisinau day of its own instants",
    (kitchens) => {
      for (const row of digestOf(kitchens).rows) {
        expect(row.sentDay).toBe(oracleDayKey(row.sentAtMs));
        expect(row.updatedDay).toBe(oracleDayKey(row.updatedAtMs));
      }
    },
  );

  it("does not write into its input, which may be frozen", () => {
    const input = Object.freeze([
      Object.freeze(kitchen("b")),
      Object.freeze(kitchen("a", { updatedAtMs: NOW_MS })),
    ]);

    expect(() => buildDigestModel(input)).not.toThrow();
    expect(input.map((entry) => entry.designId)).toEqual(["b", "a"]);
  });

  it("holds no reference to an input object: changing one afterwards leaves the model as it was", () => {
    const input = kitchen("a", { kitchenName: "Cu insula" });
    const model = digestOf([input]);

    (input as { customerName: string }).customerName = "Changed";
    (input as { kitchenName?: string }).kitchenName = "Changed";

    expect(model.rows[0]?.customer).toEqual({
      kind: "account-name",
      name: "Client a",
    });
    expect(model.rows[0]?.kitchenName).toBe("Cu insula");
  });
});

describe("the digest model leaks nothing the port did not name", () => {
  const SMUGGLED = {
    email: "ana.popescu@mail.md",
    phone: "069 123 456",
    contactEmail: "other@mail.md",
    revision: "17",
    message: "the customer's free text",
    priced: { total: 58200 },
  };

  it.each([
    ["an account name", kitchen("a")],
    [
      "a request reference",
      {
        designId: "a",
        reference: "REQ-1",
        sentAtMs: NOW_MS,
        updatedAtMs: NOW_MS,
      },
    ],
  ] as const)(
    "keeps every smuggled field out of the serialised model, for %s",
    (_label, base) => {
      const model = digestOf([
        Object.assign({}, base, SMUGGLED) as DigestKitchenInput,
      ]);
      const serialised = JSON.stringify(model);

      for (const secret of [
        "ana.popescu",
        "069 123",
        "other@mail",
        "free text",
        "58200",
        '"17"',
      ]) {
        expect(serialised).not.toContain(secret);
      }
      expect(Object.keys(model).sort()).toEqual([
        "footer",
        "kind",
        "rows",
        "subjectCount",
      ]);
      expect(Object.keys(model.rows[0] ?? {}).sort()).not.toContain("email");
    },
  );

  it("names a customer by the account name even when a reference arrives too, never both", () => {
    const both = Object.assign(kitchen("a"), { reference: "REQ-9" });

    const row = digestOf([both]).rows[0];

    expect(row?.customer).toEqual({ kind: "account-name", name: "Client a" });
    expect(JSON.stringify(row)).not.toContain("REQ-9");
  });
});

describe("the footer is the rule's own constants, immutable to a caller", () => {
  it("cannot be edited by a caller, so one digest cannot change the next one's footer", () => {
    const { footer } = digestOf([kitchen("a")]);

    expect(() => {
      (footer as { windowDays: number }).windowDays = 1;
    }).toThrow(TypeError);
    expect(() => {
      (footer.stoppingStatuses as string[]).push("new");
    }).toThrow(TypeError);
    expect(digestOf([kitchen("b")]).footer.windowDays).toBe(30);
    expect(digestOf([kitchen("b")]).footer.stoppingStatuses).toEqual([
      "offer-sent",
      "closed",
    ]);
  });

  it("is the same object in every digest, so a footer cannot differ between two e-mails", () => {
    expect(digestOf([kitchen("a")]).footer).toBe(
      digestOf([kitchen("z")]).footer,
    );
  });
});

describe("a row with an instant that is not a time", () => {
  it.each([
    ["sentAtMs", { sentAtMs: Number.NaN }],
    ["updatedAtMs", { updatedAtMs: Number.POSITIVE_INFINITY }],
  ] as const)(
    "refuses the whole digest naming the day key function when %s is bad",
    (_label, overrides) => {
      expect(() =>
        buildDigestModel([kitchen("a"), kitchen("b", overrides)]),
      ).toThrow(/chisinauDayKey/);
    },
  );
});

describe("the package barrel", () => {
  it("exports the K1 rules from the package root, where the web app and persistence callers import them", () => {
    expect(domain.isDigestEligible).toBe(isDigestEligible);
    expect(domain.buildDigestModel).toBe(buildDigestModel);
    expect(domain.chisinauDayKey).toBe(chisinauDayKey);
    expect(domain.DIGEST_WINDOW_MS).toBe(DIGEST_WINDOW_MS);
  });
});
