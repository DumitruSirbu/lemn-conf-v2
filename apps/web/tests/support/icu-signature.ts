// **One reading of an ICU message's shape**, shared by the catalogue parity gate and the
// pseudo-locale's own tests.
//
// A signature is everything a message says that is *not* its words: the arguments, their formats,
// the branch structure around them. Two files needed it — one to prove Russian owes Romanian's
// shape, the other to prove the length-stress transform takes nothing away — and a second copy is
// how the two come to disagree about what "the same shape" means.
import {
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

import type { CatalogueLocale } from "./catalogues";

/** The plural categories CLDR declares for a locale, which is what a correct catalogue's plural
 *  branches are — never the source language's set. Russian has `many` (0, 5–20, 25–30, …) where
 *  Romanian has only `one`/`few`/`other`, so a Russian leaf that mirrors Romanian's three branches
 *  is missing a category rather than matching one. */
export function cldrPluralCategories(
  locale: CatalogueLocale,
  type: Intl.PluralRuleType = "cardinal",
): readonly string[] {
  return [
    ...new Intl.PluralRules(locale, { type }).resolvedOptions()
      .pluralCategories,
  ].sort();
}

/** ICU's exact-value branch prefix. `=0` matches the number zero and nothing else, which is a
 *  different mechanism from a grammatical category and is compared as its own list. */
const EXACT_BRANCH_PREFIX = "=";

function exactBranchesOf(branches: readonly string[]): readonly string[] {
  return branches.filter((branch) => branch.startsWith(EXACT_BRANCH_PREFIX));
}

export function keywordBranchesOf(
  branches: readonly string[],
): readonly string[] {
  return branches.filter((branch) => !branch.startsWith(EXACT_BRANCH_PREFIX));
}

/** The categories both shipped locales have, and therefore the only ones whose bodies can be
 *  compared leaf against leaf. `many` has no Romanian counterpart to be compared with. */
const SHARED_PLURAL_BRANCHES: readonly string[] = cldrPluralCategories(
  "ro",
).filter((category) => cldrPluralCategories("ru").includes(category));

export function signature(
  elements: readonly MessageFormatElement[],
  context = "root",
): readonly string[] {
  return elements.flatMap((element) => {
    if (element.type === TYPE.literal) return [];
    if (element.type === TYPE.pound) return [`${context}:pound`];
    if (element.type === TYPE.argument)
      return [`${context}:argument:${element.value}`];
    if (element.type === TYPE.number) {
      return [
        `${context}:number:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.date) {
      return [
        `${context}:date:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.time) {
      return [
        `${context}:time:${element.value}:${JSON.stringify(element.style ?? null)}`,
      ];
    }
    if (element.type === TYPE.tag) {
      return [
        `${context}:tag:${element.value}`,
        ...signature(element.children, `${context}/tag:${element.value}`),
      ];
    }

    const kind = element.type === TYPE.select ? "select" : "plural";
    const branches: string[] = Object.keys(element.options).sort();
    if (!branches.includes("other"))
      throw new Error(`${kind}:${element.value} has no other branch`);
    const bodyOf = (branch: string): readonly MessageFormatElement[] => {
      const option = element.options[branch];
      if (option === undefined)
        throw new Error(`Missing parsed branch ${branch}`);
      return option.value;
    };
    // A `select`'s branch names are the product's own values — `left`/`right`, a rejection reason —
    // so the list is part of the shape and both locales owe the same one.
    if (element.type === TYPE.select) {
      return [
        `${context}:select:${element.value}:-:${branches.join(",")}`,
        ...branches.flatMap((branch) =>
          signature(
            bodyOf(branch),
            `${context}/select:${element.value}/${branch}`,
          ),
        ),
      ];
    }
    // **A plural's *category* list is deliberately absent from the cross-locale signature**, and the
    // per-locale assertion below is what replaces it. Requiring the two lists to be equal would have
    // made a CLDR-correct Russian plural fail parity and a Romanian-mirroring one pass — the gate
    // certifying the defect it exists to catch. The `=n` branches are not categories and stay in:
    // they name exact values the product switches on, so both locales owe the same ones.
    const exactBranches = exactBranchesOf(branches);
    return [
      `${context}:plural:${element.value}:${String(element.pluralType)}:${String(element.offset)}:${exactBranches.join(",")}`,
      ...[
        ...exactBranches,
        ...SHARED_PLURAL_BRANCHES.filter((branch) =>
          Object.hasOwn(element.options, branch),
        ),
      ].flatMap((branch) =>
        signature(
          bodyOf(branch),
          `${context}/plural:${element.value}/${branch}`,
        ),
      ),
    ];
  });
}

/** Every plural node in a parsed message, at any nesting depth. */
export function pluralNodesOf(
  elements: readonly MessageFormatElement[],
): readonly Extract<MessageFormatElement, { type: TYPE.plural }>[] {
  return elements.flatMap((element) => {
    if (element.type === TYPE.tag) return pluralNodesOf(element.children);
    if (element.type === TYPE.select) {
      return Object.values(element.options).flatMap((option) =>
        pluralNodesOf(option.value),
      );
    }
    if (element.type !== TYPE.plural) return [];
    return [
      element,
      ...Object.values(element.options).flatMap((option) =>
        pluralNodesOf(option.value),
      ),
    ];
  });
}

/** A `{n, selectordinal, =0 {…} … other {…}}` is an **exact-value switch**, not a grammatical one:
 *  every value the product can pass is named by its own `=` branch and `other` is the last of them.
 *  It carries no CLDR category and owes none — `rejection.parts.emptySpaceSide` is the eight-way
 *  side-and-reason switch written this way, and giving Romanian the `one` branch its ordinal rules
 *  declare would add a branch no argument can ever reach. */
export function isExactValueSwitch(branches: readonly string[]): boolean {
  return (
    exactBranchesOf(branches).length > 0 &&
    keywordBranchesOf(branches).join(",") === "other"
  );
}

/** How many grammatical plural leaves each catalogue ships, so the category sweep below cannot pass
 *  by walking nothing. Raise it deliberately when a plural is added — never lower it to make a run
 *  green.
 *
 *  Seven before the account screens, plus the four they added: `accountForm.fieldSummary`, `claimDialog.question`,
 *  `claimDialog.claimedTitle` and `accountKitchens.count`. Commit de0aa867 (Lot 1, wave L13b.1) raised it from 7 to 8 for
 *  the first of them; it was not raised for the other three, and the walk itself counts 11 in both catalogues. The staff
 *  list added three: `staffKitchens.countSent`, `countDrafts` and `countAll`; the staff notes added two:
 *  `staffNotes.count` and `staffNotes.truncated`; the audit page added one: `staffAudit.detailRows`. The M10 copy (wave T1)
 *  added twenty-seven: twenty-three in `priceDashboard`, three in `staffChanges` and one in `replacementSheet`. */
export const PLURAL_NODES_PER_CATALOGUE = 44;
