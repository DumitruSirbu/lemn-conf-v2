import type {
  BookFieldAddress,
  DraftChange,
} from "@lemnaria/configurator-domain";

import type { CandidateRefusalWire } from "./price-dashboard-wire-contract";
import { itemSubjectOf, type BookPair, type RowSubject } from "./publish-model";

// What a refused publish names, as lines a screen words: the row each reason is about and the closed kind of the reason.
// The reasons are many and mostly developer-level; each line says what the person can act on, and a reason about no row
// the draft names is told in one sentence.

/** How many reasons are told by line; the rest are counted. */
export const MAX_REFUSAL_LINES = 5;

export type RefusalLine =
  | { readonly kind: "change"; readonly subject: RowSubject }
  | {
      readonly kind: "price-not-positive" | "price-too-large";
      readonly subject: RowSubject;
      readonly widthMm: number;
      readonly heightMm: number;
    }
  | { readonly kind: "percent-out-of-range"; readonly subject: RowSubject }
  | { readonly kind: "link"; readonly subject: RowSubject }
  | { readonly kind: "cabinet"; readonly subject: RowSubject }
  | { readonly kind: "unnamed" };

export interface RefusalLines {
  readonly lines: readonly RefusalLine[];
  /** How many reasons are left out of `lines`. */
  readonly hiddenCount: number;
}

export interface RefusalContext {
  /** The active book and the one the draft makes: a row the draft created is named from the second. */
  readonly books: BookPair;
  readonly changes: readonly DraftChange[];
  readonly cabinetNames: Readonly<Record<string, string>>;
}

export function refusalLinesOf(
  refusals: readonly CandidateRefusalWire[],
  context: RefusalContext,
): RefusalLines {
  return {
    lines: refusals
      .slice(0, MAX_REFUSAL_LINES)
      .map((refusal) => lineOf(refusal, context)),
    hiddenCount: Math.max(0, refusals.length - MAX_REFUSAL_LINES),
  };
}

/** The wire is not parsed on this side, so a source this code was not written for is told as a reason naming no row. */
const UNNAMED_LINE: RefusalLine = { kind: "unnamed" };

function lineOf(
  refusal: CandidateRefusalWire,
  context: RefusalContext,
): RefusalLine {
  switch (refusal.source) {
    case "pricing":
      return UNNAMED_LINE;
    case "changes":
      return changeLineOf(refusal.index, context);
    case "catalogue":
      return catalogueLineOf(refusal, context);
    default:
      return UNNAMED_LINE;
  }
}

function changeLineOf(index: number, context: RefusalContext): RefusalLine {
  const change = context.changes[index];
  if (change === undefined) return UNNAMED_LINE;
  return { kind: "change", subject: subjectOfAddress(change.address, context) };
}

function catalogueLineOf(
  refusal: Extract<CandidateRefusalWire, { readonly source: "catalogue" }>,
  context: RefusalContext,
): RefusalLine {
  switch (refusal.code) {
    case "PRICE_NOT_POSITIVE":
    case "PRICE_TOO_LARGE":
      return {
        kind:
          refusal.code === "PRICE_NOT_POSITIVE"
            ? "price-not-positive"
            : "price-too-large",
        subject: cabinetSubjectOf(refusal.buildId, context),
        widthMm: refusal.widthMm,
        heightMm: refusal.heightMm,
      };
    case "PERCENT_OUT_OF_RANGE":
      return {
        kind: "percent-out-of-range",
        subject:
          refusal.item === DEPTH_ITEM
            ? { kind: "depth-rule" }
            : itemSubjectOf(
                { kind: "material", tierId: refusal.item },
                context.books,
              ),
      };
    case "LINK_TARGET_UNKNOWN":
    case "LINK_TARGET_CUSTOMER_SUPPLIED":
      return {
        kind: "link",
        subject: itemSubjectOf(
          { kind: "accessory", accessoryId: refusal.accessoryId },
          context.books,
        ),
      };
    default:
      return {
        kind: "cabinet",
        subject: cabinetSubjectOf(refusal.buildId, context),
      };
  }
}

/** The id the catalogue judgement gives the depth rule where it names a material tier's id otherwise. */
const DEPTH_ITEM = "depth";

function cabinetSubjectOf(
  buildId: string,
  context: RefusalContext,
): RowSubject {
  return { kind: "name", name: context.cabinetNames[buildId] ?? buildId };
}

export function subjectOfAddress(
  address: BookFieldAddress,
  context: RefusalContext,
): RowSubject {
  const { books, cabinetNames } = context;
  switch (address.kind) {
    case "cabinet":
    case "cabinet-size": {
      const rule = [books.after, books.before]
        .flatMap((book) => book.cabinetRules)
        .find((candidate) => candidate.ruleId === address.ruleId);
      return {
        kind: "name",
        name:
          rule === undefined
            ? address.ruleId
            : (cabinetNames[rule.buildId] ?? rule.buildId),
      };
    }
    case "depth-rule":
      return { kind: "depth-rule" };
    case "provisional":
      return { kind: "provisional" };
    case "hardware":
    case "material":
      return itemSubjectOf(
        { kind: address.kind, tierId: address.tierId },
        books,
      );
    case "accessory":
      return itemSubjectOf(
        { kind: "accessory", accessoryId: address.accessoryId },
        books,
      );
    case "hardware-tier-created":
      return itemSubjectOf({ kind: "hardware", tierId: address.tierId }, books);
    case "accessory-created":
      return itemSubjectOf(
        { kind: "accessory", accessoryId: address.accessoryId },
        books,
      );
    case "created-row-text":
    case "item-deleted":
      return itemSubjectOf(address.item, books);
  }
}
