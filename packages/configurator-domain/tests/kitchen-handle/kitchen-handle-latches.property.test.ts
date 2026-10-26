// H1-b: choosing push for the kitchen raises the push-to-open count by exactly the fronts of the bodies
// that now resolve to push, and choosing steel or black lowers it back. A property over random designs:
// a pool of seeded and composed kitchens, each dealt random own handles per placement, under a random
// kitchen handle.
//
// **"The push-to-open count" is per opening front, not per body** (ADR 0092 decision 3: one latch per
// leaf and per drawer). So "exactly the number of resolved push bodies" is read as the sum of those
// bodies' fronts; a body with three fronts that turns push adds three.
//
// **What this file does not cover.** The hardware line is built by `countHardwareMechanisms`, which reads
// `DisplayEntry.handle` and has no access to `design.settings`. The count below is therefore made through
// `isPushToOpen` with the kitchen handle supplied, and is anchored two ways to the real counter: with no
// kitchen handle it must equal `countHardwareMechanisms`, and with one it must equal what the real counter
// answers for the same design with that handle stamped onto every body that follows it. Wiring the real
// counter to read `settings.handle` is the call-site patch the wave's report hands over.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  countHardwareMechanisms,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  projectDesignForDisplay,
  type BodyCatalog,
  type DesignPlacement,
  type DisplayEntry,
  type Design,
  type Handle,
} from "../../src/index.js";
import { isPushToOpen, TOP_ROW_Y0_MM } from "../../src/push-to-open.js";
import {
  documentsWithNoKitchenHandle,
  type NamedDocument,
} from "./handle-document-facts.js";

const POOL: readonly NamedDocument[] = documentsWithNoKitchenHandle().filter(
  (document) => !document.name.endsWith("+own-handles"),
);
const OWN_CHOICES = fc.constantFrom<Handle | undefined>(
  undefined,
  "steel",
  "black",
  "push",
);
const A_HANDLE = fc.constantFrom<Handle>("steel", "black", "push");

/** A pooled design with its placements' own handles dealt from `choices`, cycled. */
function dealtOwnHandles(
  document: NamedDocument,
  choices: readonly (Handle | undefined)[],
): Design {
  const placements = document.design.placements.map((placement, index) => {
    const own = choices[index % choices.length];
    if (own === undefined) return placement;
    return { ...placement, body: { ...placement.body, handle: own } };
  });
  return { ...document.design, placements };
}

function entriesOf(design: Design, catalog: BodyCatalog): DisplayEntry[] {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

/** One latch per opening front: the denominator `hardware-mechanisms.ts` uses. */
function frontsOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

function takesAHandle(entry: DisplayEntry, catalog: BodyCatalog): boolean {
  return catalog.get(entry.buildId)?.canHandle === true;
}

function latchesUnder(
  design: Design,
  catalog: BodyCatalog,
  kitchenHandle: Handle | undefined,
): number {
  return entriesOf(design, catalog).reduce(
    (total, entry) =>
      isPushToOpen({
        y0Mm: entry.y0Mm,
        recordedHandle: entry.handle,
        kitchenHandle,
        canHandle: takesAHandle(entry, catalog),
      })
        ? total + frontsOf(entry, catalog)
        : total,
    0,
  );
}

function followsTheKitchen(entry: DisplayEntry, catalog: BodyCatalog) {
  return (
    entry.handle === undefined &&
    takesAHandle(entry, catalog) &&
    entry.y0Mm < TOP_ROW_Y0_MM
  );
}

/** The design with `handle` written onto each body that would follow the kitchen, so the real counter,
 *  which knows only a placement's own handle, can be asked what the kitchen's choice should give. */
function withKitchenHandleStamped(
  design: Design,
  catalog: BodyCatalog,
  handle: Handle,
): Design {
  const following = new Set(
    entriesOf(design, catalog)
      .filter((entry) => followsTheKitchen(entry, catalog))
      .map((entry) => entry.placementId),
  );
  const stamp = (placement: DesignPlacement): DesignPlacement =>
    following.has(placement.id)
      ? { ...placement, body: { ...placement.body, handle } }
      : placement;
  return { ...design, placements: design.placements.map(stamp) };
}

function followingFronts(design: Design, catalog: BodyCatalog): number {
  return entriesOf(design, catalog)
    .filter((entry) => followsTheKitchen(entry, catalog))
    .reduce((total, entry) => total + frontsOf(entry, catalog), 0);
}

const randomDesign = fc.record({
  document: fc.constantFrom(...POOL),
  choices: fc.array(OWN_CHOICES, { minLength: 1, maxLength: 12 }),
});

describe("the pool is a real one", () => {
  it("holds the seeded kitchen and composed rooms with latches to count", () => {
    expect(POOL.length).toBeGreaterThanOrEqual(3);
    for (const document of POOL) {
      expect(
        latchesUnder(document.design, document.catalog, "push"),
      ).toBeGreaterThan(0);
    }
  });
});

describe("the latch count under a kitchen handle", () => {
  propertyTest.prop([randomDesign])(
    "is the real counter's answer when the kitchen has chosen none",
    ({ document, choices }) => {
      const design = dealtOwnHandles(document, choices);

      expect(latchesUnder(design, document.catalog, undefined)).toBe(
        countHardwareMechanisms(
          entriesOf(design, document.catalog),
          document.catalog,
        ).pushToOpen,
      );
    },
  );

  propertyTest.prop([randomDesign, A_HANDLE])(
    "is the real counter's answer for the design with the kitchen's handle stamped on its followers",
    ({ document, choices }, kitchenHandle) => {
      const design = dealtOwnHandles(document, choices);
      const stamped = withKitchenHandleStamped(
        design,
        document.catalog,
        kitchenHandle,
      );

      expect(latchesUnder(design, document.catalog, kitchenHandle)).toBe(
        countHardwareMechanisms(
          entriesOf(stamped, document.catalog),
          document.catalog,
        ).pushToOpen,
      );
    },
  );

  propertyTest.prop([randomDesign])(
    "rises by exactly the fronts of the bodies following the kitchen when it chooses push",
    ({ document, choices }) => {
      const design = dealtOwnHandles(document, choices);
      const before = latchesUnder(design, document.catalog, undefined);

      const after = latchesUnder(design, document.catalog, "push");

      expect(after - before).toBe(followingFronts(design, document.catalog));
    },
  );

  propertyTest.prop([randomDesign, fc.constantFrom<Handle>("steel", "black")])(
    "falls back to the count with no kitchen handle when the kitchen chooses steel or black",
    ({ document, choices }, bars) => {
      const design = dealtOwnHandles(document, choices);

      expect(latchesUnder(design, document.catalog, bars)).toBe(
        latchesUnder(design, document.catalog, undefined),
      );
    },
  );

  propertyTest.prop([randomDesign, A_HANDLE])(
    "never changes a latch on a body that chose its own handle, or on the top row",
    ({ document, choices }, kitchenHandle) => {
      const design = dealtOwnHandles(document, choices);

      const unmoved = entriesOf(design, document.catalog).filter(
        (entry) => !followsTheKitchen(entry, document.catalog),
      );
      const latchAt = (handle: Handle | undefined) =>
        unmoved.map((entry) =>
          isPushToOpen({
            y0Mm: entry.y0Mm,
            recordedHandle: entry.handle,
            kitchenHandle: handle,
            canHandle: takesAHandle(entry, document.catalog),
          }),
        );

      expect(latchAt(kitchenHandle)).toEqual(latchAt(undefined));
    },
  );
});
