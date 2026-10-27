import {
  anchoredFieldsReadBy,
  isAnchoredShape,
  PRICE_PER_SIZE_SHAPE,
  type AnchoredFormula,
  type PricePerSizeFormula,
} from "../pricing/anchored-price-formula.js";
import {
  isRecord,
  MAX_PRICE_COEFFICIENT_MINOR,
} from "../pricing/book-reading.js";
import {
  accessoryRuleOf,
  ACCESSORY_IDS,
  type CabinetPriceRule,
  type PriceBook,
  type PriceFormula,
  type TierIdentity,
} from "../pricing/price-book.js";
import {
  MAX_DEEP_CABINET_PERCENT,
  MAX_MATERIAL_PERCENT,
} from "../pricing/price-bounds.js";

import {
  ACCESSORY_FIELDS,
  CABINET_RULE_FIELDS,
  HARDWARE_RATE_FIELDS,
  MATERIAL_FIELDS,
  type AddressOfKind,
  type BookFieldAddress,
  type DraftChange,
} from "./book-field-address.js";

// Which fields of a price book a draft change may set, found and written by `locateField`. `applyChanges` judges and
// writes through it, `diffBooks` and `restoreChanges` read through it, so "editable" has a single meaning. Creation,
// text and deletion kinds are refused `NOT_EDITABLE` until `locateField` has an arm for them.

/** Why one change was refused. The wire's draft-change refusal codes are built from this list. */
export const CHANGE_REFUSAL_CODES = Object.freeze([
  "MISSING_VALUE",
  "NOT_A_WHOLE_NUMBER",
  "NEGATIVE",
  "TOO_LARGE",
  "UNKNOWN_ADDRESS",
  "UNKNOWN_RULE",
  "UNKNOWN_ITEM",
  "NOT_EDITABLE",
  "FIELD_NOT_ON_RULE",
] as const);
export type ChangeRefusalCode = (typeof CHANGE_REFUSAL_CODES)[number];

/** The result of a judgement: the thing judged, or the code it was refused for. */
export type Judged<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: ChangeRefusalCode };

function accepted<Value>(value: Value): Judged<Value> {
  return { ok: true, value };
}

function refused(code: ChangeRefusalCode): Judged<never> {
  return { ok: false, code };
}

/** The address kinds that set a value on a row the book already has. */
export const APPLIED_ADDRESS_KINDS = Object.freeze([
  "cabinet",
  "cabinet-size",
  "hardware",
  "material",
  "depth-rule",
  "accessory",
  "provisional",
] as const);
export type AppliedAddressKind = (typeof APPLIED_ADDRESS_KINDS)[number];

export type AppliedAddress = AddressOfKind<AppliedAddressKind>;
export type AppliedDraftChange = Extract<
  DraftChange,
  { readonly address: AppliedAddress }
>;

export type CabinetAddress = AddressOfKind<"cabinet" | "cabinet-size">;

/** Whether `address` names a cabinet's price (an anchored amount or a listed size): what a bulk action may touch. */
export function isCabinetAddress(address: unknown): address is CabinetAddress {
  return (
    isRecord(address) &&
    (address["kind"] === "cabinet" || address["kind"] === "cabinet-size")
  );
}

/** What an editable field holds: an amount in bani, a whole percent, or the provisional flag. */
export type FieldValue = number | boolean;

/** How a field's value reads: `amount` in bani, `percent` whole, `flag` a boolean. */
export type FieldUnit = "amount" | "percent" | "flag";

/** A function from one book to the book with one field set. By id, so updaters compose in order. */
export type BookUpdater = (book: PriceBook) => PriceBook;

interface NumericField {
  readonly unit: "amount" | "percent";
  readonly current: number;
  /** The largest value the book's bounds allow; the smallest is 0. */
  readonly maxValue: number;
  readonly settingTo: (value: number) => BookUpdater;
}

interface FlagField {
  readonly unit: "flag";
  readonly current: boolean;
  readonly settingTo: (value: boolean) => BookUpdater;
}

type LocatedField = NumericField | FlagField;

export interface EditableFieldReading {
  readonly address: AppliedAddress;
  readonly value: FieldValue;
  readonly unit: FieldUnit;
}

/** Judges `value` for the field `address` names in `book` and answers the updater that sets it. Refuses the address
 *  first, then the value. */
export function prepareWrite(
  book: PriceBook,
  address: BookFieldAddress,
  value: unknown,
): Judged<BookUpdater> {
  const located = locateField(book, address);
  return located.ok ? writerFor(located.value, value) : located;
}

function writerFor(field: LocatedField, value: unknown): Judged<BookUpdater> {
  if (field.unit === "flag") {
    return typeof value === "boolean"
      ? accepted(field.settingTo(value))
      : refused("MISSING_VALUE");
  }
  const judged = judgeWholeNumber(value, field.maxValue);
  return judged.ok ? accepted(field.settingTo(judged.value)) : judged;
}

/** A whole number from 0 to `maxValue`. `-0` is refused as negative: it prints as 0 and signs as a reduction. */
function judgeWholeNumber(value: unknown, maxValue: number): Judged<number> {
  if (value === undefined || value === null) return refused("MISSING_VALUE");
  if (typeof value !== "number" || !Number.isInteger(value))
    return refused("NOT_A_WHOLE_NUMBER");
  if (value < 0 || Object.is(value, -0)) return refused("NEGATIVE");
  return value > maxValue ? refused("TOO_LARGE") : accepted(value);
}

/** Every field of the book a change of the applied kinds may set, in the order the dashboard lists them. */
export function readEditableFields(
  book: PriceBook,
): readonly EditableFieldReading[] {
  return candidateAddresses(book).flatMap((address) => {
    const located = locateField(book, address);
    if (!located.ok) return [];
    const { current, unit } = located.value;
    return [{ address, value: current, unit }];
  });
}

/** A change from an address and a value read from it: the address's kind decides the value's type, and
 *  `readEditableFields` yields only values of that type. */
export function changeFromReading(
  reading: Pick<EditableFieldReading, "address" | "value">,
): AppliedDraftChange {
  return {
    address: reading.address,
    value: reading.value,
  } as AppliedDraftChange;
}

/** Finds the field an address names in this book, or says why it names none. Total over every address kind. */
function locateField(
  book: PriceBook,
  address: BookFieldAddress,
): Judged<LocatedField> {
  switch (address.kind) {
    case "cabinet":
      return locateCabinetField(book, address);
    case "cabinet-size":
      return locateCabinetSize(book, address);
    case "hardware":
      return locateHardwareRate(book, address);
    case "material":
      return locateMaterialPercent(book, address);
    case "depth-rule":
      return locateDepthRule(book);
    case "accessory":
      return locateAccessoryPrice(book, address);
    case "provisional":
      return locateProvisional(book);
    case "hardware-tier-created":
    case "accessory-created":
    case "created-row-text":
    case "item-deleted":
      return refused("NOT_EDITABLE");
    default:
      return refuseUnknownKind(address);
  }
}

function refuseUnknownKind(unknownAddress: never): Judged<never> {
  void unknownAddress;
  return refused("UNKNOWN_ADDRESS");
}

function candidateAddresses(book: PriceBook): readonly AppliedAddress[] {
  return [
    ...book.cabinetRules.flatMap(cabinetCandidates),
    ...book.hardware.tiers.flatMap((tier) =>
      HARDWARE_RATE_FIELDS.map(
        (field): AppliedAddress => ({
          kind: "hardware",
          tierId: tier.tierId,
          field,
        }),
      ),
    ),
    ...book.material.tiers.flatMap((tier) =>
      MATERIAL_FIELDS.map(
        (field): AppliedAddress => ({
          kind: "material",
          tierId: tier.tierId,
          field,
        }),
      ),
    ),
    { kind: "depth-rule" },
    ...ACCESSORY_IDS.flatMap((accessoryId) =>
      ACCESSORY_FIELDS.map(
        (field): AppliedAddress => ({ kind: "accessory", accessoryId, field }),
      ),
    ),
    { kind: "provisional" },
  ];
}

function cabinetCandidates(rule: CabinetPriceRule): readonly AppliedAddress[] {
  const perSize = perSizeFormulaOf(rule.formula);
  if (perSize !== undefined) {
    return perSize.sizes.map(
      (size): AppliedAddress => ({
        kind: "cabinet-size",
        ruleId: rule.ruleId,
        widthMm: size.widthMm,
      }),
    );
  }
  return CABINET_RULE_FIELDS.map(
    (field): AppliedAddress => ({
      kind: "cabinet",
      ruleId: rule.ruleId,
      field,
    }),
  );
}

// The formula parameters are typed as possibly absent: the parser lets a rule without a formula through (it is refused
// when priced), and a `const` would be narrowed back to its initialiser's type.

export function anchoredFormulaOf(
  formula: PriceFormula | undefined,
): AnchoredFormula | undefined {
  return isAnchoredShape(formula?.shape) ? formula : undefined;
}

function perSizeFormulaOf(
  formula: PriceFormula | undefined,
): PricePerSizeFormula | undefined {
  return formula?.shape === PRICE_PER_SIZE_SHAPE ? formula : undefined;
}

function locateCabinetField(
  book: PriceBook,
  address: AddressOfKind<"cabinet">,
): Judged<LocatedField> {
  const { ruleId, field } = address;
  if (!isListed(CABINET_RULE_FIELDS, field)) return refused("UNKNOWN_ADDRESS");
  const rule = findRule(book, ruleId);
  if (rule === undefined) return refused("UNKNOWN_RULE");
  if (rule.suppliedBy === "customer") return refused("NOT_EDITABLE");
  const formula = anchoredFormulaOf(rule.formula);
  if (formula === undefined || !isReadByShape(formula, field))
    return refused("FIELD_NOT_ON_RULE");
  const current: unknown = Reflect.get(formula, field);
  if (typeof current !== "number") return refused("FIELD_NOT_ON_RULE");
  return accepted({
    unit: "amount",
    current,
    maxValue: MAX_PRICE_COEFFICIENT_MINOR,
    settingTo: (value) => (target) =>
      replaceRule(target, ruleId, (row) => ({
        ...row,
        formula: { ...row.formula, [field]: value },
      })),
  });
}

function locateCabinetSize(
  book: PriceBook,
  address: AddressOfKind<"cabinet-size">,
): Judged<LocatedField> {
  const { ruleId, widthMm } = address;
  const rule = findRule(book, ruleId);
  if (rule === undefined) return refused("UNKNOWN_RULE");
  if (rule.suppliedBy === "customer") return refused("NOT_EDITABLE");
  const size = perSizeFormulaOf(rule.formula)?.sizes.find(
    (listed) => listed.widthMm === widthMm,
  );
  if (size === undefined) return refused("FIELD_NOT_ON_RULE");
  return accepted({
    unit: "amount",
    current: size.amountMinor,
    maxValue: MAX_PRICE_COEFFICIENT_MINOR,
    settingTo: (value) => (target) =>
      replaceRule(target, ruleId, (row) => ({
        ...row,
        formula: withSizeAmount(row.formula, widthMm, value),
      })),
  });
}

function withSizeAmount(
  formula: PriceFormula,
  widthMm: number,
  amountMinor: number,
): PriceFormula {
  const perSize = perSizeFormulaOf(formula);
  if (perSize === undefined) return formula;
  return {
    ...perSize,
    sizes: perSize.sizes.map((size) =>
      size.widthMm === widthMm ? { ...size, amountMinor } : size,
    ),
  };
}

function locateHardwareRate(
  book: PriceBook,
  address: AddressOfKind<"hardware">,
): Judged<LocatedField> {
  const { tierId, field } = address;
  if (!isListed(HARDWARE_RATE_FIELDS, field)) return refused("UNKNOWN_ADDRESS");
  const tier = book.hardware.tiers.find((row) => row.tierId === tierId);
  if (tier === undefined) return refused("UNKNOWN_ITEM");
  const current: unknown = Reflect.get(tier, field);
  if (typeof current !== "number") return refused("FIELD_NOT_ON_RULE");
  return accepted({
    unit: "amount",
    current,
    maxValue: MAX_PRICE_COEFFICIENT_MINOR,
    settingTo: (value) => (target) => ({
      ...target,
      hardware: {
        ...target.hardware,
        tiers: withTierField(target.hardware.tiers, { tierId, field }, value),
      },
    }),
  });
}

function locateMaterialPercent(
  book: PriceBook,
  address: AddressOfKind<"material">,
): Judged<LocatedField> {
  const { tierId, field } = address;
  if (!isListed(MATERIAL_FIELDS, field)) return refused("UNKNOWN_ADDRESS");
  const tier = book.material.tiers.find((row) => row.tierId === tierId);
  if (tier === undefined) return refused("UNKNOWN_ITEM");
  if (tier.tierId === book.material.defaultTierId)
    return refused("NOT_EDITABLE");
  const current: unknown = Reflect.get(tier, field);
  if (typeof current !== "number") return refused("FIELD_NOT_ON_RULE");
  return accepted({
    unit: "percent",
    current,
    maxValue: MAX_MATERIAL_PERCENT,
    settingTo: (value) => (target) => ({
      ...target,
      material: {
        ...target.material,
        tiers: withTierField(target.material.tiers, { tierId, field }, value),
      },
    }),
  });
}

function locateDepthRule(book: PriceBook): Judged<LocatedField> {
  const depthRule = book.depthRule;
  if (depthRule === undefined) return refused("FIELD_NOT_ON_RULE");
  return accepted({
    unit: "percent",
    current: depthRule.deepCabinetPercent,
    maxValue: MAX_DEEP_CABINET_PERCENT,
    settingTo: (value) => (target) => ({
      ...target,
      depthRule: { ...target.depthRule, deepCabinetPercent: value },
    }),
  });
}

function locateAccessoryPrice(
  book: PriceBook,
  address: AddressOfKind<"accessory">,
): Judged<LocatedField> {
  const { accessoryId: declaredId, field } = address;
  if (!isListed(ACCESSORY_FIELDS, field)) return refused("UNKNOWN_ADDRESS");
  const accessoryId = ACCESSORY_IDS.find((id) => id === declaredId);
  const rule =
    accessoryId === undefined ? undefined : accessoryRuleOf(book, accessoryId);
  if (accessoryId === undefined || rule === undefined)
    return refused("UNKNOWN_ITEM");
  return accepted({
    unit: "amount",
    current: rule.perUnitMinor,
    maxValue: MAX_PRICE_COEFFICIENT_MINOR,
    settingTo: (value) => (target) => ({
      ...target,
      accessories: {
        ...target.accessories,
        [accessoryId]: {
          ...target.accessories[accessoryId],
          perUnitMinor: value,
        },
      },
    }),
  });
}

function locateProvisional(book: PriceBook): Judged<LocatedField> {
  return accepted({
    unit: "flag",
    current: book.amountsProvisional,
    settingTo: (value) => (target) => ({
      ...target,
      amountsProvisional: value,
    }),
  });
}

function findRule(
  book: PriceBook,
  ruleId: string,
): CabinetPriceRule | undefined {
  return book.cabinetRules.find((rule) => rule.ruleId === ruleId);
}

function replaceRule(
  book: PriceBook,
  ruleId: string,
  replace: (rule: CabinetPriceRule) => CabinetPriceRule,
): PriceBook {
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      rule.ruleId === ruleId ? replace(rule) : rule,
    ),
  };
}

function withTierField<Tier extends TierIdentity>(
  tiers: readonly Tier[],
  edit: { readonly tierId: string; readonly field: string },
  value: number,
): readonly Tier[] {
  const { tierId, field } = edit;
  return tiers.map((tier) =>
    tier.tierId === tierId ? { ...tier, [field]: value } : tier,
  );
}

function isListed(list: readonly string[], field: unknown): boolean {
  return typeof field === "string" && list.includes(field);
}

function isReadByShape(formula: AnchoredFormula, field: string): boolean {
  return anchoredFieldsReadBy(formula.shape).some(
    (read) => read.name === field,
  );
}
