// @vitest-environment happy-dom
//
// Adversarial QA of the cabinet page's hardware readout (ADR 0177 A-20): the lift is said where a cabinet
// carries one and nowhere else, the draft's lift rate alone moves the readout, and the sentence is the one the
// catalogue's words make from counts and an amount stated here from the book's own rates.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  HOOD_RULE,
  mountDetail,
  WALL_RULE,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const WALL_LIFT_RULE = "cabinet.wall-lift";
const DEFAULT_WIDTH_MM = 600;
const HINGES_AT_THE_DEFAULT_WIDTH = 3;
const TEN_LEI_MINOR = 1_000;

const STANDARD = SAMPLE_PRICE_BOOK.hardware.tiers.find(
  ({ tierId }) => tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
);
const NOT_THE_DEFAULT = SAMPLE_PRICE_BOOK.hardware.tiers.find(
  ({ tierId }) => tierId !== SAMPLE_PRICE_BOOK.hardware.defaultTierId,
);

const lei = (minor: number) => formatLei(minor, "lei");
const r10 = (exactMinor: number) =>
  Math.floor((exactMinor + TEN_LEI_MINOR / 2) / TEN_LEI_MINOR) * TEN_LEI_MINOR;

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

function liftRateChange(tierId: string, value: number): DraftChange {
  return {
    address: { kind: "hardware", tierId, field: "perLiftMinor" },
    value,
  } as DraftChange;
}

function hardwareSentence(
  key: "hardwareLine" | "hardwareLineActive" | "hardwareLinePending",
  amountMinor: number,
): string {
  const quantities = roCopy("priceDashboard.cabinet.hardwareJoined", {
    head: roCopy("priceDashboard.cabinet.hingeCount", {
      count: HINGES_AT_THE_DEFAULT_WIDTH,
    }),
    tail: roCopy("priceDashboard.cabinet.liftCount", { count: 1 }),
  });
  return roCopy(`priceDashboard.cabinet.${key}`, {
    widthMm: DEFAULT_WIDTH_MM,
    quantities,
    amount: lei(amountMinor),
    className: "Standard",
  });
}

function requireStandard() {
  if (STANDARD === undefined || NOT_THE_DEFAULT === undefined) {
    throw new Error("the sample book has no second hardware class");
  }
  return { standard: STANDARD, other: NOT_THE_DEFAULT };
}

describe("the wall-lift page's hardware readout", () => {
  it("says three hinges plus one lift, and the amount the two rates make, at the default width", async () => {
    const { standard } = requireStandard();
    mounted = await mountDetail(WALL_LIFT_RULE);

    expect(mounted.container.textContent).toContain(
      hardwareSentence(
        "hardwareLine",
        r10(
          HINGES_AT_THE_DEFAULT_WIDTH * standard.perHingeMinor +
            standard.perLiftMinor,
        ),
      ),
    );
  });

  it("is told apart from a readout with no lift: the three-hinge sentence alone is not on the page", async () => {
    const { standard } = requireStandard();
    mounted = await mountDetail(WALL_LIFT_RULE);

    const hingesOnly = roCopy("priceDashboard.cabinet.hardwareLine", {
      widthMm: DEFAULT_WIDTH_MM,
      quantities: roCopy("priceDashboard.cabinet.hingeCount", {
        count: HINGES_AT_THE_DEFAULT_WIDTH,
      }),
      amount: lei(r10(HINGES_AT_THE_DEFAULT_WIDTH * standard.perHingeMinor)),
      className: "Standard",
    });
    expect(mounted.container.textContent).not.toContain(hingesOnly);
  });

  it("shows the active and the pending line when the draft changes only the default class's lift rate", async () => {
    const { standard } = requireStandard();
    const DRAFTED_LIFT_MINOR = standard.perLiftMinor + 40_000;
    mounted = await mountDetail(WALL_LIFT_RULE, {
      page: pageOf([liftRateChange(standard.tierId, DRAFTED_LIFT_MINOR)]),
    });
    const hingesMinor = HINGES_AT_THE_DEFAULT_WIDTH * standard.perHingeMinor;

    expect(mounted.container.textContent).toContain(
      hardwareSentence(
        "hardwareLineActive",
        r10(hingesMinor + standard.perLiftMinor),
      ),
    );
    expect(mounted.container.textContent).toContain(
      hardwareSentence(
        "hardwareLinePending",
        r10(hingesMinor + DRAFTED_LIFT_MINOR),
      ),
    );
  });

  it("shows one line when the drafted lift rate leaves the rounded amount where it was", async () => {
    const { standard } = requireStandard();
    const hingesMinor = HINGES_AT_THE_DEFAULT_WIDTH * standard.perHingeMinor;
    const withinTheSameTenLei = standard.perLiftMinor + 1;
    expect(r10(hingesMinor + withinTheSameTenLei)).toBe(
      r10(hingesMinor + standard.perLiftMinor),
    );
    mounted = await mountDetail(WALL_LIFT_RULE, {
      page: pageOf([liftRateChange(standard.tierId, withinTheSameTenLei)]),
    });

    expect(mounted.container.textContent).toContain(
      hardwareSentence(
        "hardwareLine",
        r10(hingesMinor + standard.perLiftMinor),
      ),
    );
  });

  it("is not moved by a drafted lift rate on a class that is not the default one", async () => {
    const { standard, other } = requireStandard();
    mounted = await mountDetail(WALL_LIFT_RULE, {
      page: pageOf([liftRateChange(other.tierId, other.perLiftMinor + 90_000)]),
    });

    expect(mounted.container.textContent).toContain(
      hardwareSentence(
        "hardwareLine",
        r10(
          HINGES_AT_THE_DEFAULT_WIDTH * standard.perHingeMinor +
            standard.perLiftMinor,
        ),
      ),
    );
  });
});

describe("the lift is said nowhere a cabinet carries none", () => {
  it.each([WALL_RULE, HOOD_RULE])(
    "%s: no lift in the words of its readout",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);

      expect(mounted.container.textContent).not.toContain(
        roCopy("priceDashboard.cabinet.liftCount", { count: 1 }),
      );
    },
  );
});
