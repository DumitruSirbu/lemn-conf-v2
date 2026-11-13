// **The finish surface's markup, which the e2e gate addresses by name and cannot run in a worktree
// without a database.**
//
// Wave 6P wrote this file because nothing asserted the *markup*: four e2e specs address
// `page.getByTestId("finish-graphite")`, `finish-white`, `finish-sage` and `[data-testid^="finish-"]`
// counted as a set, and a widened or re-keyed swatch would have shipped green.
//
// **Wave 6R re-keyed them deliberately**, so the file's subject moved with them. The five legacy
// names are gone and a swatch is keyed by the declared entry it applies; what has not changed is
// why this exists — the markup is the contract the e2e suite holds, and the compiler cannot see it.
//
// The literals below are written out rather than derived from `PALETTE_ENTRIES`: a test that reads
// the same list the component reads agrees with any list the component is given, which is precisely
// the widening this file exists to refuse.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  describeSelection,
  KITCHEN_L_DESIGN,
  materialOfDesign,
  offersFor,
  paletteFinish,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { describePanel, type PanelView } from "@/panel/panel-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { ro } from "../support/romanian-content";
import { MDF_KITCHEN, PAL_KITCHEN } from "../support/panel-material";
import { swatchSectionOf } from "../support/panel-sections";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

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

/** PAL's six decors, in the order ADR 0071 decision 4 lists them. */
const PAL_DECOR_IDS = [
  "pal.alb",
  "pal.stejar-bardolino",
  "pal.stejar-halifax",
  "pal.antracit",
  "pal.gri-havanna",
  "pal.nuc-warmia",
] as const;

/** The three that are drawn as tinted wood, and therefore the three whose swatch shows a grain. */
const PAL_WOOD_IDS = [
  "pal.stejar-bardolino",
  "pal.stejar-halifax",
  "pal.nuc-warmia",
] as const;

/** The names ADR 0071 decision 4 confirmed with the owner, as the customer reads them. */
const PAL_DECOR_NAMES = [
  "Alb",
  "Stejar Bardolino Natur",
  "Stejar Halifax Natur",
  "Antracit",
  "Gri Havanna",
  "Nuc Warmia Maro",
] as const;

function markupFor(
  meta: Parameters<typeof describePanel>[0]["meta"],
  material = PAL_KITCHEN,
): string {
  const view: PanelView = describePanel({
    content: ro,
    material,
    meta,
    offers: [],
    rejection: null,
    widthOptions: meta ? noWidthIsFree(meta.widthMm, meta.sizesMm) : [],
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  return renderToStaticMarkup(createElement(EditorPanel, { view }));
}

/** The same panel with the write credential withheld — what a shared link renders, and the one
 *  arrangement under which `RalPickerView`'s `disabled` attribute is observable at all. */
function readOnlyMarkupFor(material = PAL_KITCHEN): string {
  const view: PanelView = describePanel({
    content: ro,
    material,
    meta: occupiedMeta(),
    offers: [],
    rejection: null,
    widthOptions: [],
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: false,
    saveStatus: "idle",
  });
  return renderToStaticMarkup(createElement(EditorPanel, { view }));
}

function attributesInOrder(markup: string, attribute: string): string[] {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]*)"`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

/** The swatch button as one string, matched by the test id an e2e spec addresses it by. */
function buttonFor(markup: string, key: string): string {
  const button = new RegExp(
    `<button[^>]*data-testid="finish-${key.replace(".", "\\.")}"[^>]*>.*?</button>`,
    "s",
  ).exec(markup);
  if (!button) throw new Error(`no swatch button with test id finish-${key}`);
  return button[0];
}

describe("PAL's decor list, as markup", () => {
  const unpainted = markupFor(occupiedMeta());

  it("emits exactly six swatch test ids, in the order the decors are declared", () => {
    const testIds = attributesInOrder(unpainted, "data-testid").filter((id) =>
      id.startsWith("finish-"),
    );

    expect(testIds).toEqual(PAL_DECOR_IDS.map((id) => `finish-${id}`));
  });

  it("says which of the three controls this is, so a browser test need not count", () => {
    expect(unpainted).toContain('data-finish-control="decor-list"');
  });

  it.each(PAL_DECOR_NAMES.map((name, index) => [PAL_DECOR_IDS[index], name]))(
    "labels %s with its declared name",
    (id, name) => {
      expect(buttonFor(unpainted, id as string)).toContain(name as string);
    },
  );

  it("publishes a colour on every swatch, including the three woods", () => {
    // The publication `solidColorOf("oak")` used to refuse. A swatch with no colour would render as
    // the browser's default and read as white, which is M4's *Finisaj* defect on the panel side.
    for (const id of PAL_DECOR_IDS) {
      expect(buttonFor(unpainted, id)).toMatch(
        /--swatch-colour:\s*#[0-9a-f]{6}/,
      );
    }
  });

  it("marks the three woods as woods and the three flats as not", () => {
    for (const id of PAL_DECOR_IDS) {
      const isWood = (PAL_WOOD_IDS as readonly string[]).includes(id);
      expect(buttonFor(unpainted, id)).toContain(
        `data-wood="${String(isWood)}"`,
      );
    }
  });

  it("renders no supplier code, which is internal provenance", () => {
    // `materials.ts` is explicit that no surface presents a decor code as something a customer picks
    // from, and two of the six codes are not even confirmed against a stock list.
    for (const code of ["W1000", "H1145", "H1180", "U963", "U755", "H1307"]) {
      expect(unpainted).not.toContain(code);
    }
  });

  it("presses nothing when the body wears no finish", () => {
    for (const id of PAL_DECOR_IDS) {
      expect(buttonFor(unpainted, id)).toContain('aria-pressed="false"');
    }
  });

  it.each(PAL_DECOR_IDS)("presses only %s when the body wears it", (id) => {
    const markup = markupFor(occupiedMeta({ finish: paletteFinish(id) }));

    for (const other of PAL_DECOR_IDS) {
      expect(buttonFor(markup, other)).toContain(
        `aria-pressed="${String(other === id)}"`,
      );
    }
  });
});

describe("MDF's picker, as markup", () => {
  const mdf = markupFor(occupiedMeta(), MDF_KITCHEN);

  it("is a colour input and not a row of swatches", () => {
    expect(mdf).toContain('data-finish-control="ral-picker"');
    expect(mdf).toContain('data-testid="finish-colour-picker"');
    expect(mdf).toContain('type="color"');
    expect(
      attributesInOrder(mdf, "data-testid").filter(
        (id) => id.startsWith("finish-") && id !== "finish-colour-picker",
      ),
    ).toEqual([]);
  });

  it("opens on the material's declared default when the body wears nothing", () => {
    expect(mdf).toContain('value="#eceeeb"');
  });

  it("opens on the body's own colour when it has one", () => {
    const worn = markupFor(
      occupiedMeta({ finish: { kind: "free-colour", value: "#b8c4a1" } }),
      MDF_KITCHEN,
    );

    expect(worn).toContain('value="#b8c4a1"');
  });

  it("renders the input disabled when this browser cannot write", () => {
    // The markup half of review finding R1.2. `panel-model.read-only.test.ts` asserts the section
    // says `isDisabled`; only this catches `disabled={section.isDisabled}` being deleted from
    // `RalPickerView`, which would put a live colour input on a read-only share link.
    const locked = readOnlyMarkupFor(MDF_KITCHEN);

    expect(locked).toContain('data-testid="finish-colour-picker"');
    expect(
      /<input[^>]*data-testid="finish-colour-picker"[^>]*>/.exec(locked)?.[0],
    ).toContain("disabled");
    // Not vacuous: the writable render of the same input carries no `disabled`.
    expect(
      /<input[^>]*data-testid="finish-colour-picker"[^>]*>/.exec(mdf)?.[0],
    ).not.toContain("disabled");
  });

  it("never opens on a decor's swatch hex", () => {
    // ADR 0078 decision 4: constructing a free colour from a palette entry's swatch is the
    // invisible substitution ADR 0057 rejected, and publishing a hex per decor is what makes it
    // available to do by accident. A body still wearing a PAL decor on an MDF kitchen is the
    // transient 6Q-b's reset clears, and the picker must not read it as a colour.
    const stale = markupFor(
      occupiedMeta({ finish: paletteFinish("pal.antracit") }),
      MDF_KITCHEN,
    );

    expect(stale).not.toContain('value="#2b2d30"');
    expect(stale).toContain('value="#eceeeb"');
  });
});

describe("the click an e2e spec performs still lights the swatch it clicked", () => {
  /** The whole chain the e2e specs assert in one hop: the chip's own `finish` goes to the store's
   *  `setFinish`, the design records it, `describeSelection` publishes it, and the panel is asked
   *  which swatch is pressed. */
  function clickSwatch(entryId: string): {
    readonly pressed: readonly string[];
    readonly rejectionCode: string | null;
  } {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-08-26T12:00:00.000Z",
    });
    store.getState().select({ kind: "placement", id: "p0" });

    const panel = (): PanelView => {
      const state = store.getState();
      return describePanel({
        content: ro,
        material: materialOfDesign(state.design),
        meta: describeSelection({
          kitchenSettings: {},
          records: state.records,
          voids: state.voids,
          catalog: state.catalog,
          target: { kind: "placement", id: "p0" },
        }),
        offers: offersFor({
          records: state.records,
          voids: state.voids,
          columns: state.columns,
          catalog: state.catalog,
          cabinetDepthMm: cabinetDepthMmOf(state.design),
          target: { kind: "placement", id: "p0" },
        }),
        rejection: null,
        widthOptions: [],
        buildableWidthSpanMm: undefined,
        isBodyProbeAttached: true,
        canWrite: true,
        saveStatus: "idle",
      });
    };

    const chip = swatchSectionOf(panel()).chips.find(
      (one) => one.value === entryId,
    );
    if (!chip) throw new Error(`no chip keyed ${entryId}`);

    store.getState().setFinish(chip.finish);

    return {
      pressed: swatchSectionOf(panel())
        .chips.filter((one) => one.isActive)
        .map((one) => one.value),
      rejectionCode: store.getState().lastRejection?.code ?? null,
    };
  }

  /** **The seeded kitchen carries no settings, so it is PAL** — and since wave 6R every decor the
   *  panel shows it is a decor PAL offers. Wave 6Q-a's interim split these six-equivalents into
   *  three that applied and two that refused; nothing here refuses now. */
  it.each(PAL_DECOR_IDS)(
    "leaves %s pressed and nothing else, with no refusal",
    (id) => {
      const outcome = clickSwatch(id);

      expect(outcome.rejectionCode).toBeNull();
      expect(outcome.pressed).toEqual([id]);
    },
  );
});
