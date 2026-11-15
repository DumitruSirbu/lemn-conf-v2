import type { KitchenVersions } from "./kitchen-version-rows";
import type {
  StaffEstimateEmptyWire,
  StaffEstimateRefusedWire,
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
  StaffKitchenWire,
} from "./staff-kitchens-wire-contract";

// What the price card of a sent kitchen says (ADR 0185 decision 5), decided from the two exact totals and never from
// the figures a surface prints: both figures round up to the thousand, so totals up to 990 MDL apart print alike.
// Pure: the component turns the answer into words.

/** What is known about the two copies of the kitchen, which is what tells why the price now differs. */
export type CopiesRelation =
  /** Both copies are readable and differ: the client edited after sending. */
  | "changed"
  /** Both copies are readable and are the same kitchen: only the book or a rule can have moved the price. */
  | "unchanged"
  /** This build cannot read one of the copies, so it cannot say whether the client edited. */
  | "unknown";

export type CurrentEstimateWire =
  | StaffEstimateWire
  | StaffEstimateRefusedWire
  | StaffEstimateEmptyWire;

export type PriceCardModel =
  | {
      /** Both totals exist, in one currency, and are equal to the minor unit. */
      readonly kind: "same";
      readonly total: StaffEstimateWire;
    }
  | {
      /** Both totals exist, in one currency, and differ. */
      readonly kind: "different";
      readonly sent: StaffEstimateWire;
      readonly current: StaffEstimateWire;
      /** `current - sent`, exact, never zero. */
      readonly differenceMinor: number;
      readonly noteCause: CopiesRelation;
    }
  | {
      /** A total is missing, refused or empty, or the currencies differ: each row keeps its own sentence. */
      readonly kind: "not-comparable";
      readonly sent: StaffEstimateWire | null;
      readonly current: CurrentEstimateWire;
    };

/** The relation of the copies, from the one test of whether they are the same kitchen (`versionsOf`) and whether each
 *  could be read at all: a copy this build cannot read is not evidence that the kitchen is unchanged. */
export function copiesRelationOf(copies: {
  readonly versions: KitchenVersions | undefined;
  readonly asSent: StaffKitchenWire["kitchen"]["asSent"];
  readonly design: StaffKitchenWire["kitchen"]["design"];
}): CopiesRelation {
  if (copies.versions !== undefined) return "changed";
  const isEachCopyReadable = copies.asSent !== null && copies.design !== null;
  return isEachCopyReadable ? "unchanged" : "unknown";
}

export function describePriceCard(
  estimates: StaffKitchenEstimatesWire,
  copies: CopiesRelation,
): PriceCardModel {
  const { sentEstimate: sent, currentEstimate: current } = estimates;
  if (
    sent === null ||
    !isPriced(current) ||
    !isSameCurrency(sent.currency, current.currency)
  ) {
    return { kind: "not-comparable", sent, current };
  }
  if (sent.totalMinor === current.totalMinor) {
    return { kind: "same", total: sent };
  }
  return {
    kind: "different",
    sent,
    current,
    differenceMinor: current.totalMinor - sent.totalMinor,
    noteCause: copies,
  };
}

function isPriced(
  estimate: CurrentEstimateWire,
): estimate is StaffEstimateWire {
  return !("refused" in estimate) && !("empty" in estimate);
}

/** Typed as strings: the price book names one currency today, and the comparison must stay true on the day it names two. */
function isSameCurrency(sent: string, current: string): boolean {
  return sent === current;
}
