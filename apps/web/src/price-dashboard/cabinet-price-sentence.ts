import {
  exactAmountOfTerms,
  PRICE_STEP_MM,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";

import type { CabinetDetailFacts } from "./cabinet-detail-facts";
import type { FieldRole, FieldState } from "./cabinet-detail-fields";
import { formatLei } from "./format-lei";

// The sentence under the fields restates the typed amounts in words. Its one product, the door step for more than one
// leaf, is the pricing module's checked arithmetic.

export interface PriceSentenceInput {
  readonly facts: CabinetDetailFacts;
  readonly states: readonly FieldState[];
  /** The field whose typed amount the prices refuse: the sentence says what the draft holds there, never that amount. */
  readonly refusedFieldKey: string | undefined;
}

export function priceSentence(
  translate: ContentTranslator,
  { facts, states, refusedFieldKey }: PriceSentenceInput,
): string {
  const input = { facts, states: statesAsHeld(states, refusedFieldKey) };
  const money = (minor: number) =>
    formatLei(minor, translate("priceDashboard.units.currency"));
  const amountOf = amountReader(input.states, money);
  const sizes = input.states.filter(({ field }) => field.role === "size");
  if (sizes.length > 0) return fixedSizesSentence(translate, sizes, money);
  const anchor = input.states.find(({ field }) => field.role === "anchor");
  if (anchor === undefined) return "";
  return [
    translate("priceDashboard.cabinet.summaryBase", {
      widthMm: anchor.field.quotedAtMm ?? 0,
      amount: money(anchor.effectiveMinor),
    }),
    translate("priceDashboard.cabinet.summarySteps", {
      stepMm: PRICE_STEP_MM,
      plusAmount: amountOf("plus"),
      minusAmount: amountOf("minus"),
    }),
    doorClause(translate, input, money),
    heightClause(translate, input.states, amountOf),
    translate("priceDashboard.cabinet.summaryRounding"),
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function statesAsHeld(
  states: readonly FieldState[],
  refusedFieldKey: string | undefined,
): readonly FieldState[] {
  return states.map((state) =>
    state.field.key === refusedFieldKey
      ? { ...state, effectiveMinor: state.field.pendingMinor }
      : state,
  );
}

function amountReader(
  states: readonly FieldState[],
  money: (minor: number) => string,
): (role: FieldRole) => string {
  return (role) => {
    const held = states.find(({ field }) => field.role === role);
    return held === undefined ? "" : money(held.effectiveMinor);
  };
}

function fixedSizesSentence(
  translate: ContentTranslator,
  sizes: readonly FieldState[],
  money: (minor: number) => string,
): string {
  const [only, ...others] = sizes;
  if (only !== undefined && others.length === 0) {
    return translate("priceDashboard.cabinet.summaryBase", {
      widthMm: only.field.quotedAtMm ?? 0,
      amount: money(only.effectiveMinor),
    });
  }
  const listed = sizes
    .map((size) =>
      translate("priceDashboard.cabinet.summaryFixedSize", {
        widthMm: size.field.quotedAtMm ?? 0,
        amount: money(size.effectiveMinor),
      }),
    )
    .reduce((head, tail) =>
      translate("priceDashboard.cabinet.summaryFixedJoined", { head, tail }),
    );
  return translate("priceDashboard.cabinet.summaryFixedEnd", { sizes: listed });
}

/** Said only where the anchor carries the more leaves: no sentence is drawn for a step above the anchor. */
function doorClause(
  translate: ContentTranslator,
  input: {
    readonly facts: CabinetDetailFacts;
    readonly states: readonly FieldState[];
  },
  money: (minor: number) => string,
): string {
  const { doorStep } = input.facts;
  const door = input.states.find(({ field }) => field.role === "door");
  if (doorStep === undefined || door === undefined || !doorStep.isBelowAnchor) {
    return "";
  }
  const amountMinor = exactAmountOfTerms([
    {
      coefficientMinor: door.effectiveMinor,
      count: doorStep.leaves,
      field: "perExtraDoorLeafMinor",
    },
  ]);
  return translate("priceDashboard.cabinet.summaryDoor", {
    atMm: doorStep.atMm,
    doorCount: doorStep.leaves,
    amount: money(amountMinor),
  });
}

function heightClause(
  translate: ContentTranslator,
  states: readonly FieldState[],
  amountOf: (role: FieldRole) => string,
): string {
  const height = states.find(({ field }) => field.role === "height");
  if (height === undefined) return "";
  return translate("priceDashboard.cabinet.summaryHeight", {
    stepMm: PRICE_STEP_MM,
    referenceMm: height.field.quotedAtMm ?? 0,
    amount: amountOf("height"),
  });
}
