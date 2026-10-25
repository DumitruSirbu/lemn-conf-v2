import { MAX_STAFF_AUDIT_PAGE } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import {
  EARLIEST_AUDIT_FILTER_YEAR,
  LATEST_AUDIT_FILTER_YEAR,
  readStaffAuditQuery,
  type StaffAuditQueryReading,
} from "@/lib/server/staff/staff-audit-query";

/**
 * What the audit page's query is read to: the port's request, or the members that are wrong as codes. Every value that
 * is accepted must be one the port accepts, because the port throws on any other and a throw is a `503`.
 */

const AN_ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";
const HOUR_MS = 3_600_000;

function read(query: string): StaffAuditQueryReading {
  return readStaffAuditQuery(new URLSearchParams(query));
}

function requestOf(query: string) {
  const reading = read(query);
  if (!reading.ok) {
    throw new Error(
      `Expected ${query} to be accepted: ${JSON.stringify(reading.issues)}`,
    );
  }
  return reading.request;
}

function issuesOf(query: string) {
  const reading = read(query);
  if (reading.ok) throw new Error(`Expected ${query} to be refused`);
  return reading.issues;
}

describe("no filter", () => {
  it("reads an empty query as the first page with no filter", () => {
    expect(requestOf("")).toEqual({
      actorAccountId: null,
      action: null,
      occurredFrom: null,
      occurredBefore: null,
      page: 1,
    });
  });

  it("reads empty members as absent, and ignores every member it does not name", () => {
    expect(
      requestOf(
        `page=&action=&actor=&from=&to=&role=administrator&accountId=${AN_ACCOUNT_ID}&pageSize=1`,
      ),
    ).toEqual(requestOf(""));
  });
});

describe("the page", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["25", 25],
    [String(MAX_STAFF_AUDIT_PAGE), MAX_STAFF_AUDIT_PAGE],
  ])("accepts page %s", (text, page) => {
    expect(requestOf(`page=${text}`).page).toBe(page);
  });

  it.each([
    ["0", "zero"],
    ["01", "a leading zero"],
    ["-1", "a negative number"],
    ["+1", "a plus sign"],
    ["1.5", "a fraction"],
    ["1e3", "an exponent"],
    ["abc", "text"],
    ["%202", "a leading space"],
    [
      String(MAX_STAFF_AUDIT_PAGE + 1),
      "one past the last page the port counts",
    ],
    ["99999999999999999999999", "a number past the safe integers"],
  ])("refuses page %s (%s) as a page number", (text) => {
    expect(issuesOf(`page=${text}`)).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
    ]);
  });

  it("reads the first of a member sent twice", () => {
    expect(requestOf("page=3&page=4").page).toBe(3);
  });
});

describe("the action", () => {
  it.each([
    "kitchen-opened",
    "note-added",
    "status-changed",
    "kitchen-unhidden",
    "kitchens-listed",
  ])("accepts %s", (action) => {
    expect(requestOf(`action=${action}`).action).toBe(action);
  });

  it.each([
    "Kitchen-Opened",
    "KITCHEN-OPENED",
    "kitchen-opened%20",
    "future-action",
    "kitchen_opened",
    "__proto__",
    "constructor",
  ])("refuses %s as an unknown value", (action) => {
    expect(issuesOf(`action=${action}`)).toEqual([
      { field: "action", code: "UNKNOWN_VALUE" },
    ]);
  });
});

describe("the actor", () => {
  it("accepts an account id's shape and nothing it names is looked up", () => {
    expect(requestOf(`actor=${AN_ACCOUNT_ID}`).actorAccountId).toBe(
      AN_ACCOUNT_ID,
    );
  });

  it.each([
    ["twenty characters", AN_ACCOUNT_ID.slice(1)],
    ["twenty-two characters", `${AN_ACCOUNT_ID}x`],
    ["a full stop in it", `${AN_ACCOUNT_ID.slice(0, 20)}.`],
    ["an e-mail address", "operator%40example.test"],
    ["a space in it", `${AN_ACCOUNT_ID.slice(0, 20)}%20`],
    ["a quote in it", `${AN_ACCOUNT_ID.slice(0, 20)}%27`],
  ])("refuses %s", (_title, actor) => {
    expect(issuesOf(`actor=${actor}`)).toEqual([
      { field: "actor", code: "NOT_AN_ACCOUNT_ID" },
    ]);
  });
});

describe("a day", () => {
  it.each([
    ["2026-1-9", "no zero padding"],
    ["19.10.2026", "the day written for the screen"],
    ["2026/10/19", "slashes"],
    ["2026-10-19T00%3A00%3A00Z", "an instant"],
    ["2026-10-19%20", "a trailing space"],
    ["20261019", "no separators"],
    ["+2026-10-19", "a sign"],
    ["abcd-ef-gh", "letters"],
    ["2026-02-30", "a February 30"],
    ["2026-02-29", "a February 29 in a common year"],
    ["2026-04-31", "an April 31"],
    ["2026-13-01", "a month 13"],
    ["2026-00-10", "a month 0"],
    ["2026-10-00", "a day 0"],
    ["2026-10-32", "a day 32"],
  ])("refuses %s (%s) in from and in to", (day) => {
    expect(issuesOf(`from=${day}`)).toEqual([
      { field: "from", code: "NOT_A_DATE" },
    ]);
    expect(issuesOf(`to=${day}`)).toEqual([
      { field: "to", code: "NOT_A_DATE" },
    ]);
  });

  it.each([
    "1999-12-31",
    "1970-01-01",
    "0099-06-15",
    "0000-01-01",
    `${String(LATEST_AUDIT_FILTER_YEAR + 1)}-01-01`,
    "9999-12-31",
  ])("refuses %s as outside the days the log can hold", (day) => {
    expect(issuesOf(`from=${day}`)).toEqual([
      { field: "from", code: "DATE_OUT_OF_RANGE" },
    ]);
  });

  it("accepts a 29 February of a leap year", () => {
    expect(requestOf("from=2028-02-29").occurredFrom).toEqual(
      new Date("2028-02-28T22:00:00.000Z"),
    );
  });

  it("accepts the first and the last day, with bounds the port reads", () => {
    const first = requestOf(`from=${String(EARLIEST_AUDIT_FILTER_YEAR)}-01-01`);
    const last = requestOf(`to=${String(LATEST_AUDIT_FILTER_YEAR)}-12-31`);

    expect(first.occurredFrom?.getUTCFullYear()).toBe(
      EARLIEST_AUDIT_FILTER_YEAR - 1,
    );
    expect(last.occurredBefore?.toISOString()).toBe("9998-12-31T22:00:00.000Z");
    expect(last.occurredBefore?.getTime()).toBeLessThanOrEqual(
      Date.parse("9999-12-31T23:59:59.999Z"),
    );
  });
});

describe("the window of days", () => {
  // The Chisinau day is [its local midnight, the next local midnight): UTC+2 in winter, UTC+3 in summer.
  it.each([
    [
      "an ordinary summer day",
      "2026-10-19",
      "2026-10-18T21:00:00.000Z",
      "2026-10-19T21:00:00.000Z",
    ],
    [
      "an ordinary winter day",
      "2026-01-15",
      "2026-01-14T22:00:00.000Z",
      "2026-01-15T22:00:00.000Z",
    ],
    [
      "the day clocks go forward, 23 hours",
      "2026-03-29",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
    ],
    [
      "the day clocks go back, 25 hours",
      "2026-10-25",
      "2026-10-24T21:00:00.000Z",
      "2026-10-25T22:00:00.000Z",
    ],
    [
      "the day after clocks go back",
      "2026-10-26",
      "2026-10-25T22:00:00.000Z",
      "2026-10-26T22:00:00.000Z",
    ],
    [
      "the day before clocks go forward",
      "2026-03-28",
      "2026-03-27T22:00:00.000Z",
      "2026-03-28T22:00:00.000Z",
    ],
    [
      "a New Year's Day",
      "2027-01-01",
      "2026-12-31T22:00:00.000Z",
      "2027-01-01T22:00:00.000Z",
    ],
  ])(
    "turns %s, %s, into the half-open window from its local midnight to the next",
    (_title, day, startsAt, endsAt) => {
      const request = requestOf(`from=${day}&to=${day}`);

      expect(request.occurredFrom).toEqual(new Date(startsAt));
      expect(request.occurredBefore).toEqual(new Date(endsAt));
    },
  );

  it("makes `to` inclusive: the window ends at the start of the day after it, not at the start of it", () => {
    const request = requestOf("from=2026-10-01&to=2026-10-03");

    expect(request.occurredFrom).toEqual(new Date("2026-09-30T21:00:00.000Z"));
    expect(request.occurredBefore).toEqual(
      new Date("2026-10-03T21:00:00.000Z"),
    );
  });

  it("ends a window that crosses the 25-hour day 25 hours after that day began, not 24", () => {
    const request = requestOf("from=2026-10-25&to=2026-10-25");

    const lasted =
      (request.occurredBefore?.getTime() ?? 0) -
      (request.occurredFrom?.getTime() ?? 0);
    expect(lasted).toBe(25 * HOUR_MS);
  });

  it("ends a window over the 23-hour day 23 hours after that day began, not 24", () => {
    const request = requestOf("from=2026-03-29&to=2026-03-29");

    const lasted =
      (request.occurredBefore?.getTime() ?? 0) -
      (request.occurredFrom?.getTime() ?? 0);
    expect(lasted).toBe(23 * HOUR_MS);
  });

  it("leaves the other end open when only one day is named", () => {
    expect(requestOf("from=2026-10-19")).toMatchObject({
      occurredFrom: new Date("2026-10-18T21:00:00.000Z"),
      occurredBefore: null,
    });
    expect(requestOf("to=2026-10-19")).toMatchObject({
      occurredFrom: null,
      occurredBefore: new Date("2026-10-19T21:00:00.000Z"),
    });
  });

  it("accepts the same day for both ends and refuses a `to` before its `from`", () => {
    expect(read("from=2026-10-19&to=2026-10-19").ok).toBe(true);
    expect(issuesOf("from=2026-10-20&to=2026-10-19")).toEqual([
      { field: "range", code: "RANGE_INVERTED" },
    ]);
  });

  it("refuses an inverted pair across a clock change, down to the single day", () => {
    expect(issuesOf("from=2026-03-30&to=2026-03-29")).toEqual([
      { field: "range", code: "RANGE_INVERTED" },
    ]);
    expect(read("from=2026-03-29&to=2026-03-30").ok).toBe(true);
  });

  it("names no range problem when a day itself is wrong", () => {
    expect(issuesOf("from=2026-02-30&to=2026-01-01")).toEqual([
      { field: "from", code: "NOT_A_DATE" },
    ]);
  });

  it("holds for every day of 2026 and 2027: a window is 23, 24 or 25 hours, and the next day begins where it ends", () => {
    const hoursOfEveryDay: number[] = [];
    let previousEnd: Date | null = null;
    for (let dayOfSweep = 0; dayOfSweep < 730; dayOfSweep += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + dayOfSweep))
        .toISOString()
        .slice(0, 10);
      const { occurredFrom, occurredBefore } = requestOf(
        `from=${date}&to=${date}`,
      );
      if (occurredFrom === null || occurredBefore === null)
        throw new Error("no window");
      if (previousEnd !== null) expect(occurredFrom).toEqual(previousEnd);
      previousEnd = occurredBefore;
      hoursOfEveryDay.push(
        (occurredBefore.getTime() - occurredFrom.getTime()) / HOUR_MS,
      );
    }

    expect(hoursOfEveryDay.filter((hours) => hours === 23)).toHaveLength(2);
    expect(hoursOfEveryDay.filter((hours) => hours === 25)).toHaveLength(2);
    expect(hoursOfEveryDay.filter((hours) => hours === 24)).toHaveLength(726);
  });
});

describe("every wrong member is reported, and no value is repeated", () => {
  it("reports each wrong member once, in the order page, action, actor, from, to", () => {
    const issues = issuesOf("to=x&from=y&actor=z&action=w&page=0");

    expect(issues).toEqual([
      { field: "page", code: "NOT_A_PAGE_NUMBER" },
      { field: "action", code: "UNKNOWN_VALUE" },
      { field: "actor", code: "NOT_AN_ACCOUNT_ID" },
      { field: "from", code: "NOT_A_DATE" },
      { field: "to", code: "NOT_A_DATE" },
    ]);
  });

  it("carries a field and a code and nothing else", () => {
    const [issue] = issuesOf("actor=Zorila-Quasar-9917-no-one-else-types-it");

    expect(Object.keys(issue ?? {}).sort()).toEqual(["code", "field"]);
    expect(JSON.stringify(issue)).not.toContain("Zorila");
  });
});
