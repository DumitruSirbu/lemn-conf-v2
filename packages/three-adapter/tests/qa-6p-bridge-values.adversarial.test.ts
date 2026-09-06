// **`LEGACY_ENUM_FINISHES` decides what a customer's click stores, and this file is what holds its
// values.** Until it existed, nothing did.
//
// Measured rather than suspected, as a QA finding: changing `clay` from `#cbc3b8` to `#cbc3b9` —
// one hex digit — passed `pnpm typecheck`, the whole domain suite, the whole adapter suite and the
// whole web suite. The panel would have stored a colour the scene does not paint and the swatch
// does not show, and no gate in this repository would have said so. Both halves below now go red on
// that mutation.
//
// Why nothing caught it: all three assertions over this table are circular, and still are.
// `panel-model.test.ts:402` compares `chip.finish` to `LEGACY_ENUM_FINISHES[name]` — the value the
// panel read to build the chip. `panel-model.qa.test.ts:478` compares the chip keys to
// `LEGACY_ENUM_FINISH_NAMES` — the list the panel mapped. `finishes.test.ts`'s `finishKeyOf`
// round-trip resolves through `FINISH_VALUES`, which **is** `LEGACY_ENUM_FINISHES`. Each is a table
// compared with itself, and each stays useful for what it does test — none of them can test this.
//
// The property they leave unguarded: **a chip must not render one colour and apply another.** That
// is pinned here, and here because the adapter is the only package holding both tables — the
// domain's declaration and `FINISH_COLORS`, which is derived from the `FINISHES` table this
// package has drawn since M1 and which no wave-6P edit touched.
import {
  FinishSchema,
  LEGACY_ENUM_FINISHES,
  LEGACY_ENUM_FINISH_NAMES,
  PALETTE_ENTRIES,
  freeColourFinish,
  paletteFinish,
  type LegacyEnumFinishName,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FINISH_COLORS } from "../src/finishes.js";

/** ADR 0071 decision 5's table for the five shipped finishes, written out. Derived from nothing —
 *  a pin that reads the table it pins is the circularity this file exists to break. */
const DECLARED_VALUE_OF = {
  white: paletteFinish("pal.alb"),
  clay: freeColourFinish("#cbc3b8"),
  sage: freeColourFinish("#8d9a84"),
  graphite: paletteFinish("pal.antracit"),
  oak: paletteFinish("pal.stejar-bardolino"),
} as const;

describe("what the five shipped chips actually apply", () => {
  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "applies the declared value for %s",
    (name) => {
      expect(LEGACY_ENUM_FINISHES[name]).toEqual(DECLARED_VALUE_OF[name]);
    },
  );

  it("names all five and no others, so the pin above is total", () => {
    expect(Object.keys(LEGACY_ENUM_FINISHES).sort()).toEqual(
      Object.keys(DECLARED_VALUE_OF).sort(),
    );
  });

  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "declares a value the schema itself accepts for %s",
    (name) => {
      // The table is typed `Record<LegacyEnumFinishName, Finish>`, but `paletteFinish` constructs
      // without validating and the type is not the gate a document passes through. This runs the
      // gate.
      expect(FinishSchema.safeParse(LEGACY_ENUM_FINISHES[name]).success).toBe(
        true,
      );
    },
  );
});

describe("a chip never applies a colour other than the one it shows", () => {
  /** The two ADR 0071 decision 5 narrows out of every palette: *Lut* and *Salvie* are paint and
   *  nothing else, so they and only they are free colours here. */
  const PAINTED_NAMES = ["clay", "sage"] as const;

  it("makes exactly the two narrowed-out finishes free colours", () => {
    const painted = LEGACY_ENUM_FINISH_NAMES.filter(
      (name) => LEGACY_ENUM_FINISHES[name].kind === "free-colour",
    );

    expect(painted).toEqual([...PAINTED_NAMES]);
  });

  it.each(PAINTED_NAMES)(
    "stores for %s exactly the hex this build paints and the swatch shows",
    (name) => {
      // The cross-table pin, and the one that catches a one-digit drift without a literal:
      // `FINISH_COLORS` comes from the adapter's own `FINISHES` table, which the domain does not
      // read and wave 6P did not touch. `editor-panel.tsx` publishes the same constant to the
      // stylesheet, so this is the document, the pixel and the swatch agreeing.
      const finish = LEGACY_ENUM_FINISHES[name];
      if (finish.kind !== "free-colour")
        throw new Error(`${name} is not paint`);

      expect(finish.value).toBe(FINISH_COLORS[name]);
    },
  );

  it("leaves no free colour unchecked against the table that paints it", () => {
    // Not a vacuous pair: if a sixth name became paint, or `white`/`graphite` did, the sweep above
    // would silently stop covering it.
    const painted = LEGACY_ENUM_FINISH_NAMES.filter(
      (name) => LEGACY_ENUM_FINISHES[name].kind === "free-colour",
    );

    expect(painted.every((name) => name in FINISH_COLORS)).toBe(true);
    expect(painted).toHaveLength(PAINTED_NAMES.length);
  });
});

describe("the palette-entry chips name entries that exist", () => {
  const DECLARED_IDS = PALETTE_ENTRIES.map((entry) => entry.entryId);

  const entryNames = LEGACY_ENUM_FINISH_NAMES.filter(
    (name) => LEGACY_ENUM_FINISHES[name].kind === "palette-entry",
  );

  it("makes exactly the three ADR 0071 decision 5 keeps on a palette", () => {
    expect(entryNames).toEqual(["white", "graphite", "oak"]);
  });

  it.each(["white", "graphite", "oak"] as const)(
    "names a declared entry for %s rather than an id no material offers",
    (name: LegacyEnumFinishName) => {
      const finish = LEGACY_ENUM_FINISHES[name];
      if (finish.kind !== "palette-entry") {
        throw new Error(`${name} is not a palette entry`);
      }

      expect(DECLARED_IDS).toContain(finish.entryId);
    },
  );

  it("maps oak to a Stejar and not to any other wood", () => {
    // ADR 0071 decision 5: `oak` becomes one of PAL's two *Stejar* decors. A drift to *Nuc Warmia
    // Maro* would be a walnut sold as oak, and the round-trip through `finishKeyOf` would not
    // notice — it resolves through the very table that drifted.
    const oak = LEGACY_ENUM_FINISHES.oak;
    if (oak.kind !== "palette-entry") throw new Error("oak is not an entry");

    expect(oak.entryId).toMatch(/^pal\.stejar-/);
  });
});
