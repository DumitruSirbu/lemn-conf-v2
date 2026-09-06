// **Adversarial QA for wave 6Q-a's named, accepted interim: what a customer actually sees when a
// legacy chip refuses.**
//
// ADR 0078 decision 6 defends the interim on one claim — tapping *Lut* or *Salvie* on a PAL kitchen
// *"replaces silently storing an invalid finish with a sentence"*. `qa-6p-finish-dom.adversarial.test.ts`
// asserts the refusal's **code** and that no swatch lights, and it renders the panel with
// `rejection: null`, so nothing in the repository asserts that the sentence reaches the markup. A
// refusal the panel swallows is exactly the no-op `set-appearance.ts` refuses to ship, arriving one
// layer up.
//
// The second half of this file is the fact the shipped partition is structurally unable to state:
// **`OFFERED_ON_PAL` / `REFUSED_ON_PAL` is a property of PAL, not of the chips.** On MDF the same
// five chips split the other way, and on veneer all five refuse. A partition written for one
// material would keep passing on a build that had stopped reading the material at all.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  describeSelection,
  KITCHEN_L_DESIGN,
  offersFor,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { describePanel, type PanelView } from "@/panel/panel-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

vi.mock("@/price/use-priced-design", () => ({
  usePricedDesign: () => undefined,
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector({ lastRejection: null, deselect: () => undefined }),
  };
});

const { EditorPanel } = await import("@/panel/editor-panel");

/** The five §5.5 shipped with, written out for this file's own reason: the partitions below are
 *  claims about **which** of them a material offers, and reading the list from the component would
 *  make a widened panel silently widen the claim. */
const SHIPPED_SWATCH_KEYS = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
] as const;

/** Written from the products, not from `materialOffersFinish`. PAL offers its six printed decors,
 *  so the three chips that write one apply and the two that write paint refuse. MDF is painted, so
 *  it is the exact inverse. Veneer offers only its two woods, which no chip writes, so all five
 *  refuse — and that third column is what proves the split moves with the material. */
const OFFERED_BY_MATERIAL: Readonly<Record<string, readonly string[]>> = {
  "material.melamine": ["white", "graphite", "oak"],
  "material.painted-mdf": ["clay", "sage"],
  "material.veneer": [],
};

const SELECTED = { kind: "placement", id: "p0" } as const;
const NOW = "2026-08-26T12:00:00.000Z";

/** Anything that would mean a placeholder reached the copy instead of a word. */
const PLACEHOLDER_LEAKS = ["undefined", "null", "NaN", "[object", "${"];
const ROMANIAN_LETTERS = /[ăâîșțĂÂÎȘȚ]/;

interface TapOutcome {
  readonly pressed: readonly string[];
  readonly rejectionCode: string | null;
  readonly rejectionMessage: string | null;
  readonly markup: string;
  readonly finishAfter: unknown;
}

function withMaterial(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

function panelFor(
  store: ReturnType<typeof createConfiguratorStore>,
  rejection: PanelViewInput["rejection"],
): PanelView {
  const state = store.getState();
  return describePanel({
    meta: describeSelection({
      records: state.records,
      voids: state.voids,
      catalog: state.catalog,
      target: SELECTED,
    }),
    offers: offersFor({
      records: state.records,
      voids: state.voids,
      columns: state.columns,
      catalog: state.catalog,
      cabinetDepthMm: cabinetDepthMmOf(state.design),
      target: SELECTED,
    }),
    rejection,
    widthOptions: [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

type PanelViewInput = Parameters<typeof describePanel>[0];

/** Taps one swatch on a kitchen of the given material and reports everything the customer could
 *  observe: which swatch lights, what the store recorded, and what the panel actually renders. */
function tapSwatch(design: Design, key: string): TapOutcome {
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => NOW,
  });
  store.getState().select(SELECTED);

  const before = panelFor(store, null);
  if (before.kind !== "open") throw new Error("expected an open panel");
  const section = before.sections.find((one) => one.kind === "finish");
  if (section?.kind !== "finish") throw new Error("no finish section");
  const chip = section.chips.find((one) => one.value === key);
  if (!chip) throw new Error(`no chip keyed ${key}`);

  store.getState().setFinish(chip.finish);
  const rejection = store.getState().lastRejection;

  const after = panelFor(store, rejection);
  if (after.kind !== "open") throw new Error("expected an open panel");
  const pressedSection = after.sections.find((one) => one.kind === "finish");
  if (pressedSection?.kind !== "finish") throw new Error("no finish section");

  return {
    pressed: pressedSection.chips
      .filter((one) => one.isActive)
      .map((one) => one.value),
    rejectionCode: rejection?.code ?? null,
    rejectionMessage: rejection?.message ?? null,
    markup: renderToStaticMarkup(createElement(EditorPanel, { view: after })),
    finishAfter: store
      .getState()
      .design.placements.find((one) => one.id === SELECTED.id)?.body.finish,
  };
}

describe("the partition is a property of the material, not of the five chips", () => {
  it("names every declared material, and every chip exactly once per material", () => {
    // The anti-vacuity guard for the table above: three columns, and each one a subset of the five
    // the panel ships. A renamed chip or a fourth material has to come through here.
    expect(Object.keys(OFFERED_BY_MATERIAL)).toHaveLength(3);
    for (const offered of Object.values(OFFERED_BY_MATERIAL)) {
      expect(new Set(offered).size).toBe(offered.length);
      for (const key of offered) {
        expect(SHIPPED_SWATCH_KEYS).toContain(key);
      }
    }
    // Both branches non-empty across the whole table: five applies and ten refusals over fifteen
    // (material, chip) pairs. A table that refused everything would satisfy every assertion below.
    const applies = Object.values(OFFERED_BY_MATERIAL).flat();
    expect(applies).toHaveLength(5);
    expect(SHIPPED_SWATCH_KEYS.length * 3 - applies.length).toBe(10);
  });

  it.each(Object.keys(OFFERED_BY_MATERIAL))(
    "splits the five chips on a %s kitchen exactly as the products do",
    (materialTierId) => {
      const design = withMaterial(materialTierId);
      const expected = OFFERED_BY_MATERIAL[materialTierId] ?? [];

      for (const key of SHIPPED_SWATCH_KEYS) {
        const outcome = tapSwatch(design, key);

        if (expected.includes(key)) {
          expect(outcome.rejectionCode).toBeNull();
          expect(outcome.pressed).toEqual([key]);
        } else {
          expect(outcome.rejectionCode).toBe("FINISH_NOT_OFFERED");
          expect(outcome.pressed).toEqual([]);
          expect(outcome.finishAfter).toBeUndefined();
        }
      }
    },
  );
});

describe("the interim is a sentence, and the sentence reaches the markup", () => {
  const REFUSED_ON_PAL = ["clay", "sage"] as const;

  it.each(REFUSED_ON_PAL)(
    "tells the customer in Romanian why %s did not apply",
    (key) => {
      const outcome = tapSwatch(KITCHEN_L_DESIGN, key);

      expect(outcome.rejectionCode).toBe("FINISH_NOT_OFFERED");
      const message = outcome.rejectionMessage ?? "";
      expect(message.length).toBeGreaterThan(0);
      expect(ROMANIAN_LETTERS.test(message)).toBe(true);
      // The copy states no digit — `starting-price.adversarial.test.ts`'s standing rule for a string
      // this product renders — and leaks no placeholder from a `NoParams` detail.
      expect(/\d/.test(message)).toBe(false);
      for (const leak of PLACEHOLDER_LEAKS) {
        expect(message).not.toContain(leak);
      }

      // The claim ADR 0078 decision 6 rests on: the panel renders it, rather than the refusal
      // stopping at the store where nobody can read it.
      expect(outcome.markup).toContain(message);
    },
  );

  it("renders no rejection banner when the chip applies", () => {
    const outcome = tapSwatch(KITCHEN_L_DESIGN, "graphite");

    expect(outcome.rejectionCode).toBeNull();
    expect(outcome.pressed).toEqual(["graphite"]);
  });

  it("says the same sentence for both refused chips, since the detail carries no parameters", () => {
    const [clay, sage] = REFUSED_ON_PAL.map(
      (key) => tapSwatch(KITCHEN_L_DESIGN, key).rejectionMessage,
    );

    expect(clay).toBe(sage);
  });
});
