// Adversarial pass over §9's panel model: the combinations, sweeps and anti-invariants that the
// implementer's own suite states as examples.
//
// Every test here attacks an *assumption* rather than a line: that the flag gate is exhaustive, that
// the banner is first in every shape and not only in the two that were written down, that the count
// line survives a full sweep rather than five hand-picked counts, and that an unknown `kind` is
// decided by a table lookup that cannot answer "known" for a key nobody put in it.
import {
  FinishSchema,
  HandleSchema,
  type SelectionMeta,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type PanelSection } from "@/panel/panel-model";

import {
  occupiedMeta,
  offer,
  offers,
  REFUSAL,
  slotMeta,
} from "../support/selection-meta";

/** §9's order, as a list, so a test can assert "a subsequence of this" rather than restate it. */
const SECTION_ORDER: readonly PanelSection["kind"][] = [
  "rejection",
  "replace",
  "finish",
  "handle",
  "width",
];

function openPanel(
  meta: SelectionMeta,
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
) {
  const panel = describePanel({
    meta,
    offers: [],
    rejection: null,
    isBodyProbeAttached: true,
    ...overrides,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

function kindsOf(sections: readonly PanelSection[]): string[] {
  return sections.map((section) => section.kind);
}

function replaceIn(sections: readonly PanelSection[]) {
  return sections.find(
    (section): section is Extract<PanelSection, { kind: "replace" }> =>
      section.kind === "replace",
  );
}

function widthIn(sections: readonly PanelSection[]) {
  return sections.find(
    (section): section is Extract<PanelSection, { kind: "width" }> =>
      section.kind === "width",
  );
}

const BOOLEANS = [false, true] as const;

/** Every combination of §9's four section flags, with and without a refusal. */
/** The four §9 flags, without the `rejected` axis — for the sweeps that set the refusal
 *  themselves and would otherwise have to destructure it away unused. */
function sectionFlagsOf(
  combination: ReturnType<typeof flagMatrix> extends Generator<infer T>
    ? T
    : never,
) {
  const { canReplace, canFinish, canHandle, canWidth } = combination;
  return { canReplace, canFinish, canHandle, canWidth };
}

function* flagMatrix() {
  for (const canReplace of BOOLEANS)
    for (const canFinish of BOOLEANS)
      for (const canHandle of BOOLEANS)
        for (const canWidth of BOOLEANS)
          for (const rejected of BOOLEANS)
            yield { canReplace, canFinish, canHandle, canWidth, rejected };
}

describe("§9's section gate — every combination, not the three that were written down", () => {
  it("renders exactly the sections whose flags are true, always in §9's order", () => {
    let swept = 0;
    for (const combination of flagMatrix()) {
      const { rejected, ...flags } = combination;
      const panel = openPanel(occupiedMeta(flags), {
        offers: offers(3),
        rejection: rejected ? REFUSAL : null,
      });
      const expected = [
        ...(rejected ? ["rejection"] : []),
        ...(flags.canReplace ? ["replace"] : []),
        ...(flags.canFinish ? ["finish"] : []),
        ...(flags.canHandle ? ["handle"] : []),
        ...(flags.canWidth ? ["width"] : []),
      ];
      expect(kindsOf(panel.sections)).toEqual(expected);
      swept += 1;
    }
    expect(swept).toBe(32);
  });

  it("never renders two sections of the same kind, and never one outside §9's five", () => {
    let swept = 0;
    for (const combination of flagMatrix()) {
      const { rejected, ...flags } = combination;
      const kinds = kindsOf(
        openPanel(occupiedMeta(flags), {
          offers: offers(2),
          rejection: rejected ? REFUSAL : null,
        }).sections,
      );
      expect(new Set(kinds).size).toBe(kinds.length);
      for (const kind of kinds) expect(SECTION_ORDER).toContain(kind);
      swept += 1;
    }
    expect(swept).toBe(32);
  });

  // §9's WHY: authored inside the width section the banner was invisible on exactly the
  // fixed-width bodies that refuse most. "First" has to hold when it is the only section too.
  it("puts the banner first in every shape a refusal can arrive in", () => {
    let swept = 0;
    for (const combination of flagMatrix()) {
      if (!combination.rejected) continue;
      const flags = sectionFlagsOf(combination);
      for (const meta of [
        occupiedMeta(flags),
        slotMeta({ canReplace: flags.canReplace }),
      ]) {
        const panel = openPanel(meta, {
          offers: offers(2),
          rejection: REFUSAL,
        });
        expect(panel.sections[0]?.kind).toBe("rejection");
        expect(
          kindsOf(panel.sections).filter((k) => k === "rejection"),
        ).toEqual(["rejection"]);
        swept += 1;
      }
    }
    expect(swept).toBe(32);
  });

  it("renders no banner at all when nothing was refused, whatever else is on", () => {
    for (const combination of flagMatrix()) {
      const flags = sectionFlagsOf(combination);
      const panel = openPanel(occupiedMeta(flags), { offers: offers(2) });
      expect(kindsOf(panel.sections)).not.toContain("rejection");
    }
  });

  // §9: "Empty voids hide Finisaj, Mâner, Lățime — there is nothing to finish."
  it("shows an empty slot nothing but its list, whatever the offer count", () => {
    for (const count of [0, 1, 12]) {
      const panel = openPanel(slotMeta(), { offers: offers(count) });
      expect(kindsOf(panel.sections)).toEqual(["replace"]);
    }
  });
});

describe("§11 row 24 — an unknown kind renders no replace section", () => {
  const unknown = [
    "mystery_unit",
    "",
    " ",
    "base_cabinet ",
    "BASE_CABINET",
    "void",
  ];

  it("renders no replace section for any kind the catalogue does not name", () => {
    for (const kind of unknown) {
      const panel = openPanel(occupiedMeta({ kind }), { offers: offers(6) });
      expect(replaceIn(panel.sections)).toBeUndefined();
    }
  });

  it("still renders the other sections for an unknown kind", () => {
    const panel = openPanel(occupiedMeta({ kind: "mystery_unit" }), {
      offers: offers(6),
    });
    expect(kindsOf(panel.sections)).toEqual(["finish", "handle", "width"]);
  });

  // A void's own kind is "void", which is not a catalogue kind. Row 24 must not swallow it — the
  // slot's whole purpose is the "Pune un corp aici" list.
  it("does not swallow an empty slot, whose kind is never a catalogue kind", () => {
    for (const kind of ["void", "", "mystery_unit"]) {
      const panel = openPanel(slotMeta({ kind }), { offers: offers(4) });
      expect(replaceIn(panel.sections)?.rows).toHaveLength(4);
    }
  });

  // §11 row 24: *any* kind the catalogue does not name renders no replace section. The names below
  // are the ones a membership test can wrongly call "known" — every JavaScript object inherits them
  // — so they are the shape of unknown kind that makes row 24 fail open, and the only one a reader
  // would not think to try.
  it("treats an Object.prototype member as the unknown kind it is", () => {
    for (const kind of [
      "toString",
      "constructor",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "__proto__",
    ]) {
      const panel = openPanel(occupiedMeta({ kind }), { offers: offers(6) });
      expect(replaceIn(panel.sections)).toBeUndefined();
    }
  });
});

describe("§9's derived count line — swept, not sampled", () => {
  const COUNTS = Array.from({ length: 26 }, (_unused, index) => index);

  it("carries a count line or an empty line, never both and never neither", () => {
    let swept = 0;
    for (const count of COUNTS) {
      for (const meta of [occupiedMeta(), slotMeta()]) {
        const section = replaceIn(
          openPanel(meta, { offers: offers(count) }).sections,
        );
        expect(section).toBeDefined();
        const hasCount = section?.countLine !== undefined;
        const hasEmpty = section?.emptyLine !== undefined;
        expect(hasCount).toBe(count > 0);
        expect(hasEmpty).toBe(count === 0);
        expect(hasCount === hasEmpty).toBe(false);
        swept += 1;
      }
    }
    expect(swept).toBe(52);
  });

  it("never puts a bare 0 in either line", () => {
    let swept = 0;
    for (const count of COUNTS) {
      for (const meta of [occupiedMeta(), slotMeta()]) {
        const section = replaceIn(
          openPanel(meta, { offers: offers(count) }).sections,
        );
        const line = section?.countLine ?? section?.emptyLine ?? "";
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toMatch(/(^|\s)0(\s|$)/);
        swept += 1;
      }
    }
    expect(swept).toBe(52);
  });

  it("counts exactly the rows it rendered, for every count in the sweep", () => {
    for (const count of COUNTS) {
      const section = replaceIn(
        openPanel(slotMeta(), { offers: offers(count) }).sections,
      );
      expect(section?.rows).toHaveLength(count);
      if (count > 0)
        expect(section?.countLine?.startsWith(`${String(count)} `)).toBe(true);
    }
  });

  // Romanian counts in three bands: one, two to nineteen, and twenty upward, which takes "de".
  it("pluralises across the three bands for every count in the sweep", () => {
    for (const count of COUNTS) {
      if (count === 0) continue;
      const line =
        replaceIn(openPanel(occupiedMeta(), { offers: offers(count) }).sections)
          ?.countLine ?? "";
      if (count === 1) expect(line).toBe("1 corp bază de 600");
      else if (count < 20)
        expect(line).toBe(`${String(count)} corpuri bază de 600`);
      else expect(line).toBe(`${String(count)} de corpuri bază de 600`);
    }
  });

  // Romanian takes "de" whenever the last two digits are 00 or 20–99, so 100 is "100 de corpuri".
  // A round hundred is the boundary a last-two-digits test gets wrong most easily, because 00 reads
  // as "under twenty" unless the rule is written for it — §9's count line is derived copy, and an
  // ungrammatical one is a visible defect.
  it("takes 'de' at a round hundred, as Romanian does", () => {
    for (const count of [100, 200, 1000]) {
      const line =
        replaceIn(openPanel(occupiedMeta(), { offers: offers(count) }).sections)
          ?.countLine ?? "";
      expect(line).toBe(`${String(count)} de corpuri bază de 600`);
    }
  });

  it("words the band for the sentence and leaves the raw label to the header", () => {
    const topRow = occupiedMeta({
      band: "top",
      bandLabel: "rând de sus",
      widthMm: 700,
    });
    const panel = openPanel(topRow, { offers: offers(5) });
    const section = replaceIn(panel.sections);
    expect(panel.header.detail).toContain("rând de sus");
    expect(section?.countLine).toBe("5 corpuri suspendate de 700");
    expect(section?.countLine).not.toContain("rând de sus");
  });

  it("says what to clear in the zero-result sentence, for both shapes", () => {
    for (const meta of [occupiedMeta(), slotMeta()]) {
      const line = replaceIn(openPanel(meta).sections)?.emptyLine ?? "";
      expect(line).toMatch(/Șterge/);
      expect(line).not.toMatch(/\b0\b/);
      expect(line.trim().endsWith(".")).toBe(true);
    }
  });
});

describe("the panel adds no row and drops none", () => {
  it("mirrors the offer list exactly, in order, at every count in the sweep", () => {
    for (const count of [0, 1, 2, 7, 20]) {
      const list = offers(count);
      const section = replaceIn(
        openPanel(slotMeta(), { offers: list }).sections,
      );
      expect(section?.rows.map((row) => row.buildId)).toEqual(
        list.map((candidate) => candidate.buildId),
      );
    }
  });

  it("badges exactly the rows the offer list marked current, and no others", () => {
    const list = [
      offer({ buildId: "a" }),
      offer({ buildId: "b", isCurrent: true }),
      offer({ buildId: "c" }),
    ];
    const rows = replaceIn(
      openPanel(occupiedMeta(), { offers: list }).sections,
    )?.rows;
    expect(rows?.map((row) => row.isCurrent)).toEqual([false, true, false]);
  });

  // §9: "never by trying and catching a refusal" — with no probe the insert command refuses every
  // row, so every row carries its reason before it is tapped.
  it("disables every row with a reason while the probe is unattached, in both shapes", () => {
    for (const meta of [occupiedMeta(), slotMeta()]) {
      const rows =
        replaceIn(
          openPanel(meta, { offers: offers(5), isBodyProbeAttached: false })
            .sections,
        )?.rows ?? [];
      expect(rows).toHaveLength(5);
      for (const row of rows)
        expect([row.isDisabled, row.secondaryLine]).toEqual([
          true,
          ro.panel.probeUnavailable,
        ]);
    }
  });

  it("keeps the count line honest while every row is disabled", () => {
    const section = replaceIn(
      openPanel(slotMeta(), { offers: offers(5), isBodyProbeAttached: false })
        .sections,
    );
    expect(section?.countLine).toBe("5 corpuri intră în 700 × 860 mm");
  });
});

describe("the width section, while M5's resize command does not exist", () => {
  it("never marks a chip free, for any size list", () => {
    // The body's own 600 is in every set here on purpose: the chip merge has its own cases below,
    // and this sweep is about the `free` state alone.
    for (const sizes of [
      [600],
      [400, 600],
      [300, 400, 600, 800],
      [400, 600, 800, 900, 1000],
    ]) {
      const section = widthIn(
        openPanel(occupiedMeta({ sizesMm: sizes })).sections,
      );
      expect(section?.chips.some((chip) => chip.state === "free")).toBe(false);
      expect(section?.chips.map((chip) => chip.widthMm)).toEqual(sizes);
    }
  });

  // §9's section 6 is "chips from `sizes`", so a section with no chips offers nothing to choose.
  // An empty size set must therefore render no width section at all, not an empty one.
  it("renders no section at all when the body has no sizes", () => {
    expect(widthIn(openPanel(occupiedMeta({ sizesMm: [] })).sections)).toBe(
      undefined,
    );
  });

  // §9 gives a chip three states and assumes the current width is one of them, so EXACTLY one chip
  // is active — never zero. A `widthFlex: "fit"` body builds to its OPENING, which need not be a
  // member of `sizesMm` (300 and 570 below), which is why the body's own width joins the chip set.
  // `<= 1` would pass vacuously at zero and miss precisely that case.
  it("marks exactly one chip active, and only the body's own width", () => {
    for (const widthMm of [300, 400, 570, 600, 800]) {
      const section = widthIn(
        openPanel(occupiedMeta({ widthMm, sizesMm: [400, 600, 800] })).sections,
      );
      const active = section?.chips.filter((chip) => chip.state === "active");
      expect([widthMm, active?.length]).toEqual([widthMm, 1]);
      expect(active?.[0]?.widthMm).toBe(widthMm);
      expect(section?.valueLabel).toBe(`${String(widthMm)} mm`);
      // The merged chip keeps the row sorted rather than appended at the end.
      const widths = section?.chips.map((chip) => chip.widthMm) ?? [];
      expect(widths).toEqual([...widths].sort((left, right) => left - right));
    }
  });
});

describe("finish and handle chips", () => {
  it("offers every schema option exactly once, in both sections", () => {
    const panel = openPanel(occupiedMeta());
    const finish = panel.sections.find((s) => s.kind === "finish");
    const handle = panel.sections.find((s) => s.kind === "handle");
    expect(
      finish?.kind === "finish" ? finish.chips.map((chip) => chip.value) : [],
    ).toEqual([...FinishSchema.options]);
    expect(
      handle?.kind === "handle" ? handle.chips.map((chip) => chip.value) : [],
    ).toEqual([...HandleSchema.options]);
  });

  it("marks the chosen handle and drops the default note, for every option", () => {
    for (const handle of HandleSchema.options) {
      for (const defaultHandle of HandleSchema.options) {
        const section = openPanel(
          occupiedMeta({ handle, defaultHandle }),
        ).sections.find((s) => s.kind === "handle");
        if (section?.kind !== "handle") throw new Error("no handle section");
        expect(
          section.chips.filter((chip) => chip.isActive).map((c) => c.value),
        ).toEqual([handle]);
        expect(section.note).toBeUndefined();
      }
    }
  });

  it("falls back to §6.5's default and says so, for every default", () => {
    for (const defaultHandle of HandleSchema.options) {
      const section = openPanel(occupiedMeta({ defaultHandle })).sections.find(
        (s) => s.kind === "handle",
      );
      if (section?.kind !== "handle") throw new Error("no handle section");
      expect(
        section.chips.filter((chip) => chip.isActive).map((c) => c.value),
      ).toEqual([defaultHandle]);
      expect(section.note).toContain(ro.panel.handleLabels[defaultHandle]);
    }
  });

  it("marks exactly one finish when one is applied and none when it is not", () => {
    for (const finish of FinishSchema.options) {
      const section = openPanel(occupiedMeta({ finish })).sections.find(
        (s) => s.kind === "finish",
      );
      if (section?.kind !== "finish") throw new Error("no finish section");
      expect(
        section.chips.filter((chip) => chip.isActive).map((c) => c.value),
      ).toEqual([finish]);
    }
    const bare = openPanel(occupiedMeta()).sections.find(
      (s) => s.kind === "finish",
    );
    expect(
      bare?.kind === "finish" ? bare.chips.some((chip) => chip.isActive) : true,
    ).toBe(false);
  });
});

describe("the closed panel", () => {
  it("stays closed whatever else arrives with it", () => {
    for (const rejection of [null, REFUSAL]) {
      for (const list of [offers(0), offers(4)]) {
        expect(
          describePanel({
            meta: undefined,
            offers: list,
            rejection,
            isBodyProbeAttached: false,
          }),
        ).toEqual({ kind: "closed" });
      }
    }
  });
});
