// `replaceColour` and `replaceHandle`, swept. For any design and any colour or handle it names, replacing it by any
// option `replacementsRequired` offers leaves the design naming no switched-off item, and every stored value that was
// not the replaced item is exactly as it was.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  countHardwareMechanisms,
  doorLeafHeightsMm,
  DesignSchema,
  frontPopulationQueryFor,
  projectDesignForDisplay,
  replaceColour,
  replaceHandle,
  type BodyCatalog,
  type Design,
  type DesignPlacement,
  type DisplayEntry,
  type Handle,
} from "../../src/index.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { sameFinish, type Finish } from "../../src/materials.js";
import {
  coloursAndHandlesNamedBy,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import { disabledItemsNamedBy } from "../../src/pricing/named-items.js";
import { replacementsRequired } from "../../src/queries/replacements-required.js";
import { TOP_ROW_Y0_MM } from "../../src/push-to-open.js";
import {
  availabilityOf,
  BOOK,
  CATALOG,
} from "../support/availability-kitchens.js";
import {
  aDeal,
  DECLARED_PALETTE_CHOICES,
  dealtDesign,
  HANDLES,
  maybe,
  OCCURRED_AT,
  paletteFinishOf,
} from "../support/replacement-kitchens.js";
import { documentsWithNoKitchenHandle } from "../kitchen-handle/handle-document-facts.js";

/** Designs on each declared material that offers palette entries, wearing only that material's own colours. MDF's free
 *  colours are not items. */
const namingDesign = aDeal(DECLARED_PALETTE_CHOICES).map(dealtDesign);

function namedItemsOf(design: Design, kind: "finish" | "handle") {
  return coloursAndHandlesNamedBy(design, CATALOG).filter(
    (item) => item.kind === kind,
  );
}

function rowOf(design: Design, item: ItemRef) {
  const [row] = replacementsRequired({
    design,
    book: BOOK,
    availability: availabilityOf([item]),
    catalog: CATALOG,
  }).filter(
    (candidate) => JSON.stringify(candidate.item) === JSON.stringify(item),
  );
  if (!row) throw new Error(`no row for ${JSON.stringify(item)}`);
  return row;
}

function stillNamed(design: Design, item: ItemRef): boolean {
  return disabledItemsNamedBy(
    { design, catalog: CATALOG, book: BOOK, chosen: design.settings },
    availabilityOf([item]),
  ).some((named) => JSON.stringify(named) === JSON.stringify(item));
}

function keysOf(value: object | undefined): string[] {
  return value === undefined ? [] : Object.keys(value).sort();
}

/** Every placement the rewrite did not reach is the very same object, and the container keeps exactly its keys. */
function expectOnlyMatchesMoved(
  before: Design,
  after: Design,
  moved: (placement: DesignPlacement) => boolean,
): void {
  expect(after.placements).toHaveLength(before.placements.length);
  before.placements.forEach((placement, index) => {
    const afterPlacement = after.placements[index];
    if (!moved(placement)) expect(afterPlacement).toBe(placement);
    expect(afterPlacement?.id).toBe(placement.id);
    expect(afterPlacement?.alongMm).toBe(placement.alongMm);
  });
  expect(keysOf(after.settings)).toEqual(keysOf(before.settings));
  expect(after.createdAt).toBe(before.createdAt);
  expect(after.updatedAt).toBe(OCCURRED_AT);
}

describe("replacing a colour the design names, by any option the row offers", () => {
  propertyTest.prop([namingDesign, fc.nat()])(
    "leaves no level naming it and every other stored value as it was",
    (design, pick) => {
      const colours = namedItemsOf(design, "finish");
      fc.pre(colours.length > 0);
      const item = colours[pick % colours.length];
      if (item?.kind !== "finish") throw new Error("expected a colour item");
      const from = paletteFinishOf(item.finishId);

      for (const option of rowOf(design, item).remaining) {
        if (option.kind !== "finish") throw new Error("expected a colour");
        const to = paletteFinishOf(option.finishId);
        const result = replaceColour({
          design,
          from,
          to,
          occurredAt: OCCURRED_AT,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(stillNamed(result.design, item)).toBe(false);
        expect(DesignSchema.safeParse(result.design).success).toBe(true);
        expectOnlyMatchesMoved(design, result.design, (placement) =>
          wearsColour(placement, from),
        );
        expect(result.design.settings?.finish).toEqual(
          settingsColourAfter(design, from, to),
        );
        expect(result.design.settings?.handle).toBe(design.settings?.handle);
        expect(result.design.settings?.topRowHandle).toBe(
          design.settings?.topRowHandle,
        );
        result.design.placements.forEach((placement, index) => {
          expect(placement.body.handle).toBe(
            design.placements[index]?.body.handle,
          );
          expect(placement.body.finish).toEqual(
            bodyColourAfter(design.placements[index], from, to),
          );
        });
      }
    },
  );
});

function wearsColour(placement: DesignPlacement, from: Finish): boolean {
  return (
    placement.body.finish !== undefined &&
    sameFinish(placement.body.finish, from)
  );
}

function settingsColourAfter(design: Design, from: Finish, to: Finish) {
  const own = design.settings?.finish;
  return own !== undefined && sameFinish(own, from) ? to : own;
}

function bodyColourAfter(
  placement: DesignPlacement | undefined,
  from: Finish,
  to: Finish,
) {
  const own = placement?.body.finish;
  return own !== undefined && sameFinish(own, from) ? to : own;
}

describe("replacing a handle the design names, by any option the row offers", () => {
  propertyTest.prop([namingDesign, fc.nat()])(
    "leaves no level naming it and every other stored value as it was",
    (design, pick) => {
      const handles = namedItemsOf(design, "handle");
      fc.pre(handles.length > 0);
      const item = handles[pick % handles.length];
      if (item?.kind !== "handle") throw new Error("expected a handle item");

      for (const option of rowOf(design, item).remaining) {
        if (option.kind !== "handle") throw new Error("expected a handle");
        const result = replaceHandle({
          design,
          from: item.handle,
          to: option.handle,
          occurredAt: OCCURRED_AT,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(stillNamed(result.design, item)).toBe(false);
        expect(DesignSchema.safeParse(result.design).success).toBe(true);
        expectOnlyMatchesMoved(
          design,
          result.design,
          (placement) => placement.body.handle === item.handle,
        );
        const after = (own: Handle | undefined) =>
          own === item.handle ? option.handle : own;
        expect(result.design.settings?.handle).toBe(
          after(design.settings?.handle),
        );
        expect(result.design.settings?.topRowHandle).toBe(
          after(design.settings?.topRowHandle),
        );
        expect(result.design.settings?.finish).toEqual(design.settings?.finish);
        result.design.placements.forEach((placement, index) => {
          const was = design.placements[index]?.body;
          expect(placement.body.handle).toBe(after(was?.handle));
          expect(placement.body.finish).toEqual(was?.finish);
        });
      }
    },
  );
});

/** The latch count under the real counter, for a design projected for display. */
function latchesOf(design: Design, catalog: BodyCatalog): number {
  const entries = projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
  return countHardwareMechanisms(entries, catalog).pushToOpen;
}

function doorLeavesOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length;
}

/** The fronts that go from a bar to a latch when `from` becomes push: the bodies that take a handle and read `from`
 *  from where it is stored. Written from the rule, never from the command's own rewrite. */
function frontsThatBecomeLatches(
  design: Design,
  catalog: BodyCatalog,
  from: Handle,
): number {
  const settings = design.settings;
  return projectDesignForDisplay(design, catalog)
    .flatMap((group) => group.entries)
    .filter((entry) => {
      if (catalog.get(entry.buildId)?.canHandle !== true) return false;
      if (entry.handle !== undefined) return entry.handle === from;
      const followed =
        entry.y0Mm >= TOP_ROW_Y0_MM ? settings?.topRowHandle : settings?.handle;
      return followed === from;
    })
    .reduce((total, entry) => total + doorLeavesOf(entry, catalog), 0);
}

const POOL = documentsWithNoKitchenHandle().filter(
  (document) => !document.name.endsWith("+own-handles"),
);

describe("after a handle replacement, the hardware line follows the resolved handles", () => {
  propertyTest.prop([
    fc.constantFrom(...POOL),
    fc.constantFrom<Handle>("steel", "black"),
    maybe(fc.constantFrom(...HANDLES)),
    fc.array(maybe(fc.constantFrom(...HANDLES)), {
      minLength: 1,
      maxLength: 12,
    }),
  ])(
    "replacing a bar by push raises the push-to-open count by exactly the fronts that wore it",
    (document, from, topRowHandle, ownHandles) => {
      const placements = document.design.placements.map((placement, index) => {
        const own = ownHandles[index % ownHandles.length];
        return own === undefined
          ? placement
          : { ...placement, body: { ...placement.body, handle: own } };
      });
      const design: Design = {
        ...document.design,
        placements,
        settings: {
          ...document.design.settings,
          handle: from,
          ...(topRowHandle === undefined ? {} : { topRowHandle }),
        },
      };

      const result = replaceHandle({
        design,
        from,
        to: "push",
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        latchesOf(result.design, document.catalog) -
          latchesOf(design, document.catalog),
      ).toBe(frontsThatBecomeLatches(design, document.catalog, from));
    },
  );

  it("keeps a top-row body that takes no handle push and latched, whatever it stores and whatever replaces it", () => {
    const returnTop = KITCHEN_L_DESIGN.placements.find(
      (placement) => placement.body.buildId === "wall-corner-return-570-top",
    );
    if (!returnTop)
      throw new Error("the seeded kitchen has no corner return top");
    expect(CATALOG.get(returnTop.body.buildId)?.canHandle).toBe(false);
    expect(returnTop.y0Mm).toBeGreaterThanOrEqual(TOP_ROW_Y0_MM);

    for (const to of HANDLES) {
      const design: Design = {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) =>
          placement.id === returnTop.id
            ? { ...placement, body: { ...placement.body, handle: "black" } }
            : placement,
        ),
        settings: { cabinetDepthMm: 600, topRowHandle: "black" },
      };

      const result = replaceHandle({
        design,
        from: "black",
        to,
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(latchesOfBody(result.design, returnTop.id)).toBeGreaterThan(0);
      expect(latchesOfBody(result.design, returnTop.id)).toBe(
        latchesOfBody(design, returnTop.id),
      );
    }
  });
});

function latchesOfBody(design: Design, placementId: string): number {
  const entries = projectDesignForDisplay(design, CATALOG)
    .flatMap((group) => group.entries)
    .filter((entry) => entry.placementId === placementId);
  expect(entries).toHaveLength(1);
  return countHardwareMechanisms(entries, CATALOG).pushToOpen;
}
