// **The seams wave 6G is allowed to reach through, held open by measurement rather than by comment.**
//
// Three of them, each closing a way this surface could have been built that would look right:
//
// 1. **One module names a price book for each runtime.** ADR 0062 seam 1's whole point is that the book
//    is supplied rather than imported, and the path of least resistance for a tier list was
//    `import { SAMPLE_PRICE_BOOK }` into the sheet — which would have made a third module name one, and
//    three answers to "what is on offer". The first block reads the source tree, because no type spans
//    that hop.
// 2. **This surface prices nothing.** The hardware tiers are billed per cabinet handle (ADR 0061
//    decision 2) inside `priceDesign`; a settings sheet reaching for `deriveDoorCount` or
//    `widthDerivedDoorLeafCount` would be computing a second price on a denominator nobody ruled,
//    which is the failure M6's plan names for this wave by name.
// 3. **The ids it offers are ids the 6E commands accept.** `setMaterialTier` refuses a tier its
//    caller did not offer, so the surface and the command agreeing about the book is the difference
//    between a working control and a silent refusal.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
} from "@lemnaria/configurator-domain";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { underSamplePriceBook } from "../support/sample-price-root";

/** The store state the component under test reads — `price-wiring.adversarial.test.ts`'s pattern,
 *  for its reason: the real component runs against a real store's real fields. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

/** Every `groups` argument the model was handed, in call order. Recorded by wrapping the real
 *  function rather than replacing it, so the component still renders what it would ship. */
const handedGroups = vi.hoisted(() => ({
  calls: [] as readonly DisplayGroup[][],
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

vi.mock("@/settings/global-settings-model", async (importActual) => {
  const actual =
    await importActual<typeof import("@/settings/global-settings-model")>();
  return {
    ...actual,
    describeGlobalSettings: (
      input: Parameters<typeof actual.describeGlobalSettings>[0],
    ) => {
      handedGroups.calls = [...handedGroups.calls, [...input.groups]];
      return actual.describeGlobalSettings(input);
    },
  };
});

const { GlobalSettings } = await import("@/settings/global-settings");

const WEB_SOURCE = resolve(import.meta.dirname, "../../src");

function listSourceFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      return listSourceFiles(resolve(directory, entry.name), `${path}/`);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Crude but sufficient for a guard: stripping comments can only make the search *less* likely to
 *  fire, and a comment naming the constant is exactly the false positive to rule out. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sourceByPath = new Map(
  listSourceFiles(WEB_SOURCE).map((path) => [
    path,
    withoutComments(readFileSync(resolve(WEB_SOURCE, path), "utf8")),
  ]),
);

function modulesNaming(pattern: RegExp): string[] {
  return [...sourceByPath]
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();
}

/** The modules wave 6G's surface is made of. Listed rather than matched on a directory, so a fourth
 *  one is a deliberate addition to this guard. */
const THIS_SURFACE = [
  "settings/global-settings.tsx",
  "settings/global-settings-model.ts",
  "price/whole-kitchen-tiers.ts",
];

function isThisSurface(path: string): boolean {
  return THIS_SURFACE.includes(path);
}

function stateFor(design: Design): ConfiguratorState {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-03T12:00:00.000Z",
  }).getState();
}

describe("one module reads the book and one seeds the sample, and the browser names neither", () => {
  // ADR 0062 seam 1 as R1 closed it (backlog 176): the server parses the active version once, in one module, and hands the
  // browser the result as a prop. Only the test-only seeding helper names the sample, so a surface that imported it would
  // make a second answer to "what is on offer".
  it("names the sample in the seeding helper alone, so the browser's composition root names no book", () => {
    expect(modulesNaming(/SAMPLE_PRICE_BOOK/)).toEqual([
      "lib/server/price-book-test-seed.ts",
    ]);
  });

  it("parses a book in the active-price-book module alone", () => {
    expect(modulesNaming(/\bparsePriceBook\b/)).toEqual([
      "lib/server/active-price-book.ts",
    ]);
  });

  it("keeps a route out of both: the contact route names no book and asks the server's root for none", () => {
    const route =
      sourceByPath.get("app/api/contact-submissions/route.ts") ?? "";

    expect(route.length).toBeGreaterThan(0);
    expect(route).not.toMatch(
      /SAMPLE_PRICE_BOOK|parsePriceBook|shippedPriceBook/,
    );
  });

  it("keeps the query that measures a delta free of one too", () => {
    // `measureWholeKitchenTiers` takes a book exactly as `priceDesign` does, which is what makes a
    // manufacturer-supplied book a substitution at the root rather than a second edit here.
    const measurer = sourceByPath.get("price/whole-kitchen-tiers.ts") ?? "";

    expect(measurer.length).toBeGreaterThan(0);
    expect(measurer).not.toMatch(/SAMPLE_PRICE_BOOK/);
    expect(measurer).toMatch(/book: PriceBook/);
  });
});

describe("the settings surface computes no price of its own", () => {
  it("names no leaf, door or handle count in any module this surface is made of", () => {
    // Whether a hardware tier is billed per leaf, per band or per cabinet is an open owner question.
    // It is not this surface's to answer, and it does not have to be: 6B already priced hardware per
    // cabinet handle, and this renders the book's tiers.
    //
    // Scoped to these modules rather than to the whole tree because `panel/cabinet-thumbnails.ts`
    // legitimately names a handle count — it draws handles. What is refused is a *settings* module
    // deriving one, which is what a second price would be written out of.
    const countsDoorLeaves =
      /deriveDoorCount|widthDerivedDoorLeafCount|cabinetHandleCount/;

    expect(modulesNaming(countsDoorLeaves).filter(isThisSurface)).toEqual([]);
  });

  it("rounds nowhere, so the one formatter stays the one formatter", () => {
    for (const path of THIS_SURFACE) {
      expect(sourceByPath.get(path) ?? "", path).not.toMatch(
        /Math\.(ceil|floor|round|trunc)/,
      );
    }
  });
});

describe("the count of bodies comes from wave 6A's projection", () => {
  it("hands the model the projection's own answer, verbatim", () => {
    handedGroups.calls = [];
    storeState.current = stateFor(KITCHEN_L_DESIGN);
    renderToStaticMarkup(underSamplePriceBook(createElement(GlobalSettings)));

    expect(handedGroups.calls.at(-1)).toEqual(
      projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    );
  });

  it("follows a design with a different body population rather than a fixed list", () => {
    const wallBOnly: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "B",
      ),
    };

    handedGroups.calls = [];
    storeState.current = stateFor(wallBOnly);
    renderToStaticMarkup(underSamplePriceBook(createElement(GlobalSettings)));

    expect(handedGroups.calls.at(-1)).toEqual(
      projectDesignForDisplay(wallBOnly, KITCHEN_L_BODY_CATALOG),
    );
  });
});

describe("a design carrying a withdrawn tier can be repaired from this surface", () => {
  it("applies a valid tier over the withdrawn one, and the design prices again", () => {
    // The whole point of keeping the list alive through a pricing failure: the recovery has to
    // actually work, not merely be rendered. Driven through the real store and the real 6E command,
    // with the ids `offerWholeKitchenTiers` publishes for exactly this document.
    const withdrawn: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: "material.withdrawn" },
    };
    const store = createConfiguratorStore({
      design: withdrawn,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-09-04T12:00:00.000Z",
    });
    const offer = offerWholeKitchenTiers({
      design: withdrawn,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: withdrawn.settings,
    });

    store
      .getState()
      .setMaterialTier(offer.material.defaultTierId, offer.material.tierIds);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().design.settings?.materialTierId).toBe(
      offer.material.defaultTierId,
    );
    expect(
      priceDesign({
        design: store.getState().design,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: store.getState().design.settings,
      }).ok,
    ).toBe(true);
  });
});

describe("the ids this surface offers are the ids the commands accept", () => {
  it("applies every material tier the book offers, without a refusal", () => {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-09-03T12:00:00.000Z",
    });
    const tierIds = SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId);

    for (const tierId of tierIds) {
      store.getState().setMaterialTier(tierId, tierIds);
      expect(store.getState().lastRejection, tierId).toBeNull();
      expect(store.getState().design.settings?.materialTierId).toBe(tierId);
    }
  });

  it("applies every hardware tier the book offers, without a refusal", () => {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-09-03T12:00:00.000Z",
    });
    const tierIds = SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId);

    for (const tierId of tierIds) {
      store.getState().setHardwareTier(tierId, tierIds);
      expect(store.getState().lastRejection, tierId).toBeNull();
      expect(store.getState().design.settings?.hardwareTierId).toBe(tierId);
    }
  });
});
