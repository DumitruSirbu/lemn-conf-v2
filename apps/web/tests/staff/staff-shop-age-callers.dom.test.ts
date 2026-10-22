// @vitest-environment happy-dom
//
// The age told beside a staff date counts its days on the shop's wall (Europe/Chisinau), the clock the date is written on,
// at the three places beside the audit rows that tell one: the kitchens list (table and cards), the line under a kitchen's
// name, and the notes. Each case runs with the browser set to a zone a day or more away from the shop, so an age counted
// on the browser's calendar reads a different number of days from the one the date beside it implies.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type { StaffKitchenCopy } from "@/i18n/content";
import { subLineOf } from "@/staff/staff-kitchen-facts";
import { KitchenCards, KitchensTable } from "@/staff/staff-kitchens-rows";
import type {
  StaffKitchenNoteWire,
  StaffKitchenWire,
  StaffListedKitchenWire,
} from "@/staff/staff-kitchens-wire-contract";
import { StaffNotes } from "@/staff/staff-notes";
import type { StaffKitchensListing } from "@/staff/use-staff-kitchens";

import { mountInCatalogue, requireIn } from "../support/render-with-intl";
import { wireKitchen } from "../support/staff-kitchen-wire";
import { wireDraft } from "../support/staff-kitchens-wire";

const LOCALE = "ro";
const SHOP_ZONE = "Europe/Chisinau";
const MS_PER_DAY = 86_400_000;
const BROWSER_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
] as const;

/** (label, the event, the moment the page is read): a day or more apart, straddling midnight on the shop's wall in ways
 *  the browser's calendar does not share. */
const PAIRS = [
  [
    "two shop days after a late evening",
    "2026-10-19T23:30:00.000Z",
    "2026-10-21T01:00:00.000Z",
  ],
  [
    "one shop day after a late evening",
    "2026-10-20T20:00:00.000Z",
    "2026-10-21T21:30:00.000Z",
  ],
  [
    "three shop days across the clocks going back",
    "2026-10-23T20:30:00.000Z",
    "2026-10-26T20:30:00.000Z",
  ],
] as const;

const zoneBeforeTests = process.env.TZ;
let unmount: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.useRealTimers();
  if (zoneBeforeTests === undefined) delete process.env.TZ;
  else process.env.TZ = zoneBeforeTests;
});

/** The age the shop's wall implies, counted here from the shop's own calendar and not from the code under test. */
function expectedAge(event: string, now: string): string {
  const days =
    shopDayNumber(Date.parse(now)) - shopDayNumber(Date.parse(event));
  return formatRelativeAge(LOCALE, { value: -days, unit: "day" });
}

function shopDayNumber(instantMs: number): number {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(instantMs))
    .split("-")
    .map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function browserDaysApart(event: string, now: string): number {
  const dayNumberInBrowser = (instant: string): number => {
    const moment = new Date(instant);
    return Math.round(
      Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate()) /
        MS_PER_DAY,
    );
  };
  return dayNumberInBrowser(now) - dayNumberInBrowser(event);
}

function shopDaysApart(event: string, now: string): number {
  return shopDayNumber(Date.parse(now)) - shopDayNumber(Date.parse(event));
}

function listingOf(updatedAt: string, now: string): StaffKitchensListing {
  return {
    search: null,
    segment: "all",
    status: null,
    total: 1,
    pageSize: 20,
    firstPage: 1,
    lastPage: 1,
    rows: [wireDraft(1, { updatedAt })] as unknown as StaffListedKitchenWire[],
    readAtMs: Date.parse(now),
    focusRequest: undefined,
  };
}

function mountListing(
  surface: typeof KitchensTable | typeof KitchenCards,
  listing: StaffKitchensListing,
): HTMLElement {
  const mounted = mountInCatalogue(
    createElement(surface, { locale: LOCALE, listing }),
    LOCALE,
  );
  unmount = mounted.unmount;
  return mounted.container;
}

describe.each(BROWSER_ZONES)("in a browser whose clock is %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  it("has a pair the browser's calendar counts differently from the shop's, or the cases below prove nothing", () => {
    const tellsCalendarsApart = PAIRS.some(
      ([, event, now]) =>
        shopDaysApart(event, now) !== browserDaysApart(event, now),
    );

    expect(tellsCalendarsApart).toBe(true);
  });

  describe.each([
    [
      "the table",
      KitchensTable,
      (row: HTMLElement) => requireIn(row, "time").textContent,
    ],
    ["the cards", KitchenCards, (row: HTMLElement) => row.textContent],
  ] as const)("the kitchens list as %s", (_name, surface, ageTold) => {
    it.each(PAIRS)(
      "ages a row by the shop's wall for %s",
      (_label, event, now) => {
        vi.setSystemTime(new Date(now));

        const container = mountListing(surface, listingOf(event, now));

        expect(ageTold(container)).toContain(expectedAge(event, now));
      },
    );
  });

  describe("the line under a draft's name", () => {
    it.each(PAIRS)(
      "ages the draft by the shop's wall for %s",
      (_label, event, now) => {
        const draft = wireKitchen({
          kitchen: { isSent: false, sentAt: null, updatedAt: event },
          client: null,
        }) as unknown as StaffKitchenWire;
        const copy = {
          sub: { draftNoAccount: (when: string) => when },
        } as unknown as StaffKitchenCopy;

        const line = subLineOf({
          copy,
          wire: draft,
          locale: LOCALE,
          readAtMs: Date.parse(now),
        });

        expect(line).toBe(expectedAge(event, now));
      },
    );
  });

  describe("a note", () => {
    it.each(PAIRS)(
      "ages a note by the shop's wall for %s",
      (_label, event, now) => {
        vi.setSystemTime(new Date(now));
        const note: StaffKitchenNoteWire = {
          id: "note-1",
          text: "Clientul vrea fronturi din nuc.",
          createdAt: event,
          author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
        };

        const mounted = mountInCatalogue(
          createElement(StaffNotes, {
            locale: LOCALE,
            designId: "k000000000000000000001",
            notes: [note],
            isTruncated: false,
            editing: { edit: vi.fn(), refresh: vi.fn() },
          }),
          LOCALE,
        );
        unmount = mounted.unmount;

        expect(requireIn(mounted.container, "li time").textContent).toContain(
          expectedAge(event, now),
        );
      },
    );
  });
});
