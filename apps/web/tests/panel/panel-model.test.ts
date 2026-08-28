import { describe, expect, it } from "vitest";

import { describePanel, type PanelSection } from "@/panel/panel-model";
import { ro } from "@/content/ro";

import {
  cornerReturnMeta,
  occupiedMeta,
  offer,
  offers,
  REFUSAL,
  slotMeta,
} from "../support/selection-meta";

import type { SelectionMeta } from "@lemnaria/configurator-domain";

import { noWidthIsFree, widthOptionRow } from "../support/width-options";

/** The panel as the app builds it: probe attached, nothing refused. Each test turns off only what
 *  it is about. */
function panelFor(
  meta: SelectionMeta | undefined,
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
) {
  return describePanel({
    meta,
    offers: [],
    rejection: null,
    widthOptions: meta ? noWidthIsFree(meta.widthMm, meta.sizesMm) : [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
    ...overrides,
  });
}

function openPanelFor(
  meta: SelectionMeta | undefined,
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
) {
  const panel = panelFor(meta, overrides);
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

function sectionKinds(sections: readonly PanelSection[]): string[] {
  return sections.map((section) => section.kind);
}

function findSection<TKind extends PanelSection["kind"]>(
  sections: readonly PanelSection[],
  kind: TKind,
): Extract<PanelSection, { kind: TKind }> | undefined {
  return sections.find(
    (section): section is Extract<PanelSection, { kind: TKind }> =>
      section.kind === kind,
  );
}

describe("describePanel — when the panel is open at all", () => {
  it("is closed when nothing is selected", () => {
    expect(panelFor(undefined)).toEqual({ kind: "closed" });
  });

  it("is closed when the selection no longer resolves, rather than empty", () => {
    expect(panelFor(undefined, { rejection: REFUSAL }).kind).toBe("closed");
  });

  it("renders §9's header line from the selection's own numbers", () => {
    const panel = openPanelFor(occupiedMeta());
    expect(panel.header).toEqual({
      label: "Corp bază 2 uși",
      detail: "Perete A · bază · 600 × 860 mm",
    });
  });
});

describe("describePanel — §9's section order", () => {
  it("renders rejection, replace, finish, handle and width in that order", () => {
    const panel = openPanelFor(occupiedMeta(), {
      offers: offers(3),
      rejection: REFUSAL,
    });
    expect(sectionKinds(panel.sections)).toEqual([
      "rejection",
      "replace",
      "finish",
      "handle",
      "width",
    ]);
  });

  // The banner authored inside the width section was invisible on exactly the fixed-width bodies
  // that refuse most, which is why §9 moved it to the top of the body.
  it("puts the banner first on a body that has no width section at all", () => {
    // The banner and the structural explanation coexist and are not interchangeable: the banner
    // says what the last action did, the explanation says what this body permanently is. What is
    // asserted here is the ORDER — the banner comes first, whatever else the body carries.
    const panel = openPanelFor(cornerReturnMeta(), { rejection: REFUSAL });
    expect(sectionKinds(panel.sections)).toEqual(["rejection", "structural"]);
  });

  it("renders no banner when nothing was refused", () => {
    const panel = openPanelFor(occupiedMeta(), { offers: offers(2) });
    expect(findSection(panel.sections, "rejection")).toBeUndefined();
  });
});

describe("describePanel — sections render only when their flag is true", () => {
  it("gives a corner return no finish, handle, width or replace section", () => {
    const panel = openPanelFor(cornerReturnMeta(), { offers: offers(4) });
    expect(sectionKinds(panel.sections)).toEqual(["structural"]);
  });

  // §11 row 16 requires a refusal to explain itself, and a body whose every flag is false never
  // refuses anything — nothing is clicked, so nothing is rejected. Without a standing explanation
  // such a panel is a header over an empty scroll body, which is the failure this guards.
  it("explains why a structural body offers nothing, instead of showing an empty body", () => {
    const panel = openPanelFor(cornerReturnMeta(), { offers: offers(4) });
    expect(findSection(panel.sections, "structural")).toEqual({
      kind: "structural",
      title: ro.panel.structuralTitle,
      message: ro.panel.structuralReasons.corner,
    });
  });

  // The explanation belongs to a *declared* reason, never to "four flags happen to be false": an
  // undeclared body offering nothing is a catalogue gap, and it stays visible as one.
  it("adds no explanation when the selection offers nothing and declares no reason", () => {
    const panel = openPanelFor(
      occupiedMeta({
        canFinish: false,
        canHandle: false,
        canWidth: false,
        canReplace: false,
      }),
      { offers: offers(4) },
    );
    expect(panel.sections).toEqual([]);
  });

  // The reason is an explanation of last resort: a body that still offers something says so with
  // the sections it offers, and adding a second voice would contradict them.
  it("keeps the explanation out of a panel that does offer something", () => {
    const panel = openPanelFor(occupiedMeta({ structuralReason: "corner" }), {
      offers: offers(2),
    });
    expect(sectionKinds(panel.sections)).not.toContain("structural");
  });

  it("hides finish, handle and width on an empty slot", () => {
    const panel = openPanelFor(slotMeta(), { offers: offers(10) });
    expect(sectionKinds(panel.sections)).toEqual(["replace"]);
  });

  it("drops each section as its own flag goes false, and no others with it", () => {
    const cases = [
      { flags: { canFinish: false }, missing: "finish" },
      { flags: { canHandle: false }, missing: "handle" },
      { flags: { canWidth: false }, missing: "width" },
      { flags: { canReplace: false }, missing: "replace" },
    ] as const;
    for (const { flags, missing } of cases) {
      const panel = openPanelFor(occupiedMeta(flags), { offers: offers(2) });
      expect(sectionKinds(panel.sections)).not.toContain(missing);
      expect(panel.sections.length).toBe(3);
    }
  });
});

describe("describePanel — the replace list", () => {
  // §11 row 24: a fallback set once produced six guaranteed-refused rows for the hob.
  it("renders no replace section at all for an unknown kind, even with offers", () => {
    const panel = openPanelFor(occupiedMeta({ kind: "mystery_unit" }), {
      offers: offers(6),
    });
    expect(findSection(panel.sections, "replace")).toBeUndefined();
  });

  // The void's own `kind` is "void", which is not in the kind table. Row 24 must not swallow it.
  it("still renders the list for an empty slot, whose kind is never a catalogue kind", () => {
    const panel = openPanelFor(slotMeta(), { offers: offers(10) });
    expect(findSection(panel.sections, "replace")?.rows).toHaveLength(10);
  });

  it("titles an occupied body's list as a replacement and a slot's as an insertion", () => {
    const occupied = openPanelFor(occupiedMeta(), { offers: offers(1) });
    const slot = openPanelFor(slotMeta(), { offers: offers(1) });
    expect(findSection(occupied.sections, "replace")?.title).toBe(
      "Înlocuiește",
    );
    expect(findSection(slot.sections, "replace")?.title).toBe(
      "Pune un corp aici",
    );
  });

  it("derives the count line from the rows it actually rendered", () => {
    for (const count of [1, 2, 5, 10, 15]) {
      const panel = openPanelFor(slotMeta(), { offers: offers(count) });
      const section = findSection(panel.sections, "replace");
      expect(section?.rows).toHaveLength(count);
      expect(section?.countLine).toContain(String(count));
      expect(section?.countLine).toContain("700 × 860 mm");
    }
  });

  it("counts an occupied body's set by band and width, per §9's example", () => {
    const panel = openPanelFor(occupiedMeta(), { offers: offers(5) });
    expect(findSection(panel.sections, "replace")?.countLine).toBe(
      "5 corpuri bază de 600",
    );
  });

  // The header reads "rând de sus", which is right in a header and ungrammatical mid-sentence.
  // The count line therefore takes the normalised band's own word and agrees it with the count.
  it("words the band for the sentence rather than reusing the header's label", () => {
    const topRow = occupiedMeta({
      band: "top",
      bandLabel: "rând de sus",
      widthMm: 700,
    });
    const lineFor = (count: number) =>
      findSection(
        openPanelFor(topRow, { offers: offers(count) }).sections,
        "replace",
      )?.countLine;
    expect(lineFor(5)).toBe("5 corpuri suspendate de 700");
    expect(lineFor(1)).toBe("1 corp suspendat de 700");
    expect(lineFor(5) ?? "").not.toContain("rând de sus");
    expect(
      findSection(openPanelFor(topRow).sections, "replace")?.emptyLine,
    ).toContain("corp suspendat");
  });

  // Romanian takes "de" from twenty upward. The catalogue cannot reach twenty today, so this is
  // the boundary that would go ungrammatical unnoticed on the day it grows.
  it("pluralises across Romanian's three count bands", () => {
    const lineFor = (count: number) =>
      findSection(
        openPanelFor(occupiedMeta(), { offers: offers(count) }).sections,
        "replace",
      )?.countLine;
    expect(lineFor(1)).toContain("1 corp bază");
    expect(lineFor(19)).toContain("19 corpuri bază");
    expect(lineFor(20)).toContain("20 de corpuri bază");
    expect(lineFor(21)).toContain("21 de corpuri bază");
  });

  it("uses the singular for one offer", () => {
    const panel = openPanelFor(occupiedMeta(), { offers: offers(1) });
    expect(findSection(panel.sections, "replace")?.countLine).toBe(
      "1 corp bază de 600",
    );
  });

  // §9: a zero-result list shows a sentence saying what to clear, never a bare "0".
  it("replaces the count line with a sentence when nothing fits", () => {
    for (const meta of [occupiedMeta(), slotMeta()]) {
      const section = findSection(openPanelFor(meta).sections, "replace");
      expect(section?.rows).toEqual([]);
      expect(section?.countLine).toBeUndefined();
      expect(section?.emptyLine ?? "").toMatch(/Șterge/);
      expect(section?.emptyLine ?? "").not.toMatch(/\b0\b/);
    }
  });

  it("badges the current row and no other", () => {
    const panel = openPanelFor(occupiedMeta(), {
      offers: [
        offer({ buildId: "base-cabinet" }),
        offer({ buildId: "base-cabinet", isCurrent: true }),
        offer({ buildId: "base-3drawer" }),
      ],
    });
    const rows = findSection(panel.sections, "replace")?.rows ?? [];
    expect(
      rows.filter((row) => row.isCurrent).map((row) => row.buildId),
    ).toEqual(["base-cabinet"]);
  });

  it("shows each row the size it would build to in this opening", () => {
    const panel = openPanelFor(slotMeta(), {
      offers: [
        offer({ verdict: { status: "offered", widthMm: 700, heightMm: 1850 } }),
      ],
    });
    expect(findSection(panel.sections, "replace")?.rows[0]?.secondaryLine).toBe(
      "700 × 1850 mm",
    );
  });

  // "Never offer what cannot be satisfied": until the scene mounts, `insertBody` refuses every
  // row, so every row is disabled with that reason instead of tapped and then refused.
  it("disables every row with a reason while the body probe is unattached", () => {
    const panel = openPanelFor(slotMeta(), {
      offers: offers(4),
      isBodyProbeAttached: false,
    });
    const rows = findSection(panel.sections, "replace")?.rows ?? [];
    expect(rows).toHaveLength(4);
    for (const row of rows)
      expect([row.isDisabled, row.secondaryLine]).toEqual([
        true,
        ro.panel.probeUnavailable,
      ]);
  });

  // Frame 2B: the drawing is what tells a full-height column apart from a base cabinet at a glance,
  // so the model resolves it and the component paints it. `editor-panel.tsx` decides nothing.
  it("gives each row the URL of its own body's drawing", () => {
    const panel = openPanelFor(slotMeta(), {
      offers: [
        offer({ buildId: "base-cabinet" }),
        offer({ buildId: "tall-pantry", band: "column" }),
      ],
    });
    const rows = findSection(panel.sections, "replace")?.rows ?? [];
    expect(rows.map((row) => row.thumbnailUrl)).toEqual([
      "/cabinets/base-2-door.svg",
      "/cabinets/tall-pantry.svg",
    ]);
  });

  // §13.4's background-image paints nothing here, which is why the catalogue-wide existence check
  // in `cabinet-thumbnails.test.ts` is the gate rather than this.
  it("leaves the thumbnail absent for a body no drawing was vendored for", () => {
    const panel = openPanelFor(slotMeta(), {
      offers: [offer({ buildId: "not-a-vendored-body" })],
    });
    expect(
      findSection(panel.sections, "replace")?.rows[0]?.thumbnailUrl,
    ).toBeUndefined();
  });

  // A disabled row keeps its drawing: it is still telling the customer which cabinet the row is
  // about, and removing it would make an unavailable list unreadable rather than merely dimmed.
  it("keeps the drawing on a row the browser cannot click", () => {
    const panel = openPanelFor(slotMeta(), {
      offers: [offer({ buildId: "base-sink" })],
      isBodyProbeAttached: false,
    });
    expect(findSection(panel.sections, "replace")?.rows[0]).toMatchObject({
      isDisabled: true,
      thumbnailUrl: "/cabinets/base-sink.svg",
    });
  });

  it("leaves every row clickable once the probe is attached", () => {
    const rows =
      findSection(
        openPanelFor(slotMeta(), { offers: offers(4) }).sections,
        "replace",
      )?.rows ?? [];
    for (const row of rows) expect(row.isDisabled).toBe(false);
  });
});

describe("describePanel — finish and handle chips", () => {
  it("offers every finish and marks the applied one", () => {
    const chips =
      findSection(
        openPanelFor(occupiedMeta({ finish: "sage" })).sections,
        "finish",
      )?.chips ?? [];
    expect(chips).toHaveLength(5);
    expect(
      chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["sage"]);
  });

  it("marks nothing as chosen when no finish was applied", () => {
    const chips =
      findSection(openPanelFor(occupiedMeta()).sections, "finish")?.chips ?? [];
    expect(chips.some((chip) => chip.isActive)).toBe(false);
  });

  // §6.5 / §11 row 13: with nothing chosen, the marked chip is the one the scene is rendering.
  it("marks §6.5's default handle, and says the mark came from the default", () => {
    const section = findSection(
      openPanelFor(occupiedMeta({ defaultHandle: "push" })).sections,
      "handle",
    );
    expect(
      section?.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["push"]);
    expect(section?.note ?? "").toContain("Push-to-open");
  });

  it("lets a chosen handle win over the default, and drops the note", () => {
    const section = findSection(
      openPanelFor(occupiedMeta({ defaultHandle: "push", handle: "black" }))
        .sections,
      "handle",
    );
    expect(
      section?.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["black"]);
    expect(section?.note).toBeUndefined();
  });
});

describe("describePanel — the width section, judged by the engine (M5 wave 5D)", () => {
  // The chip set is no longer this module's to derive. `widthOptionsFor` answers per **column** —
  // ADR 0031's scope — while `meta` describes one body, so the panel renders the judged list it is
  // handed and nothing else. What is asserted here is the mapping: verdict to §9's vocabulary.
  it("renders one chip per option, in the engine's own order and states", () => {
    const section = findSection(
      openPanelFor(occupiedMeta(), {
        widthOptions: widthOptionRow({
          currentMm: 600,
          freeMm: [800],
          blockedMm: [400],
        }),
      }).sections,
      "width",
    );
    expect(section?.valueLabel).toBe("600 mm");
    expect(section?.chips.map((chip) => [chip.label, chip.state])).toEqual([
      ["400", "blocked"],
      ["600", "active"],
      ["800", "free"],
    ]);
  });

  // M4 shipped every non-current chip blocked and three tests pinned that, because no resize
  // command existed and a free chip was a clickable promise of a move nothing implements. 5C built
  // the command; the promise is now keepable, and the rule that replaces the old one is the one the
  // milestone stated: a chip is free **iff** `setWidth` at that width would succeed. Only `free` is
  // clickable, which is the half that makes it a promise rather than a colour.
  it("makes a chip clickable exactly when the engine said the resize would succeed", () => {
    const section = findSection(
      openPanelFor(occupiedMeta(), {
        widthOptions: widthOptionRow({
          currentMm: 600,
          freeMm: [800],
          blockedMm: [400],
        }),
      }).sections,
      "width",
    );
    expect(
      section?.chips.map((chip) => [chip.widthMm, chip.isDisabled]),
    ).toEqual([
      [400, true],
      [600, true],
      [800, false],
    ]);
  });

  // §13.1: greyed and unclickable **with the reason**. The sentence is the engine's own — the
  // refusal `setWidth` produced — so the section invents no vocabulary of its own, and a chip that
  // works carries no sentence at all.
  it("puts the engine's refusal under a blocked chip, and nothing under the others", () => {
    const section = findSection(
      openPanelFor(occupiedMeta(), {
        widthOptions: widthOptionRow({
          currentMm: 600,
          freeMm: [800],
          blockedMm: [400],
          label: "Corp suspendat",
        }),
      }).sections,
      "width",
    );
    const reasons = new Map(
      section?.chips.map((chip) => [chip.widthMm, chip.reason]),
    );
    expect(reasons.get(400)).toContain("Corp suspendat");
    expect(reasons.get(600)).toBeUndefined();
    expect(reasons.get(800)).toBeUndefined();
  });

  // §9 defines `canWidth` as "selected · not empty · not `fixedWidth`" and says nothing about the
  // size set, so an empty option list has to be declined by the SECTION rather than by the flag. The
  // hazard is treating a section that offers nothing to choose as a correct render: a width
  // heading over no chips is a dead control, so the section must be absent entirely.
  it("renders no width section at all when the engine offers no options", () => {
    const panel = openPanelFor(occupiedMeta(), { widthOptions: [] });
    expect(findSection(panel.sections, "width")).toBeUndefined();
    expect(sectionKinds(panel.sections)).not.toContain("width");
  });
});

describe("describePanel — the footer", () => {
  it("offers delete only when the selection says it can be deleted", () => {
    expect(openPanelFor(occupiedMeta()).footer.canDelete).toBe(true);
    expect(openPanelFor(slotMeta()).footer.canDelete).toBe(false);
    expect(openPanelFor(cornerReturnMeta()).footer.canDelete).toBe(false);
  });
});
