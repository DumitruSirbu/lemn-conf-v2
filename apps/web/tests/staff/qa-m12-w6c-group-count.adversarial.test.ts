// Adversarial QA of M12 wave W6c: the per-group count of the cabinet list, swept over every count a group can hold and
// past it, against the plural rules of Russian and Romanian written out here and not read back from the message.
import { describe, expect, it } from "vitest";

import { resolveStaffChangesCopy } from "@/i18n/content";

import { CATALOGUES, translatorFor } from "../support/catalogues";

const COUNT_SWEEP_UPPER_BOUND = 1205;

function russianNoun(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return "корпус";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14))
    return "корпуса";
  return "корпусов";
}

function romanianNoun(count: number): string {
  return count === 1 ? "corp" : "corpuri";
}

describe.each(CATALOGUES)("the group count in %s", (locale, messages) => {
  const groupCount = resolveStaffChangesCopy(translatorFor(locale, messages))
    .cabinets.groupCount;

  it("is the bare number, with no thousands separator, and the noun the language's plural rule picks, for every count", () => {
    const noun = locale === "ru" ? russianNoun : romanianNoun;

    for (let count = 0; count <= COUNT_SWEEP_UPPER_BOUND; count += 1) {
      expect(groupCount(count)).toBe(`${String(count)} ${noun(count)}`);
    }
  });
});
