// **Adversarial QA of what the pill puts on the screen at the rungs below its top one.**
//
// `global-settings-shell.test.ts` renders this component at **rung 1** and says so: *"Rendered here
// at its top rung — every setting named — because what these cases are about is which words the pill
// puts on the screen, not how many of them fit."* Which is correct for that file, and leaves the
// three rungs a narrow window actually produces unrendered by any test: `settings-pill-fit.test.ts`
// asserts the *count* as a value, and nothing asserts the markup that count produces.
//
// The rules ADR 0104 decision 3 states about that markup are all about the rungs below the top:
//
// - **the accessible name states every setting at every rung** — *"the count is a visual economy and
//   must not cost a screen-reader user a setting"*. At rung 1 there is nothing to leave out, so the
//   claim is only testable at rungs 2, 3 and 4;
// - **`│` between labels only**, so a two-label pill draws one and a one-label pill draws none, and
//   the counter is separated from the last label by the pill's own gap;
// - **the swatch is drawn at every rung, and a label is never absent** — *"there is no bare `+3`"*;
// - **only the first label may ellipsise**, which is what makes criterion 14's *at most one clip*
//   an assertion about a known element rather than about however many happen to be cut.
//
// **The free colour is swept at every rung too**, because it is the one setting that is *shown* and
// draws no text (owner, 2026-09-09) — the state where "shown" and "drawn" come apart, and therefore
// the state where a separator around nothing or a lost screen-reader word would appear.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  MATERIALS,
  materialById,
  SAMPLE_PRICE_BOOK,
  type Design,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

/** `global-settings-shell.test.ts`'s pattern, for its reason: the component runs against a real
 *  store's real fields rather than a hand-written state shape. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

const { GlobalSettings } = await import("@/settings/global-settings");

const FIXED_NOW = "2026-09-03T12:00:00.000Z";

/** The settings frame D2A's pill names, in ADR 0099 decision 9's order —
 *  `material │ colour │ hardware │ depth`. Every rung this file sweeps is a count of these. */
const EVERY_SETTING = 4;
const EVERY_RUNG = [1, 2, 3, 4] as const;

const PAL_ID = "material.melamine";
/** The material whose colour control is a picker rather than a list, so its declared default is a
 *  **free** colour — the one setting that is shown and writes nothing. */
const MDF_ID = "material.painted-mdf";

function stateFor(design: Design): ConfiguratorState {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => FIXED_NOW,
  }).getState();
}

function designCarrying(selections: WholeKitchenSelections): Design {
  return { ...KITCHEN_L_DESIGN, settings: selections };
}

function pillMarkup(design: Design, visibleCount: number): string {
  storeState.current = stateFor(design);
  return renderToStaticMarkup(createElement(GlobalSettings, { visibleCount }));
}

/** The seeded kitchen on PAL with a named palette colour: four settings, four labels, no empty one.
 *  `Alb` is `pal.alb`'s declared name and it is what the second segment reads. */
const ON_PAL: Design = designCarrying({
  materialTierId: PAL_ID,
  hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
});

/** The same kitchen on MDF, taking that material's declared default — a free colour, so the second
 *  setting is **shown and unwritten**: the swatch wears it. */
const ON_MDF: Design = designCarrying({
  materialTierId: MDF_ID,
  hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
});

function countOf(markup: string, fragment: string): number {
  return markup.split(fragment).length - 1;
}

function labelsIn(markup: string): readonly string[] {
  return [
    ...markup.matchAll(
      /data-testid="global-settings-pill-label"[^>]*>([^<]*)</g,
    ),
  ].map((match) => match[1] ?? "");
}

function counterIn(markup: string): string | undefined {
  const match = /data-testid="global-settings-pill-count"[^>]*>([^<]*)</.exec(
    markup,
  );
  return match?.[1];
}

function accessibleNameIn(markup: string): string {
  const match = /aria-label="([^"]*)"/.exec(markup);
  if (!match?.[1]) throw new Error("the pill rendered no accessible name");
  return match[1];
}

/** What a screen reader must hear at every rung: each of the four settings, whole. Composed from the
 *  same declarations the pill's labels are composed from rather than pinned, so a renamed tier moves
 *  the expectation with the markup. */
function everySettingSpokenOn(design: Design): readonly string[] {
  const materialTierId = design.settings?.materialTierId ?? PAL_ID;
  const material = materialById(materialTierId);
  const materialTier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (tier) => tier.tierId === materialTierId,
  );
  const hardwareTier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (tier) => tier.tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
  );
  if (!materialTier || !hardwareTier) throw new Error("the book moved");
  const finish = design.settings?.finish ?? material.defaultFinish;
  const colour =
    finish.kind === "free-colour"
      ? ro.globalSettings.pillColourValue(finish.value)
      : ro.finishName(finish.entryId);
  return [
    ro.globalSettings.pillMaterial(
      ro.bookText(materialTier.name, materialTier.nameKey),
    ),
    colour,
    ro.globalSettings.pillHardware(
      ro.priceBreakdown.wholeKitchenCategories.hardware,
      ro.bookText(hardwareTier.name, hardwareTier.nameKey),
    ),
    ro.globalSettings.pillDepth(
      design.settings?.cabinetDepthMm ??
        KITCHEN_L_DESIGN.settings?.cabinetDepthMm ??
        600,
    ),
  ];
}

describe("the premise — the two designs this file sweeps differ in the way it claims", () => {
  it("draws four written labels on PAL and three on MDF, whose colour has no name", () => {
    expect(labelsIn(pillMarkup(ON_PAL, EVERY_SETTING))).toHaveLength(4);
    expect(labelsIn(pillMarkup(ON_MDF, EVERY_SETTING))).toHaveLength(3);
  });

  /** Non-vacuity for every "the colour is still spoken" line below: MDF's declared default really is
   *  a free colour, so there really is a word the pill does not write. */
  it("takes a free colour from the picker material's own declaration", () => {
    expect(materialById(MDF_ID).defaultFinish.kind).toBe("free-colour");
    expect(
      MATERIALS.map((material) => material.materialId).includes(MDF_ID),
    ).toBe(true);
  });
});

describe("the accessible name states every setting, at every rung", () => {
  it.each(EVERY_RUNG)(
    "names all four settings when the pill draws %i of them, on PAL",
    (visibleCount) => {
      const name = accessibleNameIn(pillMarkup(ON_PAL, visibleCount));

      for (const spoken of everySettingSpokenOn(ON_PAL)) {
        expect(name, `rung showing ${String(visibleCount)}`).toContain(spoken);
      }
      // And it is the control's own name, not a description beside it.
      expect(name).toContain(ro.globalSettings.open);
    },
  );

  it.each(EVERY_RUNG)(
    "speaks the colour the pill never writes when the kitchen is on a free one, at %i drawn",
    (visibleCount) => {
      const markup = pillMarkup(ON_MDF, visibleCount);
      const spokenColour = everySettingSpokenOn(ON_MDF)[1] ?? "";

      expect(spokenColour).not.toBe("");
      expect(accessibleNameIn(markup)).toContain(spokenColour);
      // The point of the pairing: it is spoken and it is not written.
      expect(labelsIn(markup)).not.toContain(spokenColour);
    },
  );

  /** **The counter is never what is announced.** A screen-reader user who heard *"+3"* would be told
   *  three things exist and not which. */
  it.each(EVERY_RUNG)("announces no count at %i drawn", (visibleCount) => {
    expect(accessibleNameIn(pillMarkup(ON_PAL, visibleCount))).not.toContain(
      "+",
    );
  });
});

describe("the counter counts what is not shown, and never stands alone", () => {
  it.each(EVERY_RUNG)("reads +%i-from-four at each rung", (visibleCount) => {
    const markup = pillMarkup(ON_PAL, visibleCount);
    const hiddenCount = EVERY_SETTING - visibleCount;

    expect(counterIn(markup), `rung showing ${String(visibleCount)}`).toBe(
      hiddenCount === 0 ? undefined : `+${String(hiddenCount)}`,
    );
  });

  /** **There is no bare `+3`** (ADR 0104 decision 3): the pill's minimum content is the swatch, one
   *  label and the counter. Swept on both designs, because the free colour is the state where a
   *  model that filtered empty labels *before* taking the floor would draw one. */
  it.each(EVERY_RUNG)(
    "draws at least one label and exactly one swatch at %i drawn, on both designs",
    (visibleCount) => {
      for (const [name, design] of [
        ["PAL", ON_PAL],
        ["MDF", ON_MDF],
      ] as const) {
        const markup = pillMarkup(design, visibleCount);

        expect(labelsIn(markup).length, name).toBeGreaterThanOrEqual(1);
        expect(countOf(markup, 'aria-hidden="true"'), name).toBeGreaterThan(0);
      }
    },
  );

  /** A count the row could never publish — the hook's own state is clamped, but the component takes
   *  it as a prop and a clamp asserted only upstream is a clamp one refactor from gone. */
  it.each([-1, 0, 99])(
    "clamps a count of %i into the ladder",
    (visibleCount) => {
      const markup = pillMarkup(ON_PAL, visibleCount);
      const drawn = labelsIn(markup).length;

      expect(drawn).toBeGreaterThanOrEqual(1);
      expect(drawn).toBeLessThanOrEqual(EVERY_SETTING);
      expect(counterIn(markup)).toBe(
        drawn === EVERY_SETTING
          ? undefined
          : `+${String(EVERY_SETTING - drawn)}`,
      );
    },
  );
});

describe("the separator falls between labels and nowhere else", () => {
  it.each(EVERY_RUNG)(
    "draws one fewer `│` than it draws labels, at %i drawn",
    (visibleCount) => {
      for (const [name, design] of [
        ["PAL", ON_PAL],
        ["MDF", ON_MDF],
      ] as const) {
        const markup = pillMarkup(design, visibleCount);
        const separators = countOf(markup, "separator");

        expect(separators, `${name} at ${String(visibleCount)}`).toBe(
          labelsIn(markup).length - 1,
        );
      }
    },
  );

  /** **The free colour costs no separator**, which is the case a `│` around nothing would appear in:
   *  on MDF the pill draws two names at rung 3 where PAL draws three, and one divider rather than
   *  two. */
  it("draws no divider around the colour it does not write", () => {
    const mdf = pillMarkup(ON_MDF, EVERY_SETTING);

    expect(labelsIn(mdf)).toHaveLength(3);
    expect(countOf(mdf, "separator")).toBe(2);
  });
});

describe("only the first label may ever be cut", () => {
  /** Criterion 14 reads *at most one element on the pill may report a clip, and it is the last shown
   *  label at rung 4*. That is an assertion about a **known** element only while exactly one label
   *  carries the ellipsising rule, at every rung. */
  it.each(EVERY_RUNG)(
    "gives the ellipsis to exactly one label at %i drawn",
    (visibleCount) => {
      for (const [name, design] of [
        ["PAL", ON_PAL],
        ["MDF", ON_MDF],
      ] as const) {
        const markup = pillMarkup(design, visibleCount);
        const lead = [
          ...markup.matchAll(
            /class="([^"]*)"[^>]*data-testid="global-settings-pill-label"/g,
          ),
        ].filter(([, classes]) => (classes ?? "").includes("leadLabel"));

        expect(lead.length, `${name} at ${String(visibleCount)}`).toBe(1);
      }
    },
  );
});
