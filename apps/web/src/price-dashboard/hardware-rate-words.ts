import type { HardwareRateField } from "@lemnaria/configurator-domain";

/** The leaves that name one rate of a hardware class on every screen that draws it. */
interface RateWords {
  /** The label of its field. */
  readonly label: string;
  /** What the amount is charged per. */
  readonly unit: string;
  /** The title of its column in the list. */
  readonly column: string;
  /** What the rate is charged for, where the frame says so. */
  readonly hint: string | undefined;
}

export const HARDWARE_RATE_WORDS = {
  perHingeMinor: {
    label: "priceDashboard.hardware.priceHinge",
    unit: "priceDashboard.units.perHinge",
    column: "priceDashboard.hardware.columnHinge",
    hint: undefined,
  },
  perDrawerMinor: {
    label: "priceDashboard.hardware.priceSlide",
    unit: "priceDashboard.units.perSlidePair",
    column: "priceDashboard.hardware.columnSlide",
    hint: "priceDashboard.hardware.priceSlideHint",
  },
  perPushToOpenMinor: {
    label: "priceDashboard.hardware.pricePush",
    unit: "priceDashboard.units.perMechanism",
    column: "priceDashboard.hardware.columnPush",
    hint: undefined,
  },
  perLiftMinor: {
    label: "priceDashboard.hardware.priceLift",
    unit: "priceDashboard.units.perMechanism",
    column: "priceDashboard.hardware.columnLift",
    hint: "priceDashboard.hardware.priceLiftHint",
  },
} as const satisfies Record<HardwareRateField, RateWords>;
