// **The runtime half of "a language cannot ship unmarked".**
//
// `locale-endonyms.ts` and `locale-flags.tsx` are each a `Record<AppLocale, …>` so that adding a
// locale to `routing.locales` is a compile error until it has a name and a flag. That guard is real
// under `tsc` — and absent under `next dev`, which transpiles without checking: the lookup returned
// `undefined`, React rendered nothing, and a verifier saw the menu draw a row with a correct href,
// no flag and no label. A blank row is precisely the failure `locale-flags.tsx`'s own head comment
// warns a fallback would cause.
//
// **This file exists because the sweep that adds a third locale cannot make this claim.**
// `locale-menu-scales.dom.test.ts` *mocks* both modules to give `en` an endonym and a flag, so an
// off-record locale never reaches the real functions there and a throw added to them would be
// exercised by the mocks alone. Here nothing is mocked and the real functions are called directly.
import { describe, expect, it } from "vitest";

import { endonymOf } from "@/i18n/locale-endonyms";
import { flagOf } from "@/i18n/locale-flags";
import { routing, type AppLocale } from "@/i18n/routing";

/** A locale the tables have no row for. The cast is the point of the case: it stands in for the one
 *  state the type system cannot police — a `routing.locales` edited without editing the tables, seen
 *  through a toolchain that erased the type. */
const OFF_RECORD = "en" as AppLocale;

describe("a locale the tables were never given", () => {
  it("is not one of the shipped locales, so the cases below mean what they say", () => {
    expect([...routing.locales]).not.toContain(OFF_RECORD);
  });

  it("is refused by name rather than answered with nothing", () => {
    expect(() => endonymOf(OFF_RECORD)).toThrow(/en/);
    expect(() => flagOf(OFF_RECORD)).toThrow(/en/);
  });

  it("still answers for every locale that does ship", () => {
    // The other half: a guard that threw for everything would pass the case above and ship nothing.
    for (const locale of routing.locales) {
      expect(endonymOf(locale)).not.toBe("");
      expect(flagOf(locale)).toBeTruthy();
    }
  });
});
