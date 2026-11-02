import {
  applyChanges,
  isAnchoredFormula,
  isSameAddress,
  judgePricesOfRule,
  readEditableFields,
  roundUpToPriceStepMm,
  type AnchoredFormula,
  type AppliedAddress,
  type BookRefusal,
  type CabinetPriceRule,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { CabinetPriceAddress } from "./cabinet-list-model";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";
import {
  plainLeiOf,
  readLeiInputOverHeld,
  type LeiInputReading,
} from "./price-field-input";

// The amounts a cabinet's price is made of, and what typing into them makes. Reading is `readEditableFields`,
// the book is `applyChanges`, a price that would not be one is `judgePricesOfRule`'s; nothing here adds a price up.

export type FieldRole =
  | "anchor"
  | "plus"
  | "minus"
  | "door"
  | "height"
  | "size";

export interface DetailField {
  /** Stable for the life of the screen: the key of what is typed into it. */
  readonly key: string;
  readonly role: FieldRole;
  readonly address: CabinetPriceAddress;
  readonly activeMinor: number;
  /** The amount once the draft is applied: what the field starts from. */
  readonly pendingMinor: number;
  /** What it is quoted at: the anchor width, the height step reference height, or a listed size built width. */
  readonly quotedAtMm: number | undefined;
}

export interface ListedWidth {
  readonly widthMm: number;
  readonly pricedAsWidthMm: number;
}

const ROLE_OF_RULE_FIELD = {
  anchorMinor: "anchor",
  perStepWiderMinor: "plus",
  perStepNarrowerMinor: "minus",
  perExtraDoorLeafMinor: "door",
  perHeightStepMinor: "height",
} as const;

/** The fields of one rule, in the order the book lists them: the anchor, the steps, the door, the height. */
export function priceFieldsOf(
  books: { readonly active: PriceBook; readonly candidate: PriceBook },
  ruleId: string,
  listedWidths: readonly ListedWidth[],
): readonly DetailField[] {
  const active = readEditableFields(books.active);
  const formula = anchoredFormulaOf(ruleIn(books.candidate, ruleId));
  return readEditableFields(books.candidate).flatMap(
    (reading): DetailField[] => {
      const { address, value } = reading;
      if (typeof value !== "number") return [];
      if (address.kind !== "cabinet" && address.kind !== "cabinet-size") {
        return [];
      }
      if (address.ruleId !== ruleId) return [];
      const held = active.find((other) =>
        isSameAddress(other.address, address),
      );
      if (typeof held?.value !== "number") return [];
      const amounts = { activeMinor: held.value, pendingMinor: value };
      if (address.kind === "cabinet-size") {
        return [
          {
            ...amounts,
            address,
            key: `size-${String(address.widthMm)}`,
            role: "size",
            quotedAtMm: builtWidthOfSize(address.widthMm, listedWidths),
          },
        ];
      }
      return [
        {
          ...amounts,
          address,
          key: address.field,
          role: ROLE_OF_RULE_FIELD[address.field],
          quotedAtMm: quotedAtOf(address.field, formula),
        },
      ];
    },
  );
}

function anchoredFormulaOf(
  rule: CabinetPriceRule | undefined,
): AnchoredFormula | undefined {
  const formula = rule?.formula;
  return formula !== undefined && isAnchoredFormula(formula)
    ? formula
    : undefined;
}

function quotedAtOf(
  field: keyof typeof ROLE_OF_RULE_FIELD,
  formula: AnchoredFormula | undefined,
): number | undefined {
  if (field === "anchorMinor") return formula?.anchorWidthMm;
  return field === "perHeightStepMinor" ? formula?.anchorHeightMm : undefined;
}

function builtWidthOfSize(
  keyMm: number,
  listedWidths: readonly ListedWidth[],
): number {
  return (
    listedWidths.find(({ pricedAsWidthMm }) => pricedAsWidthMm === keyMm)
      ?.widthMm ?? keyMm
  );
}

export function ruleIn(
  book: PriceBook,
  ruleId: string,
): CabinetPriceRule | undefined {
  return book.cabinetRules.find((rule) => rule.ruleId === ruleId);
}

/** The text a person has typed into a field, by its key; a field not in it shows its draft value. */
export type TypedTexts = Readonly<Record<string, string>>;

export interface FieldState {
  readonly field: DetailField;
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The amount in effect: the typed one while it reads, else the draft's. */
  readonly effectiveMinor: number;
}

export function fieldStatesOf(
  fields: readonly DetailField[],
  typed: TypedTexts,
): readonly FieldState[] {
  return fields.map((field) => {
    const text = typed[field.key] ?? plainLeiOf(field.pendingMinor);
    const reading = readLeiInputOverHeld(text, [
      field.activeMinor,
      field.pendingMinor,
    ]);
    return {
      field,
      text,
      reading,
      effectiveMinor:
        reading.kind === "amount" ? reading.minor : field.pendingMinor,
    };
  });
}

/** Every field reads as an amount, so the typed values make a rule. */
export function isEveryFieldReadable(states: readonly FieldState[]): boolean {
  return states.every(({ reading }) => reading.kind === "amount");
}

/** The fields whose typed amount differs from the draft's: what Save would send. */
export function changedStatesOf(
  states: readonly FieldState[],
): readonly FieldState[] {
  return states.filter(
    ({ reading, field }) =>
      reading.kind === "amount" && reading.minor !== field.pendingMinor,
  );
}

/** An address of a number field with a number is a change of that field: the book judges which address takes one. */
export function draftChangeOf(
  address: AppliedAddress,
  value: number,
): DraftChange {
  return { address, value } as DraftChange;
}

/** The candidate book with the typed amounts applied; `undefined` when a typed amount does not make a book. */
export function bookWithTyped(
  candidate: PriceBook,
  states: readonly FieldState[],
): PriceBook | undefined {
  const applied = applyChanges(
    candidate,
    changedStatesOf(states).map(({ field, effectiveMinor }) =>
      draftChangeOf(field.address, effectiveMinor),
    ),
  );
  return applied.ok ? applied.book : undefined;
}

/**
 * Why the rule's prices are refused: the field the refusal is owed to, or only the reason where no field is. Every
 * refusal of `judgePricesOfRule` is one, so a rule the judgement refuses is never one that can be saved.
 */
export type PriceJudgement =
  | {
      readonly kind: "not-positive-at-width";
      readonly fieldKey: string;
      readonly widthMm: number;
    }
  | {
      readonly kind: "not-positive-at-height";
      readonly fieldKey: string;
      readonly heightMm: number;
    }
  | { readonly kind: "not-positive"; readonly fieldKey: string }
  | { readonly kind: "too-large"; readonly fieldKey: string }
  | {
      readonly kind: "unplaced";
      readonly reason: "not-positive" | "too-large";
    };

export function judgePrices(
  rule: CabinetPriceRule,
  fields: readonly DetailField[],
): PriceJudgement | undefined {
  const refusal = judgePricesOfRule(rule, priceDashboardCatalogue());
  return refusal === undefined ? undefined : judgementOf(refusal, fields);
}

function judgementOf(
  refusal: BookRefusal,
  fields: readonly DetailField[],
): PriceJudgement {
  if (
    refusal.code !== "PRICE_NOT_POSITIVE" &&
    refusal.code !== "PRICE_TOO_LARGE"
  ) {
    // The one other refusal of a rule's prices is an amount the arithmetic cannot hold exactly: past what a price may be.
    return { kind: "unplaced", reason: "too-large" };
  }
  const fieldKey = keyOfRefusedField(refusal, fields);
  if (fieldKey === undefined) {
    return { kind: "unplaced", reason: reasonOf(refusal) };
  }
  if (refusal.code === "PRICE_TOO_LARGE") {
    return { kind: "too-large", fieldKey };
  }
  if (refusal.field === "perStepNarrowerMinor") {
    return {
      kind: "not-positive-at-width",
      fieldKey,
      widthMm: refusal.widthMm,
    };
  }
  if (refusal.field === "perHeightStepMinor") {
    return {
      kind: "not-positive-at-height",
      fieldKey,
      heightMm: refusal.heightMm,
    };
  }
  return { kind: "not-positive", fieldKey };
}

function reasonOf(
  refusal: Extract<
    BookRefusal,
    { readonly code: "PRICE_NOT_POSITIVE" | "PRICE_TOO_LARGE" }
  >,
): "not-positive" | "too-large" {
  return refusal.code === "PRICE_TOO_LARGE" ? "too-large" : "not-positive";
}

function keyOfRefusedField(
  refusal: Extract<
    BookRefusal,
    { readonly code: "PRICE_NOT_POSITIVE" | "PRICE_TOO_LARGE" }
  >,
  fields: readonly DetailField[],
): string | undefined {
  if (refusal.field !== "amountMinor") {
    return fields.find(({ address }) => addressField(address) === refusal.field)
      ?.key;
  }
  const keyMm = roundUpToPriceStepMm(refusal.widthMm);
  return fields.find(
    ({ address }) =>
      address.kind === "cabinet-size" && address.widthMm === keyMm,
  )?.key;
}

function addressField(address: CabinetPriceAddress): string | undefined {
  return address.kind === "cabinet" ? address.field : undefined;
}
