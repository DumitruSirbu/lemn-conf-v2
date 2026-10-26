// How a price book arriving as untrusted data is read, shared by every parser of one: `parse-price-book.ts` and
// `parse-anchored-formula.ts`. Reading a book runs the book's own code (a getter, a `toJSON`, a proxy trap), so
// nothing here reads a member bare: fields go through `readDeclared`, enumerations through `enumerableFieldsOf`, lists
// through `boundedListOf`, and a refusal is built by `invalidBook` only. This module imports no pricing type, so
// both parsers and `anchored-price-formula.ts` can depend on it.
import { MAX_DESIGN_DIMENSION_MM } from "../design-bounds.js";
import { boundedFailureReason } from "../failure-text.js";

import type { PricingFailure } from "./price-lines.js";

/** The widest linear shape's term count: base, width, height and door-leaf terms, each multiplied by a
 *  millimetre count. An anchored shape has five terms, but it multiplies each by a count of 50 mm steps or of door
 *  leaves, so its multipliers sum to far less than four millimetre-sized ones and the same bound holds. */
const TERMS_IN_THE_WIDEST_FORMULA = 4;

/** The largest count a book amount is multiplied by: a millimetre dimension, since every other
 *  multiplier (steps, door leaves, hinges, drawers, latches, sinks) stays far below ten thousand. */
const MAX_BOOK_AMOUNT_MULTIPLIER = MAX_DESIGN_DIMENSION_MM;

/**
 * The largest magnitude a coefficient or a stated amount may carry, in minor units. Derived from the
 * arithmetic: at this bound every product and partial sum `amountForBody` forms stays in the
 * safe-integer range, so cancelling terms cannot lose precision. A bound on magnitude, not sign:
 * `refuseNegativeAmount` refuses a negative price and the published line is refused where it is built.
 */
export const MAX_PRICE_COEFFICIENT_MINOR = Math.floor(
  Number.MAX_SAFE_INTEGER /
    (TERMS_IN_THE_WIDEST_FORMULA * MAX_BOOK_AMOUNT_MULTIPLIER),
);

/** A read that raised, told apart from every value a book can carry: a symbol, not `undefined`,
 *  because an absent amount is an ordinary declaration. */
export const UNREADABLE = Symbol("unreadable book amount");

/**
 * A property read that cannot take the parser with it: an accessor on a JavaScript-value book may
 * raise. Returns `UNREADABLE`; what raised is named, never rendered, since rendering the value is one
 * more place this boundary could raise.
 */
export function readDeclared(
  declared: Record<string, unknown>,
  field: string,
): unknown {
  try {
    return declared[field];
  } catch {
    return UNREADABLE;
  }
}

/**
 * The enumerable keys of a declared object and of the prototypes it brings with it, which is what a
 * property read reaches. The walk stops at `Object.prototype`: a polluted
 * `Object.prototype.injectedAmountMinor` would otherwise refuse every well-formed book. Depth is
 * bounded because a proxy may answer `getPrototypeOf` with a fresh object indefinitely.
 */
export function enumerableFieldsOf(
  declared: Record<string, unknown>,
): readonly string[] | undefined {
  try {
    const fields = new Set<string>();
    let level: object | null = declared;
    for (let depth = 0; depth < MAX_BOOK_PROTOTYPE_DEPTH; depth += 1) {
      if (level === null || level === Object.prototype) break;
      for (const field of Object.keys(level)) fields.add(field);
      level = Object.getPrototypeOf(level) as object | null;
    }
    return [...fields];
  } catch {
    return undefined;
  }
}

/** How far up a declared object's prototypes an amount may live: generous for class-backed books, short
 *  enough that a proxy cannot walk the parser in circles. */
const MAX_BOOK_PROTOTYPE_DEPTH = 8;

export function isRecord(
  declared: unknown,
): declared is Record<string, unknown> {
  return (
    typeof declared === "object" &&
    declared !== null &&
    !Array.isArray(declared)
  );
}

/**
 * A list a book declared, copied out before anything sweeps it. `Array.isArray` is true of a proxy
 * over an array, so the length read, `Symbol.iterator` and each index run the book's own traps; the
 * snapshot makes those the last reads of the declared value. Copied by index within the one length
 * read, not through the iterator: a proxy may answer `length` with a larger number every time, and
 * `Array.from` would follow it forever. `undefined` for every way this is not a list a book may
 * declare; the caller knows which section it was.
 */
export function boundedListOf(
  declared: unknown,
  maxLength: number,
): readonly unknown[] | undefined {
  if (!Array.isArray(declared)) return undefined;
  return snapshotOfDeclaredList(declared as readonly unknown[], maxLength);
}

function snapshotOfDeclaredList(
  declared: readonly unknown[],
  maxLength: number,
): readonly unknown[] | undefined {
  try {
    const declaredLength = declared.length;
    if (declaredLength > maxLength) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < declaredLength; index += 1) {
      snapshot.push(declared[index]);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

/** The one place a parse failure is built, so `detail` is bounded and scrubbed unconditionally: every
 *  string here comes from a book outside TypeScript (ADR 0062 seam 1). */
export function invalidBook(
  detail: string,
  named?: { readonly id: string },
): PricingFailure {
  return {
    code: "INVALID_PRICE_BOOK",
    detail: boundedFailureReason(detail),
    ...named,
  };
}

/** What a declared value was, for a message. A list is summarised: a thousand-tier book must not turn
 *  its refusal into a thousand-tier string. */
export function describeDeclared(declared: unknown): string {
  // The one place `UNREADABLE` becomes words: the symbol must never reach a logged, rendered failure.
  if (declared === UNREADABLE) return "something that raised when it was read";
  if (declared === undefined) return "nothing";
  if (Array.isArray(declared)) return describedLength(declared);
  return renderedOr(renderedAsJson(declared), typeof declared);
}

/** The describer runs inside the refusal path and `length` on a proxy is a trap, so a raise here would
 *  lose the refusal being built. */
function describedLength(declared: readonly unknown[]): string {
  try {
    return `a list of ${String(declared.length)}`;
  } catch {
    return "a list whose length raised when it was read";
  }
}

/**
 * `JSON.stringify` is the wrong shape here twice over: it answers `undefined` for a function or
 * symbol while its type says string, and it raises for a BigInt, a circular member or a raising
 * `toJSON`. The describer runs inside the refusal path, so either would lose the refusal. Falling back
 * to `typeof` says less but is all it can promise.
 */
function renderedAsJson(declared: unknown): string | undefined {
  try {
    return JSON.stringify(declared);
  } catch {
    return undefined;
  }
}

/** Widened by a parameter, not a local annotation: a `const` narrows back to its initialiser's type. */
function renderedOr(rendered: string | undefined, fallback: string): string {
  return rendered ?? fallback;
}

/**
 * Every amount an object states, held to a magnitude the arithmetic can carry exactly. Swept by kind,
 * not by name, so a fifth coefficient is bounded the day it is added. Swept through the prototype
 * chain: readers reach an amount by `tier[field]`, which resolves inherited properties, and a book
 * backed by model objects states its rates there. Only safe integers are judged here;
 * `usableCoefficientOf` already refuses null, NaN, infinities, fractions and `2 ** 62`.
 */
export function refuseOversizedAmount(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const fields = enumerableFieldsOf(declared);
  if (fields === undefined)
    return invalidBook(`The ${named} could not be enumerated for its amounts`);

  for (const field of fields) {
    const read = readDeclared(declared, field);
    if (read === UNREADABLE)
      return invalidBook(
        `The ${named} declares "${field}" as something that raised when it was read`,
      );
    if (isOversizedAmount(read)) {
      return invalidBook(
        `The ${named} declares "${field}" as ${String(read)}, whose magnitude is past ` +
          `${String(MAX_PRICE_COEFFICIENT_MINOR)} minor units — past what the arithmetic holds exactly`,
      );
    }
  }
  return undefined;
}

function isOversizedAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) > MAX_PRICE_COEFFICIENT_MINOR
  );
}

/** An amount that must be a safe integer count of minor units. Takes the value already read, so a caller that
 *  goes on to compare it judges the same read. */
export function refuseNonWholeAmount(
  read: unknown,
  declaredAs: { readonly field: string; readonly named: string },
): PricingFailure | undefined {
  if (typeof read === "number" && Number.isSafeInteger(read)) return undefined;
  return invalidBook(
    `The ${declaredAs.named} declares "${declaredAs.field}" as ${describeDeclared(read)}, ` +
      `which is not a whole, exact count of minor units`,
  );
}

/** A price in the book: a safe integer count of minor units, never below zero. Magnitude is
 *  `refuseOversizedAmount`'s. Reads the field once. */
export function refuseNegativeAmount(
  record: Record<string, unknown>,
  field: string,
  named: string,
): PricingFailure | undefined {
  const read = readDeclared(record, field);
  const notWhole = refuseNonWholeAmount(read, { field, named });
  if (notWhole) return notWhole;
  if ((read as number) >= 0) return undefined;
  return invalidBook(
    `The ${named} declares "${field}" as ${String(read)}, a price below zero`,
  );
}

/**
 * Any field a shape does not read, whichever shape it belongs to: it would sit in the book unpriced while the
 * dashboard offered it for editing. A key holding `undefined` is absent. Enumerated through `enumerableFieldsOf`, so
 * an inherited field counts too.
 */
export function refuseUnreadFields(
  record: Record<string, unknown>,
  readFields: readonly string[],
  context: {
    readonly shape: string;
    readonly named: string;
    /** The path a field is named under when the record sits inside the formula, such as `sizes[2].`. */
    readonly within?: string;
  },
): PricingFailure | undefined {
  const fields = enumerableFieldsOf(record);
  if (fields === undefined)
    return invalidBook(
      `The ${context.named} could not be enumerated for its fields`,
    );
  for (const field of fields) {
    if (readFields.includes(field)) continue;
    if (readDeclared(record, field) === undefined) continue;
    return invalidBook(
      `The ${context.named} declares "${context.within ?? ""}${field}", which its shape "${context.shape}" does not read`,
    );
  }
  return undefined;
}
