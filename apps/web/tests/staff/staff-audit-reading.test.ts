// What the audit page believes of what it is told: the body of `GET /api/staff/audit`, field by field, and the days a
// person may ask for. Strict about the shape of a page and of every row, lenient about what a row's action means: a row
// whose action or detail this build refuses is a row told as unrecognised, never a dropped row and never a failed page.
import { describe, expect, it } from "vitest";

import {
  EARLIEST_AUDIT_FILTER_YEAR,
  LATEST_AUDIT_FILTER_YEAR,
} from "@/lib/server/staff/staff-audit-query";
import {
  EARLIEST_FILTER_YEAR,
  LATEST_FILTER_YEAR,
  problemOfDays,
} from "@/staff/staff-audit-days";
import { staffAuditPageFrom } from "@/staff/staff-audit-wire-reading";

import {
  auditAccountIdOf,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";

function eventsOf(body: unknown): readonly { entry: unknown }[] | undefined {
  return staffAuditPageFrom(body)?.events;
}

describe("the days a person may ask for", () => {
  it("are the years the server keeps, so a request the server would refuse is not made", () => {
    expect(EARLIEST_FILTER_YEAR).toBe(EARLIEST_AUDIT_FILTER_YEAR);
    expect(LATEST_FILTER_YEAR).toBe(LATEST_AUDIT_FILTER_YEAR);
  });

  it.each([
    ["no day at all", { from: "", to: "" }],
    ["one day alone", { from: "2026-10-01", to: "" }],
    ["a single day as a range", { from: "2026-10-01", to: "2026-10-01" }],
    ["the first day of the first year", { from: "2000-01-01", to: "" }],
    ["the last day of the last year", { from: "", to: "9998-12-31" }],
    ["a leap day", { from: "2028-02-29", to: "2028-02-29" }],
  ])("accept %s", (_label, days) => {
    expect(problemOfDays(days)).toBeUndefined();
  });

  it.each([
    ["a year before the first", "1999-12-31"],
    ["a year after the last", "9999-01-01"],
    ["a day the calendar does not hold", "2026-02-30"],
    ["a leap day of a year that has none", "2027-02-29"],
    ["a month that does not exist", "2026-13-01"],
    ["a year of more than four digits", "275760-09-13"],
    ["a year of fewer digits", "26-10-01"],
    ["a sign", "+2026-10-01"],
    ["a time after the day", "2026-10-01T00:00"],
    ["text", "ieri"],
  ])("name the field that holds %s", (_label, day) => {
    expect(problemOfDays({ from: day, to: "" })).toEqual({
      kind: "invalid-day",
      field: "from",
    });
    expect(problemOfDays({ from: "", to: day })).toEqual({
      kind: "invalid-day",
      field: "to",
    });
  });

  it("refuse a range that ends the day before it begins, and only that range", () => {
    expect(problemOfDays({ from: "2026-10-02", to: "2026-10-01" })).toEqual({
      kind: "inverted",
    });
    expect(
      problemOfDays({ from: "2026-10-01", to: "2026-10-02" }),
    ).toBeUndefined();
  });

  it("tell a day that cannot be asked for before an inverted range", () => {
    expect(problemOfDays({ from: "2026-10-02", to: "1999-01-01" })).toEqual({
      kind: "invalid-day",
      field: "to",
    });
  });
});

describe("the page the body holds", () => {
  it("reads a page of rows as they were written", () => {
    const page = staffAuditPageFrom(
      wireAuditPage([wireAuditEvent(1), wireAuditEvent(2)], { total: 1204 }),
    );

    expect(page?.total).toBe(1204);
    expect(page?.pageSize).toBe(25);
    expect(page?.events.map(({ id }) => id)).toHaveLength(2);
    expect(page?.events[0]?.entry).toEqual({
      kind: "recognised",
      action: "kitchen-opened",
      detail: null,
    });
  });

  it.each([
    ["nothing", undefined],
    ["a list", []],
    ["no events", { total: 0, page: 1, pageSize: 25 }],
    [
      "events that are not a list",
      { total: 0, page: 1, pageSize: 25, events: {} },
    ],
    ["a negative total", wireAuditPage([], { total: -1 })],
    ["a fractional total", wireAuditPage([], { total: 1.5 })],
    ["a total that is text", wireAuditPage([], { total: "1" })],
    ["page nought", wireAuditPage([], { page: 0 })],
    ["a page size of nought", wireAuditPage([], { pageSize: 0 })],
    [
      "more rows than the page size",
      wireAuditPage([wireAuditEvent(1), wireAuditEvent(2)], { pageSize: 1 }),
    ],
  ])("is nothing for %s", (_label, body) => {
    expect(staffAuditPageFrom(body)).toBeUndefined();
  });

  it.each([
    ["an id that is not text", { id: 5 }],
    ["an empty id", { id: "" }],
    [
      "an instant with an offset",
      { occurredAt: "2026-10-19T11:32:00.000+03:00" },
    ],
    [
      "an instant that is not an instant",
      { occurredAt: "2026-02-30T00:00:00.000Z" },
    ],
    ["no entry", { entry: undefined }],
    [
      "an entry of a kind it does not know",
      { entry: { kind: "guess", action: "x" } },
    ],
    [
      "an entry whose action is not text",
      { entry: { kind: "unrecognised", action: 7 } },
    ],
    ["no actor", { actor: null }],
    [
      "an actor whose id has not the shape of an account's",
      { actor: { id: "short", email: "a@b.c" } },
    ],
    [
      "an actor whose address is a number",
      { actor: { id: auditAccountIdOf(1), email: 5 } },
    ],
    ["a subject whose address is a number", { subject: { email: 5 } }],
    ["a kitchen with no id", { kitchen: { id: "", name: "x" } }],
    [
      "a kitchen whose name is a number",
      { kitchen: { id: "k".repeat(21), name: 5 } },
    ],
  ])("is nothing when one row has %s", (_label, overrides) => {
    expect(
      staffAuditPageFrom(wireAuditPage([wireAuditEvent(1, overrides)])),
    ).toBeUndefined();
  });

  it("accepts an actor whose account is gone, a subject with no address, and a kitchen with no name", () => {
    const page = staffAuditPageFrom(
      wireAuditPage([
        wireAuditEvent(1, {
          actor: { id: auditAccountIdOf(1), email: null },
          subject: { email: null },
          kitchen: { id: "k".repeat(21), name: null },
        }),
      ]),
    );

    expect(page?.events[0]?.actor.email).toBeNull();
    expect(page?.events[0]?.subject).toEqual({ email: null });
    expect(page?.events[0]?.kitchen?.name).toBeNull();
  });

  it("reads only the body's own members, so an inherited name is not a member", () => {
    const inherited = Object.create({
      total: 1,
      page: 1,
      pageSize: 25,
      events: [],
    }) as unknown;

    expect(staffAuditPageFrom(inherited)).toBeUndefined();
  });

  it("draws a row named twice in one page once", () => {
    expect(
      eventsOf(wireAuditPage([wireAuditEvent(1), wireAuditEvent(1)])),
    ).toHaveLength(1);
  });
});

describe("what a row's action is believed to be", () => {
  it.each([
    [
      "an action the domain does not list",
      { kind: "recognised", action: "constructor", detail: null },
    ],
    [
      "a prototype name",
      { kind: "recognised", action: "__proto__", detail: null },
    ],
    [
      "a listed action with a detail it never carries",
      { kind: "recognised", action: "kitchen-opened", detail: { page: 1 } },
    ],
    [
      "a status change with a status it does not know",
      {
        kind: "recognised",
        action: "status-changed",
        detail: { from: "new", to: "bogus" },
      },
    ],
    [
      "a status change with no detail",
      { kind: "recognised", action: "status-changed", detail: null },
    ],
    [
      "a listed page with a row count above the page",
      {
        kind: "recognised",
        action: "kitchens-listed",
        detail: {
          segment: "sent",
          status: null,
          page: 1,
          rowCount: 21,
          hasSearch: false,
        },
      },
    ],
    [
      "a viewed page with a member too many",
      {
        kind: "recognised",
        action: "audit-viewed",
        detail: {
          page: 1,
          rowCount: 1,
          hasActorFilter: false,
          hasActionFilter: false,
          hasDateFilter: false,
          actorId: "x",
        },
      },
    ],
  ])(
    "is unrecognised, with the code as text, for %s that the body calls recognised",
    (_label, entry) => {
      const [event] =
        staffAuditPageFrom(wireAuditPage([wireAuditEvent(1, { entry })]))
          ?.events ?? [];

      expect(event?.entry).toEqual({
        kind: "unrecognised",
        action: entry.action,
      });
    },
  );

  it("keeps the detail of a recognised action as the domain reads it, and nothing more", () => {
    const [event] =
      staffAuditPageFrom(
        wireAuditPage([
          wireAuditEvent(1, {
            entry: {
              kind: "recognised",
              action: "status-changed",
              detail: { from: "new", to: "closed" },
            },
          }),
        ]),
      )?.events ?? [];

    expect(event?.entry).toEqual({
      kind: "recognised",
      action: "status-changed",
      detail: { from: "new", to: "closed" },
    });
  });

  it("keeps an unrecognised row as unrecognised, with its action and nothing of a detail it carries", () => {
    const [event] =
      staffAuditPageFrom(
        wireAuditPage([
          wireAuditEvent(1, {
            entry: {
              kind: "unrecognised",
              action: "toString",
              detail: { x: 1 },
            },
          }),
        ]),
      )?.events ?? [];

    expect(event?.entry).toEqual({ kind: "unrecognised", action: "toString" });
  });
});
