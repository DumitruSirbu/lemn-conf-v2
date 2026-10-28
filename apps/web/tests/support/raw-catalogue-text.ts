// Catalogue text written out from the JSON files by hand, through no content resolver and no ICU library.
//
// A test whose expected string comes out of `resolveContent` cannot tell a resolver that asked the wrong leaf
// from one that asked the right one. Here a leaf is read by its dotted path and its arguments are substituted
// by the few rules the shipped leaves use, so the expected side shares only the JSON with the code under test.
import type { BodyLabel } from "@lemnaria/configurator-domain";

import {
  leafAt,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "./catalogues";

export type LeafArguments = Readonly<Record<string, string | number>>;

export interface RawCatalogue {
  readonly locale: CatalogueLocale;
  readonly messages: Catalogue;
}

/** The index of the brace closing the one opened at `open`. */
function closingBraceOf(template: string, open: number): number {
  let depth = 0;
  for (let index = open; index < template.length; index += 1) {
    if (template[index] === "{") depth += 1;
    if (template[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error(`unbalanced braces in "${template}"`);
}

function pluralBranchesOf(options: string): ReadonlyMap<string, string> {
  const branches = new Map<string, string>();
  let cursor = 0;
  while (cursor < options.length) {
    const open = options.indexOf("{", cursor);
    if (open === -1) break;
    const close = closingBraceOf(options, open);
    branches.set(
      options.slice(cursor, open).trim(),
      options.slice(open + 1, close),
    );
    cursor = close + 1;
  }
  return branches;
}

function requireArgument(
  args: LeafArguments,
  name: string,
  template: string,
): string | number {
  const value = args[name];
  if (value === undefined)
    throw new Error(`"${template}" needs the argument ${name}`);
  return value;
}

function fillPlural(
  locale: CatalogueLocale,
  options: string,
  count: number,
  args: LeafArguments,
): string {
  const branches = pluralBranchesOf(options);
  const category = new Intl.PluralRules(locale).select(count);
  const branch = branches.get(category) ?? branches.get("other");
  if (branch === undefined)
    throw new Error(`no ${category} or other branch in "${options}"`);
  return fillTemplate(locale, branch.replaceAll("#", String(count)), args);
}

function fillPlaceholder(
  locale: CatalogueLocale,
  placeholder: string,
  args: LeafArguments,
): string {
  const [name = "", kind, ...rest] = placeholder.split(",");
  const value = requireArgument(args, name.trim(), placeholder);
  if (kind?.trim() === "plural") {
    return fillPlural(locale, rest.join(","), Number(value), args);
  }
  return String(value);
}

/** Substitutes `{name}`, `{name, number, ::group-off}` and `{name, plural, …}`, the forms the leaves use. */
export function fillTemplate(
  locale: CatalogueLocale,
  template: string,
  args: LeafArguments,
): string {
  let filled = "";
  let cursor = 0;
  while (cursor < template.length) {
    const open = template.indexOf("{", cursor);
    if (open === -1) break;
    const close = closingBraceOf(template, open);
    filled += template.slice(cursor, open);
    filled += fillPlaceholder(locale, template.slice(open + 1, close), args);
    cursor = close + 1;
  }
  return filled + template.slice(cursor);
}

export function fillLeaf(
  catalogue: RawCatalogue,
  key: string,
  args: LeafArguments = {},
): string {
  return fillTemplate(
    catalogue.locale,
    requireLeafAt(catalogue.messages, key),
    args,
  );
}

/**
 * A body's name read straight off the catalogue, or `undefined` for a name this reader does not write on its
 * own (a kind whose leaf takes a row word, an empty slot), so a caller can count what it left unchecked.
 */
export function rawBodyNameOf(
  catalogue: RawCatalogue,
  label: BodyLabel,
): string | undefined {
  switch (label.kind) {
    case "entry":
      return leafAt(catalogue.messages, `catalog.entries.${label.buildId}`);
    case "bodyKind": {
      const leaf = leafAt(
        catalogue.messages,
        `catalog.kinds.${label.bodyKind}`,
      );
      return leaf?.includes("{") === true ? undefined : leaf;
    }
    case "withDoors": {
      const name = rawBodyNameOf(catalogue, label.name);
      if (name === undefined) return undefined;
      return fillLeaf(catalogue, "catalog.bodyLabelWithDoors", {
        name,
        doors: label.doors,
      });
    }
    case "emptySlot":
      return undefined;
  }
}

const MINOR_UNITS_PER_THOUSAND_MDL = 100_000;

const MINOR_UNITS_PER_TEN_MDL = 1_000;

/** A priced line as printed (owner ruling 2026-10-28): its amount to the ten lei, in integer arithmetic, grouped by
 *  three with a plain space. Restated here, not imported, so a pin is not an agreement with the code it pins. */
export function rawLineAmountOf(amountMinor: number): string {
  const tensOfLei = Math.ceil(amountMinor / MINOR_UNITS_PER_TEN_MDL);
  return String(tensOfLei * 10).replace(/(?<=\d)(?=(?:\d{3})+$)/g, " ");
}

/** A total as printed: up to the next whole thousand MDL, in integer arithmetic, grouped by three with a plain
 *  space. */
export function rawRoundedAmountOf(amountMinor: number): string {
  const thousands = Math.floor(
    (amountMinor + MINOR_UNITS_PER_THOUSAND_MDL - 1) /
      MINOR_UNITS_PER_THOUSAND_MDL,
  );
  if (thousands === 0) return "0";
  const leading = String(thousands).replace(/(?<=\d)(?=(?:\d{3})+$)/g, " ");
  return `${leading} 000`;
}
