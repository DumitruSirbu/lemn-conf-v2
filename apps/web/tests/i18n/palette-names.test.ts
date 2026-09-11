// **The eight palette names, resolved from the ids `materials.ts` declares — enumerated, in both
// locales.**
//
// The catalogue has carried `finish.pal.*` and `finish.veneer.*` since Gate O1 and **nothing read
// them**: the swatch chip and ADR 0104's pill both printed `PaletteEntry.name`, the domain's own
// Romanian, so a `/ru` customer read *Nuc Warmia Maro*. Wave 6B-f2 deleted that field and wired the
// leaves up.
//
// **The palette is the one place a diacritic sweep is blind** (`docs/i18n/ro-catalogue-notes.md`):
// *Alb*, *Antracit*, *Stejar Bardolino Natur* and *Nuc* carry no Romanian diacritic and no grep this
// phase has used would have found them. This file is what covers them until 6B-j's lint rule does.
import { describe, expect, it } from "vitest";

import {
  PALETTE_ENTRIES,
  PALETTE_ENTRY_IDS,
} from "@lemnaria/configurator-domain";

import { CATALOGUES, contentFor, leafAt } from "../support/catalogues";

describe("every declared palette entry has a name in every locale", () => {
  it.each(CATALOGUES)(
    "names all eight entries in %s, distinctly",
    (locale, messages) => {
      const content = contentFor(locale, messages);
      const names = PALETTE_ENTRY_IDS.map((entryId) =>
        content.finishName(entryId),
      );

      expect(names).toHaveLength(8);
      // Distinct, because the failure a totality sweep alone would pass is a resolver whose arms all
      // name one leaf: eight chips reading *Alb* renders, resolves and is wrong.
      expect(new Set(names).size).toBe(8);
      for (const [index, name] of names.entries()) {
        const entryId = PALETTE_ENTRY_IDS[index];
        expect(name, `${locale}:${String(entryId)}`).not.toBe("");
        expect(name, `${locale}:${String(entryId)}`).not.toContain("finish.");
      }
    },
  );

  it.each(CATALOGUES)(
    "reads each name off that entry's own %s leaf",
    (locale, messages) => {
      const content = contentFor(locale, messages);

      for (const entryId of PALETTE_ENTRY_IDS) {
        // An entry id *is* the path under `finish.`, so the shared walk reaches the same leaf the
        // hand-indexed `finish[group][name]` did — and refuses a subtree where that one, through its
        // cast, would have handed a nested object to `toBeDefined` and passed.
        const declared = leafAt(messages, `finish.${entryId}`);
        expect(declared, `${locale}:${entryId}`).toBeDefined();
        expect(content.finishName(entryId), `${locale}:${entryId}`).toBe(
          declared,
        );
      }
    },
  );

  it.each(CATALOGUES)(
    "says a colour out loud in %s and never a supplier code",
    (locale, messages) => {
      // The owner's ruling, kept where the words now are: the palette is a reference, not a
      // specification, so a customer reads *Gri Havanna* and never *U755 ST9*. A supplier code carries
      // digits and a decor name does not, which is what makes this falsifiable rather than a comment.
      const content = contentFor(locale, messages);

      for (const entry of PALETTE_ENTRIES) {
        const name = content.finishName(entry.entryId);
        expect(name, `${locale}:${entry.entryId}`).not.toMatch(/\d/);
        if (entry.supplierCode.kind === "catalogue") {
          expect(name, `${locale}:${entry.entryId}`).not.toBe(
            entry.supplierCode.code,
          );
        }
      }
    },
  );
});
