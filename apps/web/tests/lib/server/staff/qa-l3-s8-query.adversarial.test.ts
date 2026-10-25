import { fc } from "@fast-check/vitest";
import {
  FakeStaffAuditStore,
  MAX_STAFF_AUDIT_PAGE,
  type SessionStore,
} from "@lemnaria/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readStaffAuditQuery,
  type StaffAuditQueryIssue,
  type StaffAuditQueryReading,
} from "@/lib/server/staff/staff-audit-query";

import {
  chisinauOffsetHoursAt,
  civilDayFromText,
  civilDaysBetween,
  dayText,
  daysInMonth,
  localMidnightOf,
  nextCivilDay,
  wallClockAt,
  type CivilDay,
} from "../../../support/qa-l3-s8-chisinau-oracle";

/**
 * Adversarial QA of wave L3-S8, part one: how the audit page's query is read. The developer's file pins examples. This
 * file asks what an example would miss: that every query the reader accepts is one the port accepts (a refusal by the
 * port is a 503, and a person can type anything), that the reader and an independent calendar agree on which days
 * exist, that the Chisinau window is a local midnight read by a second clock and not a shifted constant, and that
 * the process's own time zone changes nothing. The text a person types reaches the reader as `URLSearchParams` decode
 * it, so each case is written as the raw query.
 */

const AN_ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";
const HOUR_MS = 3_600_000;
const FIVE_ACTIONS = [
  "kitchen-opened",
  "note-added",
  "status-changed",
  "kitchen-unhidden",
  "kitchens-listed",
] as const;
const FULLWIDTH_ONE = String.fromCodePoint(0xff11);
const ARABIC_INDIC_ONE = String.fromCodePoint(0x661);
const ARABIC_INDIC_TWO = String.fromCodePoint(0x662);
const EN_DASH = String.fromCodePoint(0x2013);
const HYPHEN_U2010 = String.fromCodePoint(0x2010);

/** The ASCII digits of the text written in another script, whose zero is the code point given. */
function digitsWritten(text: string, zeroCodePoint: number): string {
  return text.replace(/[0-9]/g, (digit) =>
    String.fromCodePoint(zeroCodePoint + Number(digit)),
  );
}

function read(raw: string): StaffAuditQueryReading {
  return readStaffAuditQuery(new URLSearchParams(raw));
}

function requestOf(raw: string) {
  const reading = read(raw);
  if (!reading.ok) {
    throw new Error(
      `Expected ${raw.slice(0, 80)} to be accepted: ${JSON.stringify(reading.issues)}`,
    );
  }
  return reading.request;
}

function issuesOf(raw: string): readonly StaffAuditQueryIssue[] {
  const reading = read(raw);
  if (reading.ok) throw new Error(`Expected ${raw.slice(0, 80)} to be refused`);
  return reading.issues;
}

describe("a page number is digits and nothing else, whatever script or sign they come in", () => {
  it.each([
    ["a literal plus sign", "page=%2B1"],
    ["a plus the URL form reads as a space", "page=+1"],
    ["a trailing space", "page=1%20"],
    ["a leading space", "page=%201"],
    ["a trailing newline", "page=1%0A"],
    ["a trailing NUL", "page=1%00"],
    ["a full-width digit", `page=${encodeURIComponent(FULLWIDTH_ONE)}`],
    ["an Arabic-Indic digit", `page=${encodeURIComponent(ARABIC_INDIC_ONE)}`],
    [
      "two Arabic-Indic digits",
      `page=${encodeURIComponent(ARABIC_INDIC_ONE + ARABIC_INDIC_TWO)}`,
    ],
    ["a hexadecimal number", "page=0x10"],
    ["an underscore separator", "page=1_0"],
    ["a decimal point", "page=1.0"],
    ["minus zero", "page=-0"],
    ["zero written twice", "page=00"],
    ["Infinity", "page=Infinity"],
    ["NaN", "page=NaN"],
    ["the largest safe integer", `page=${String(Number.MAX_SAFE_INTEGER)}`],
    ["one past the safe integers", "page=9007199254740993"],
    [
      "a thousand 9s, which Number reads as Infinity",
      `page=${"9".repeat(1000)}`,
    ],
    ["a percent sign that begins no escape", "page=%"],
    ["an escape of a broken byte sequence", "page=%E0%A4%A"],
  ])("refuses %s", (_title, raw) => {
    expect(issuesOf(raw)).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
  });

  it("reads a percent-escaped digit as the digit, and takes the last page the port counts", () => {
    expect(requestOf("page=%31").page).toBe(1);
    expect(requestOf(`page=${String(MAX_STAFF_AUDIT_PAGE)}`).page).toBe(
      MAX_STAFF_AUDIT_PAGE,
    );
    expect(requestOf("page=99999").page).toBe(99_999);
  });
});

describe("an action is one of five codes spelled exactly", () => {
  it.each(FIVE_ACTIONS)(
    "accepts %s, spelled with a percent-escaped hyphen too",
    (action) => {
      expect(requestOf(`action=${action}`).action).toBe(action);
      expect(requestOf(`action=${action.replaceAll("-", "%2D")}`).action).toBe(
        action,
      );
    },
  );

  it.each([
    ["a trailing newline", "kitchens-listed%0A"],
    ["a trailing NUL", "note-added%00"],
    ["a leading space", "%20note-added"],
    ["a plus read as a space", "note-added+"],
    ["a capital first letter", "Note-added"],
    ["an underscore for a hyphen", "kitchens_listed"],
    [
      "a Unicode hyphen for the ASCII one",
      `kitchen${encodeURIComponent(HYPHEN_U2010)}opened`,
    ],
    ["a prefix of a code", "kitchen"],
    ["two codes", "note-added,kitchen-opened"],
    ["a name every object has", "toString"],
    ["another name every object has", "hasOwnProperty"],
    ["valueOf", "valueOf"],
    ["__proto__", "__proto__"],
    ["a wildcard", "*"],
    ["a code a later build might write", "preset-hidden"],
  ])("refuses %s as an unknown value", (_title, action) => {
    expect(issuesOf(`action=${action}`)).toEqual([
      { field: "action", code: "UNKNOWN_VALUE" },
    ]);
  });
});

describe("an actor is the shape of an account id, and no more", () => {
  it.each([
    ["all capitals", "ABCDEFGHIJKLMNOPQRSTU"],
    ["all hyphens", "---------------------"],
    ["all underscores", "_____________________"],
    ["all digits", "012345678901234567890"],
  ])(
    "accepts twenty-one characters that are %s (the table's shape, not a lookup)",
    (_title, actor) => {
      expect(requestOf(`actor=${actor}`).actorAccountId).toBe(actor);
    },
  );

  it.each([
    ["twenty characters", AN_ACCOUNT_ID.slice(1)],
    ["twenty-two characters", `${AN_ACCOUNT_ID}A`],
    ["twenty characters and a newline", `${AN_ACCOUNT_ID.slice(1)}%0A`],
    ["twenty-one characters and a newline", `${AN_ACCOUNT_ID}%0A`],
    ["twenty characters and a NUL", `${AN_ACCOUNT_ID.slice(1)}%00`],
    ["an equals sign among them", `${AN_ACCOUNT_ID.slice(0, 20)}%3D`],
    ["a slash among them", `${AN_ACCOUNT_ID.slice(0, 20)}%2F`],
    ["a percent sign among them", `${AN_ACCOUNT_ID.slice(0, 20)}%25`],
    [
      "a full-width letter among them",
      `${AN_ACCOUNT_ID.slice(0, 20)}${encodeURIComponent(String.fromCodePoint(0xff21))}`,
    ],
    [
      "an Arabic-Indic digit among them",
      `${AN_ACCOUNT_ID.slice(0, 20)}${encodeURIComponent(ARABIC_INDIC_ONE)}`,
    ],
    [
      "an emoji, two UTF-16 units, for the last two",
      `${AN_ACCOUNT_ID.slice(0, 19)}${encodeURIComponent(String.fromCodePoint(0x1f600))}`,
    ],
    ["a dollar sign: a pattern, not an id", `${AN_ACCOUNT_ID.slice(0, 20)}%24`],
    ["a hundred thousand characters", "A".repeat(100_000)],
  ])("refuses %s", (_title, actor) => {
    expect(issuesOf(`actor=${actor}`)).toEqual([
      { field: "actor", code: "NOT_AN_ACCOUNT_ID" },
    ]);
  });
});

describe("a day is YYYY-MM-DD and a day the calendar has", () => {
  it.each([
    ["no zero padding of the month and day", "2026-3-1"],
    ["a time after it", "2026-03-01T00:00"],
    ["a time and zone after it", "2026-03-01T00%3A00%3A00%2B02%3A00"],
    ["a leading space", "%202026-03-01"],
    ["a trailing newline", "2026-03-01%0A"],
    ["a trailing NUL", "2026-03-01%00"],
    ["a space alone", "%20"],
    ["a literal plus sign before the year", "%2B2026-03-01"],
    ["dots", "2026.03.01"],
    ["en dashes", `2026${EN_DASH}03${EN_DASH}01`],
    [
      "full-width digits",
      encodeURIComponent(
        digitsWritten(dayText({ year: 2026, month: 3, day: 1 }), 0xff10),
      ),
    ],
    [
      "Arabic-Indic digits",
      encodeURIComponent(
        digitsWritten(dayText({ year: 2026, month: 3, day: 1 }), 0x660),
      ),
    ],
    ["the 30th of February", "2026-02-30"],
    ["the 29th of February in 2100, which is no leap year", "2100-02-29"],
    ["the 29th of February in 1900-style century years", "2200-02-29"],
    ["a month 13", "2026-13-01"],
    ["a month 00 and a day 00", "2026-00-00"],
    ["a day 00", "2026-12-00"],
    ["a day 32", "2026-01-32"],
    ["the 31st of a 30-day month", "2026-06-31"],
  ])("refuses %s as not a date, in from and in to", (_title, day) => {
    expect(issuesOf(`from=${day}`)).toEqual([
      { field: "from", code: "NOT_A_DATE" },
    ]);
    expect(issuesOf(`to=${day}`)).toEqual([
      { field: "to", code: "NOT_A_DATE" },
    ]);
  });

  it.each([
    ["year 0000 with month and day 00", "0000-00-00"],
    ["year 0000", "0000-01-01"],
    ["year 0001", "0001-01-01"],
    ["the last day before the product", "1999-12-31"],
    ["the first day past the last", "9999-01-01"],
    ["the last day the table could hold", "9999-12-31"],
    ["an impossible day in a year out of range", "1999-02-30"],
  ])("refuses %s as outside the days the log can hold", (_title, day) => {
    expect(issuesOf(`from=${day}`)).toEqual([
      { field: "from", code: "DATE_OUT_OF_RANGE" },
    ]);
    expect(issuesOf(`to=${day}`)).toEqual([
      { field: "to", code: "DATE_OUT_OF_RANGE" },
    ]);
  });

  it.each([
    "2000-01-01",
    "2000-02-29",
    "2400-02-29",
    "2026-03-29",
    "2026-10-25",
    "9998-12-31",
    "9998-01-01",
  ])(
    "accepts %s in both ends, and the port takes what it makes",
    async (day) => {
      const request = requestOf(`from=${day}&to=${day}`);

      await expect(portOf().page(request)).resolves.toBeDefined();
    },
  );

  it("names the year first when a day is out of range and impossible both, and never adds a range problem to a day that is wrong", () => {
    expect(issuesOf("from=9999-01-01&to=2000-01-01")).toEqual([
      { field: "from", code: "DATE_OUT_OF_RANGE" },
    ]);
    expect(issuesOf("from=2026-02-30&to=1999-01-01")).toEqual([
      { field: "from", code: "NOT_A_DATE" },
      { field: "to", code: "DATE_OUT_OF_RANGE" },
    ]);
  });

  it("refuses an inverted pair at the two ends of the log's own range, and accepts the full range", () => {
    expect(issuesOf("from=9998-12-31&to=2000-01-01")).toEqual([
      { field: "range", code: "RANGE_INVERTED" },
    ]);
    expect(read("from=2000-01-01&to=9998-12-31").ok).toBe(true);
    expect(read("from=9998-12-31&to=9998-12-31").ok).toBe(true);
  });
});

describe("a member sent twice or in another shape, and members that are not named", () => {
  it.each([
    ["page 3 then page 0", "page=3&page=0", { page: 3 }],
    ["an empty page then page 3", "page=&page=3", { page: 1 }],
    [
      "an action then an unknown action",
      "action=note-added&action=bogus",
      { action: "note-added" },
    ],
    [
      "an empty action then an action: the first, empty, wins and no filter is applied",
      "action=&action=note-added",
      { action: null },
    ],
    [
      "an actor then a bad actor",
      `actor=${AN_ACCOUNT_ID}&actor=bad`,
      { actorAccountId: AN_ACCOUNT_ID },
    ],
    ["a bracketed page and nothing else", "page[]=2&page%5B%5D=3", { page: 1 }],
    [
      "a bracketed action",
      "action[]=note-added&action[0]=note-added",
      { action: null },
    ],
    [
      "a member named for an object's own keys",
      "__proto__=x&constructor=y&toString=z&hasOwnProperty=1",
      { page: 1, action: null, actorAccountId: null },
    ],
    [
      "members in capitals, which are other members",
      "PAGE=9&Action=note-added&ACTOR=bad&FROM=bad",
      { page: 1, action: null, actorAccountId: null },
    ],
  ])(
    "reads %s as the first of each member it names",
    (_title, raw, expected) => {
      expect(requestOf(raw)).toMatchObject(expected);
    },
  );

  it("refuses by the first value of a member sent twice, and not by the second", () => {
    expect(issuesOf("page=0&page=3")).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
    expect(issuesOf("from=bad&from=2026-01-01")).toEqual([
      { field: "from", code: "NOT_A_DATE" },
    ]);
  });

  it("reads a semicolon as part of the value and not as a separator", () => {
    expect(issuesOf("page=2;action=note-added")).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
    expect(issuesOf("action=note-added;page=2")).toEqual([
      { field: "action", code: "UNKNOWN_VALUE" },
    ]);
  });

  it("reads a very long query without throwing, and refuses what is wrong in it", () => {
    const manyMembers = Array.from(
      { length: 20_000 },
      (_, n) => `m${String(n)}=x`,
    );
    const raw = `${manyMembers.join("&")}&page=${"9".repeat(50_000)}&actor=${"b".repeat(50_000)}`;

    expect(issuesOf(raw)).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
      { field: "actor", code: "NOT_AN_ACCOUNT_ID" },
    ]);
  });

  it("never repeats what it refused, in the issues of any wrong query", () => {
    const secret = "Zorila-Quasar-9917";
    const raw = `page=${secret}&action=${secret}&actor=${secret}&from=${secret}&to=${secret}`;

    expect(JSON.stringify(issuesOf(raw))).not.toContain(secret);
    expect(issuesOf(raw)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The reader against a calendar of its own

function portOf(): FakeStaffAuditStore {
  return new FakeStaffAuditStore({ sessions: {} as SessionStore });
}

const PAGE_TEXTS = fc.oneof(
  fc.integer({ min: 1, max: MAX_STAFF_AUDIT_PAGE }).map(String),
  fc.constantFrom(
    "",
    "1",
    "0",
    "01",
    "100000",
    "100001",
    "1e3",
    " 1",
    "-1",
    "1.5",
    "abc",
  ),
);
const ACTION_TEXTS = fc.constantFrom(
  "",
  ...FIVE_ACTIONS,
  "bogus",
  "Note-Added",
  "kitchen-opened ",
);
const ACTOR_TEXTS = fc.oneof(
  fc.constantFrom("", AN_ACCOUNT_ID, "short", `${AN_ACCOUNT_ID}x`),
  fc.stringMatching(/^[A-Za-z0-9_-]{19,23}$/),
  fc.stringMatching(/^[A-Za-z0-9_.@ -]{21}$/),
);
const DAY_TEXTS = fc.oneof(
  fc.constantFrom("", "x", "2026-3-1", "2026-03-01T00:00"),
  fc
    .tuple(
      fc.oneof(
        fc.constantFrom(0, 1, 1999, 2000, 2001, 9997, 9998, 9999),
        fc.integer({ min: 1990, max: 10_000 }),
        fc.integer({ min: 2024, max: 2030 }),
      ),
      fc.oneof(
        fc.constantFrom(0, 1, 2, 12, 13),
        fc.integer({ min: 0, max: 14 }),
      ),
      fc.oneof(
        fc.constantFrom(0, 1, 28, 29, 30, 31, 32),
        fc.integer({ min: 0, max: 33 }),
      ),
    )
    .map(([year, month, day]) => dayText({ year, month, day })),
);

const FIRST_YEAR = 2000;
const LAST_YEAR = 9998;

/** What the calendar says of the text, without the reader's own code: the day, or why not. */
function dayOfText(
  text: string,
): CivilDay | "absent" | "NOT_A_DATE" | "DATE_OUT_OF_RANGE" {
  if (text === "") return "absent";
  const parts = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
  if (parts === null) return "NOT_A_DATE";
  const [year, month, day] = parts.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  if (year < FIRST_YEAR || year > LAST_YEAR) return "DATE_OUT_OF_RANGE";
  const isReal =
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  return isReal ? { year, month, day } : "NOT_A_DATE";
}

describe("what the reader accepts is what the port accepts, and what the calendar has", () => {
  it("accepts exactly the queries an independent calendar accepts, and every accepted request is one the port answers", async () => {
    await fc.assert(
      fc.asyncProperty(
        PAGE_TEXTS,
        ACTION_TEXTS,
        ACTOR_TEXTS,
        DAY_TEXTS,
        DAY_TEXTS,
        async (page, action, actor, from, to) => {
          const reading = readStaffAuditQuery(
            new URLSearchParams([
              ["page", page],
              ["action", action],
              ["actor", actor],
              ["from", from],
              ["to", to],
            ]),
          );
          const fromDay = dayOfText(from);
          const toDay = dayOfText(to);
          const expectedIssues = [
            ...(page === "" || isPageNumber(page)
              ? []
              : ["page:NOT_A_PAGE_NUMBER"]),
            ...(action === "" ||
            (FIVE_ACTIONS as readonly string[]).includes(action)
              ? []
              : ["action:UNKNOWN_VALUE"]),
            ...(actor === "" || /^[A-Za-z0-9_-]{21}$/.test(actor)
              ? []
              : ["actor:NOT_AN_ACCOUNT_ID"]),
            ...(typeof fromDay === "string" && fromDay !== "absent"
              ? [`from:${fromDay}`]
              : []),
            ...(typeof toDay === "string" && toDay !== "absent"
              ? [`to:${toDay}`]
              : []),
            ...(typeof fromDay === "object" &&
            typeof toDay === "object" &&
            dayText(fromDay) > dayText(toDay)
              ? ["range:RANGE_INVERTED"]
              : []),
          ];

          if (expectedIssues.length > 0) {
            expect(reading.ok).toBe(false);
            if (!reading.ok) {
              expect(
                reading.issues.map(({ field, code }) => `${field}:${code}`),
              ).toEqual(expectedIssues);
            }
            return;
          }
          expect(reading.ok).toBe(true);
          if (!reading.ok) return;
          await expect(portOf().page(reading.request)).resolves.toMatchObject({
            page: reading.request.page,
          });
          expect(reading.request.page).toBe(page === "" ? 1 : Number(page));
          expect(reading.request.action).toBe(action === "" ? null : action);
          expect(reading.request.actorAccountId).toBe(
            actor === "" ? null : actor,
          );
          expect(reading.request.occurredFrom).toEqual(
            typeof fromDay === "object" ? localMidnightOf(fromDay) : null,
          );
          expect(reading.request.occurredBefore).toEqual(
            typeof toDay === "object"
              ? localMidnightOf(nextCivilDay(toDay))
              : null,
          );
        },
      ),
      { numRuns: 1500 },
    );
  });

  function isPageNumber(text: string): boolean {
    return /^[1-9][0-9]*$/.test(text) && Number(text) <= MAX_STAFF_AUDIT_PAGE;
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Chisinau days

function windowOf(day: CivilDay, lastDay: CivilDay = day) {
  const request = requestOf(`from=${dayText(day)}&to=${dayText(lastDay)}`);
  if (request.occurredFrom === null || request.occurredBefore === null) {
    throw new Error("a window needs both ends");
  }
  return { from: request.occurredFrom, before: request.occurredBefore };
}

/** The window of a day is its local midnight to the next one, by the oracle's rule and read back off a second clock. */
function expectLocalDayWindow(day: CivilDay): void {
  const { from, before } = windowOf(day);
  const next = nextCivilDay(day);

  expect(from).toEqual(localMidnightOf(day));
  expect(before).toEqual(localMidnightOf(next));
  expect(wallClockAt(from)).toBe(`${dayText(day)} 00:00:00`);
  expect(wallClockAt(new Date(from.getTime() - 1))).not.toContain(dayText(day));
  expect(wallClockAt(new Date(before.getTime() - 1))).toBe(
    `${dayText(day)} 23:59:59`,
  );
  expect(wallClockAt(before)).toBe(`${dayText(next)} 00:00:00`);
  expect((before.getTime() - from.getTime()) / HOUR_MS).toBe(
    24 +
      chisinauOffsetHoursAt(from.getTime()) -
      chisinauOffsetHoursAt(before.getTime()),
  );
}

describe("every day of three years is a local midnight to the next local midnight", () => {
  const SPAN = civilDaysBetween(
    civilDayFromText("2026-01-01"),
    civilDayFromText("2028-12-31"),
  );

  function dayOfSpan(index: number): CivilDay {
    const day = SPAN[index];
    if (day === undefined)
      throw new Error(`no day ${String(index)} in the span`);
    return day;
  }

  it("holds for each of the 1096 days of 2026, 2027 and 2028, as a second clock and the zone's rule read them", () => {
    for (const day of SPAN) expectLocalDayWindow(day);
  });

  it("makes each window end exactly where the next day's begins, and never at the start plus 24 hours on the six clock changes", () => {
    const hoursOf: number[] = [];
    SPAN.forEach((day, index) => {
      const { from, before } = windowOf(day);
      const following = SPAN[index + 1];
      if (following !== undefined) {
        expect(windowOf(following).from).toEqual(before);
      }
      hoursOf.push((before.getTime() - from.getTime()) / HOUR_MS);
    });

    const datesOfHours = (hours: number) =>
      SPAN.filter((_, index) => hoursOf[index] === hours).map(dayText);
    expect(datesOfHours(23)).toEqual([
      "2026-03-29",
      "2027-03-28",
      "2028-03-26",
    ]);
    expect(datesOfHours(25)).toEqual([
      "2026-10-25",
      "2027-10-31",
      "2028-10-29",
    ]);
    expect(hoursOf.filter((hours) => hours === 24)).toHaveLength(
      SPAN.length - 6,
    );
  });

  it("builds the window of any pair of days in the span from the first's midnight to the midnight after the last", () => {
    const dayInSpan = fc.integer({ min: 0, max: SPAN.length - 1 });
    fc.assert(
      fc.property(fc.tuple(dayInSpan, dayInSpan), ([left, right]) => {
        const first = dayOfSpan(Math.min(left, right));
        const last = dayOfSpan(Math.max(left, right));

        const { from, before } = windowOf(first, last);

        expect(from).toEqual(localMidnightOf(first));
        expect(before).toEqual(localMidnightOf(nextCivilDay(last)));
        expect(before.getTime()).toBeGreaterThan(from.getTime());
      }),
      { numRuns: 400 },
    );
  });

  it("holds for days the product will never see: the zone's rule in any year from 2000 to 9998, at the year's ends and its clock changes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: FIRST_YEAR, max: LAST_YEAR }),
        fc.constantFrom(
          [1, 1],
          [3, 25],
          [3, 26],
          [3, 27],
          [3, 28],
          [3, 29],
          [3, 30],
          [3, 31],
          [10, 25],
          [10, 26],
          [10, 27],
          [10, 28],
          [10, 29],
          [10, 30],
          [10, 31],
          [12, 31],
        ),
        (year, [month, day]) => {
          expectLocalDayWindow({
            year,
            month: month as number,
            day: day as number,
          });
        },
      ),
      { numRuns: 600 },
    );
  });
});

describe("the process's own time zone changes nothing", () => {
  const ZONES = [
    "UTC",
    "America/Los_Angeles",
    "Asia/Calcutta",
    "Etc/GMT+12",
    "Pacific/Kiritimati",
    "Pacific/Apia",
    "Australia/Lord_Howe",
    "Europe/Chisinau",
  ];
  const AROUND_A_CLOCK_CHANGE = [
    "2026-03-29",
    "2026-10-25",
    "2027-03-28",
    "2027-10-31",
    "2028-03-26",
    "2028-10-29",
  ].flatMap((text) => {
    const day = civilDayFromText(text);
    const before = civilDaysBetween(
      civilDayFromText(dayText({ ...day, day: 1 })),
      day,
    );
    return [
      ...before.slice(-3),
      nextCivilDay(day),
      nextCivilDay(nextCivilDay(day)),
    ];
  });
  const EDGES = [
    ...AROUND_A_CLOCK_CHANGE,
    civilDayFromText("2026-01-01"),
    civilDayFromText("2026-12-31"),
    civilDayFromText("2027-01-01"),
    civilDayFromText("2028-02-29"),
    civilDayFromText("2028-12-31"),
    civilDayFromText("2000-01-01"),
    civilDayFromText("9998-12-31"),
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a zone the runtime really moves to when the test asks, or the cases below would prove nothing", () => {
    const readings = ZONES.map((zone) => {
      vi.stubEnv("TZ", zone);
      return new Intl.DateTimeFormat().resolvedOptions().timeZone;
    });

    expect(readings).toEqual(ZONES);
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(new Date(Date.UTC(2026, 0, 1, 12)).getHours()).toBe(4);
    vi.stubEnv("TZ", "Asia/Calcutta");
    expect(new Date(Date.UTC(2026, 0, 1, 12)).getMinutes()).toBe(30);
  });

  it.each(ZONES)(
    "reads every day around a clock change, a year's end and the log's first and last day alike under TZ=%s",
    (zone) => {
      vi.stubEnv("TZ", zone);
      expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);

      for (const day of EDGES) expectLocalDayWindow(day);
    },
  );

  it.each(ZONES)(
    "accepts and refuses the same days under TZ=%s: February, month ends and the rollover days a local-time calendar misreads",
    (zone) => {
      vi.stubEnv("TZ", zone);
      const accepted = ["2028-02-29", "2026-12-31", "2026-01-01", "2026-03-29"];
      const refused = [
        "2026-02-29",
        "2026-02-30",
        "2026-04-31",
        "2026-12-32",
        "2026-13-01",
        "2026-00-10",
      ];

      for (const day of accepted) expect(read(`from=${day}`).ok).toBe(true);
      for (const day of refused) expect(read(`from=${day}`).ok).toBe(false);
    },
  );
});
