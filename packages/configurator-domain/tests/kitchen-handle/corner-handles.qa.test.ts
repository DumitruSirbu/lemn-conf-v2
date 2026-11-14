// M12 W1 adversarial QA (ADR 0182): what the implementer's `corner-handles.test.ts` leaves open.
//
// Its W1-1 block covers the seeded kitchen only. The block below sweeps generated L, linear and U kitchens at both
// cabinet depths, and the rule is then held over the same grid under a push, a black and a top-row handle, so a corner
// the seeded kitchen does not stand (the wall corner unit, a mirrored L) is asked too. The "before" side is
// `catalogWithCornersTakingNoHandle`, which QA proved equal to `HEAD` (`c48992e8`) by capturing `HEAD`'s price, hardware
// counts and built meshes over this grid and diffing byte for byte: the only source change is the one flag.
//
// The second half is a design carrying `body.handle` on `base-corner-return-320`, which no command can write but a
// hand-edited or imported document can: nothing may bill a handle or throw on a body with no front.
import { describe, expect, it } from "vitest";

import { replaceHandle } from "../../src/commands/replace-switched-off-appearance.js";
import { setHandle } from "../../src/commands/set-appearance.js";
import type { Design, DesignRoom, Handle } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  CORNER_WALL_UNIT_TEMPLATES,
  KITCHEN_L_DESIGN,
} from "../../src/index.js";
import {
  doorLeafCount,
  frontPopulationQueryFor,
  openingFrontCount,
} from "../../src/front-population.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../../src/hardware-mechanisms.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PriceLine } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../../src/queries/design-projection.js";
import { TOP_ROW_Y0_MM } from "../../src/push-to-open.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import {
  availabilityOf,
  handle as handleItem,
  priceUnder,
  withBodyOf,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  BASE_CORNER_RETURN_BUILD_ID,
  catalogWithCornersTakingNoHandle,
  HANDLE_CARRYING_CORNER_BUILD_IDS,
} from "../support/before-adr-0182.js";
import { OCCURRED_AT } from "../support/commands.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const BASE_CORNER_RETURN_ID = "p26";
const WALL_CORNER_UNIT_BUILD_ID = "wall-corner-x-900";
const DEPTHS_MM = [600, 700] as const;
const KITCHEN_HANDLES: readonly (Handle | undefined)[] = [undefined, "steel"];
const TOP_ROW_HANDLES: readonly (Handle | undefined)[] = [undefined, "push"];

function roomGrid(): readonly DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of [2700, 3600, 4800]) {
    for (const depthMm of [2600, 3500]) {
      for (const cornerDirection of [undefined, "left", "right"] as const) {
        rooms.push({
          shape: "L",
          widthMm,
          depthMm,
          heightMm: 2600,
          ...(cornerDirection === undefined ? {} : { cornerDirection }),
        } as DesignRoom);
      }
    }
  }
  for (const widthMm of [1800, 3000, 4200]) {
    rooms.push({ shape: "linear", widthMm, depthMm: 3400, heightMm: 2600 });
  }
  for (const widthMm of [3000, 3334, 5000]) {
    for (const depthMm of [2400, 3333]) {
      for (const wallCMm of [2200, 3333, 4200]) {
        rooms.push({ shape: "U", widthMm, depthMm, wallCMm, heightMm: 2600 });
      }
    }
  }
  return rooms;
}

interface GeneratedKitchen {
  readonly label: string;
  readonly design: Design;
  readonly cabinetDepthMm: number;
}

/** Every room of the grid that composes, at each depth; a refused room is not a kitchen and is left out. */
function generatedKitchens(): readonly GeneratedKitchen[] {
  return DEPTHS_MM.flatMap((cabinetDepthMm) =>
    roomGrid().flatMap((room) => {
      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
        newKitchenSettings: { cabinetDepthMm },
      });
      return result.ok
        ? [
            {
              label: `${JSON.stringify(room)} @${String(cabinetDepthMm)}`,
              design: result.design,
              cabinetDepthMm,
            },
          ]
        : [];
    }),
  );
}

const KITCHENS: readonly GeneratedKitchen[] = [
  ...generatedKitchens(),
  ...DEPTHS_MM.map((cabinetDepthMm) => ({
    label: `seeded with the corner wall unit @${String(cabinetDepthMm)}`,
    design: {
      ...KITCHEN_L_DESIGN,
      placements: [
        ...KITCHEN_L_DESIGN.placements,
        ...CORNER_WALL_UNIT_TEMPLATES,
      ],
    },
    cabinetDepthMm,
  })),
];

function withKitchenHandles(
  design: Design,
  handles: { readonly handle?: Handle; readonly topRowHandle?: Handle },
): Design {
  return { ...design, settings: { ...design.settings, ...handles } };
}

function priceLinesOf(design: Design, catalog: BodyCatalog) {
  const result = priceDesign({
    design,
    catalog,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(`refused: ${result.failure.code}`);
  return result.priced;
}

function entriesOf(
  design: Design,
  catalog: BodyCatalog,
): readonly DisplayEntry[] {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

function countsPerPlacement(
  design: Design,
  catalog: BodyCatalog,
): ReadonlyMap<string, HardwareMechanismCounts> {
  return new Map(
    entriesOf(design, catalog).map((entry) => [
      entry.placementId,
      countHardwareMechanisms([entry], catalog),
    ]),
  );
}

function isHandleCarryingCorner(entry: DisplayEntry): boolean {
  return HANDLE_CARRYING_CORNER_BUILD_IDS.includes(entry.buildId);
}

function doorLeavesOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  return doorLeafCount(
    frontPopulationQueryFor({
      body: entry,
      definition: catalog.get(entry.buildId) ?? {},
    }),
  );
}

describe("the generated grid the properties run over", () => {
  it("composes kitchens of every shape and stands every handle-carrying corner body in some of them", () => {
    const buildIds = new Set(
      KITCHENS.flatMap(({ design }) =>
        design.placements.map((placement) => placement.body.buildId),
      ),
    );

    expect(KITCHENS.length).toBeGreaterThan(60);
    expect([...buildIds].filter((id) => id.includes("corner")).sort()).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
      "wall-corner-x-900",
      "wall-corner-x-900-top",
    ]);
  });
});

describe("W1-1 over generated kitchens: a kitchen that says nothing, or what was already drawn, prices and counts as before", () => {
  it.each(DEPTHS_MM)(
    "bills and counts every generated kitchen at %i mm as it did when the corners took no handle",
    (cabinetDepthMm) => {
      const shipped = buildKitchenLBodyCatalog(cabinetDepthMm);
      const before = catalogWithCornersTakingNoHandle(shipped);
      const disagreeing: string[] = [];
      let cornersAsked = 0;

      for (const kitchen of KITCHENS.filter(
        (candidate) => candidate.cabinetDepthMm === cabinetDepthMm,
      )) {
        for (const handle of KITCHEN_HANDLES) {
          for (const topRowHandle of TOP_ROW_HANDLES) {
            const design = withKitchenHandles(kitchen.design, {
              ...(handle === undefined ? {} : { handle }),
              ...(topRowHandle === undefined ? {} : { topRowHandle }),
            });
            const samePrice =
              JSON.stringify(priceLinesOf(design, shipped)) ===
              JSON.stringify(priceLinesOf(design, before));
            const sameCounts =
              JSON.stringify([...countsPerPlacement(design, shipped)]) ===
              JSON.stringify([...countsPerPlacement(design, before)]);
            cornersAsked += entriesOf(design, shipped).filter((entry) =>
              entry.buildId.includes("corner"),
            ).length;
            if (!samePrice || !sameCounts) {
              disagreeing.push(
                `${kitchen.label} handle=${String(handle)} top=${String(topRowHandle)}`,
              );
            }
          }
        }
      }

      expect(disagreeing).toEqual([]);
      expect(cornersAsked).toBeGreaterThan(300);
    },
  );
});

describe("W1-3 over generated kitchens: a push kitchen latches exactly the corner leaves below the top row", () => {
  it.each(DEPTHS_MM)(
    "moves only the latch count, by those leaves, at %i mm, and no priced line but the hardware line",
    (cabinetDepthMm) => {
      const shipped = buildKitchenLBodyCatalog(cabinetDepthMm);
      const before = catalogWithCornersTakingNoHandle(shipped);
      let latchedLeaves = 0;
      const wrong: string[] = [];

      for (const {
        label,
        design: generated,
        cabinetDepthMm: depth,
      } of KITCHENS) {
        if (depth !== cabinetDepthMm) continue;
        const design = withKitchenHandles(generated, { handle: "push" });
        const was = countsPerPlacement(design, before);

        for (const entry of entriesOf(design, shipped)) {
          const wasCounts = was.get(entry.placementId);
          const isCounts = countsPerPlacement(design, shipped).get(
            entry.placementId,
          );
          const gainsLeaves =
            isHandleCarryingCorner(entry) && entry.y0Mm < TOP_ROW_Y0_MM
              ? doorLeavesOf(entry, shipped)
              : 0;
          latchedLeaves += gainsLeaves;
          if (wasCounts === undefined || isCounts === undefined) continue;
          const expected = {
            ...wasCounts,
            pushToOpen: wasCounts.pushToOpen + gainsLeaves,
          };
          if (JSON.stringify(isCounts) !== JSON.stringify(expected)) {
            wrong.push(`${label} ${entry.placementId} ${entry.buildId}`);
          }
        }
        const notHardware = (line: PriceLine) => line.kind !== "hardware";
        expect(priceLinesOf(design, shipped).lines.filter(notHardware)).toEqual(
          priceLinesOf(design, before).lines.filter(notHardware),
        );
      }

      expect(wrong).toEqual([]);
      expect(latchedLeaves).toBeGreaterThan(100);
    },
  );
});

describe("W1-2/W1-3 over generated kitchens: the top-row corners follow the top row's handle and the kitchen's never reaches them", () => {
  it.each(["steel", "black"] as const)(
    "bills no latch on a top-row corner whose top row's handle is %s (it was latched by the slot alone), and nothing else moves",
    (topRowHandle) => {
      const shipped = buildKitchenLBodyCatalog(600);
      const before = catalogWithCornersTakingNoHandle(shipped);
      let unlatchedLeaves = 0;

      for (const { design: generated, cabinetDepthMm } of KITCHENS) {
        if (cabinetDepthMm !== 600) continue;
        const design = withKitchenHandles(generated, { topRowHandle });
        const was = countsPerPlacement(design, before);
        const is = countsPerPlacement(design, shipped);

        for (const entry of entriesOf(design, shipped)) {
          const losesLeaves =
            isHandleCarryingCorner(entry) && entry.y0Mm >= TOP_ROW_Y0_MM
              ? doorLeavesOf(entry, shipped)
              : 0;
          unlatchedLeaves += losesLeaves;
          const wasCounts = was.get(entry.placementId);
          expect(is.get(entry.placementId)).toEqual(
            wasCounts && {
              ...wasCounts,
              pushToOpen: wasCounts.pushToOpen - losesLeaves,
            },
          );
        }
      }

      expect(unlatchedLeaves).toBeGreaterThan(20);
    },
  );

  it("never lets the kitchen's handle reach a top-row corner: black, steel and push all price and count alike there", () => {
    const shipped = buildKitchenLBodyCatalog(600);
    const topRowCornerCounts = (handle: Handle) =>
      KITCHENS.filter(({ cabinetDepthMm }) => cabinetDepthMm === 600).map(
        ({ design }) => {
          const withHandle = withKitchenHandles(design, { handle });
          const counts = countsPerPlacement(withHandle, shipped);
          return entriesOf(withHandle, shipped)
            .filter(
              (entry) =>
                isHandleCarryingCorner(entry) && entry.y0Mm >= TOP_ROW_Y0_MM,
            )
            .map((entry) => counts.get(entry.placementId));
        },
      );

    expect(topRowCornerCounts("black")).toEqual(topRowCornerCounts("steel"));
    expect(topRowCornerCounts("push")).toEqual(topRowCornerCounts("steel"));
  });
});

describe("a handle type has no price of its own (ADR 0182's inference, falsified by a handle-priced line)", () => {
  it("prices a black kitchen exactly as a steel one, over every generated kitchen", () => {
    const shipped = buildKitchenLBodyCatalog(600);

    for (const { label, design, cabinetDepthMm } of KITCHENS) {
      if (cabinetDepthMm !== 600) continue;
      expect(
        priceLinesOf(withKitchenHandles(design, { handle: "black" }), shipped),
        label,
      ).toEqual(
        priceLinesOf(withKitchenHandles(design, { handle: "steel" }), shipped),
      );
    }
  });
});

describe("the claim the specimens rest on: no shipped row takes no handle and opens a front", () => {
  it.each(DEPTHS_MM)(
    "has no front and no cabinet handle on any canHandle:false row at %i mm, at any width and frame height",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const handleless = [...catalog].filter(
        ([, definition]) => !definition.canHandle,
      );
      const opening: string[] = [];

      for (const [buildId, definition] of handleless) {
        for (let widthMm = 150; widthMm <= 1_500; widthMm += 25) {
          for (
            let frameHeightMm = 200;
            frameHeightMm <= 2_400;
            frameHeightMm += 100
          ) {
            const fronts = openingFrontCount({
              buildId,
              rule: definition.fronts,
              widthMm,
              frameHeightMm,
            });
            if (fronts > 0)
              opening.push(
                `${buildId} ${String(widthMm)}x${String(frameHeightMm)}`,
              );
          }
        }
      }

      expect(opening).toEqual([]);
      expect(handleless.map(([buildId]) => buildId)).toContain(
        BASE_CORNER_RETURN_BUILD_ID,
      );
    },
  );
});

describe("a handle stored on base-corner-return-320, which has no front, no bar and takes no handle", () => {
  const STORED_HANDLES: readonly Handle[] = ["steel", "black", "push"];
  const KITCHEN_SETTINGS: readonly {
    handle?: Handle;
    topRowHandle?: Handle;
  }[] = [{}, { handle: "push" }, { handle: "black", topRowHandle: "steel" }];
  const catalog = buildKitchenLBodyCatalog(600);

  function handEdited(
    stored: Handle,
    settings: { handle?: Handle; topRowHandle?: Handle },
  ) {
    return withBodyOf(
      BASE_CORNER_RETURN_ID,
      { handle: stored },
      withKitchenHandles(KITCHEN_L_DESIGN, settings),
    );
  }

  it.each(STORED_HANDLES)(
    "is priced and counted exactly as without it, stored as %s, under every kitchen handle",
    (stored) => {
      for (const settings of KITCHEN_SETTINGS) {
        const without = withKitchenHandles(KITCHEN_L_DESIGN, settings);
        const edited = handEdited(stored, settings);

        expect(priceLinesOf(edited, catalog)).toEqual(
          priceLinesOf(without, catalog),
        );
        expect([...countsPerPlacement(edited, catalog)]).toEqual([
          ...countsPerPlacement(without, catalog),
        ]);
      }
    },
  );

  it.each(STORED_HANDLES)(
    "is read as wearing no handle by the display projection, stored as %s",
    (stored) => {
      const entry = entriesOf(handEdited(stored, {}), catalog).find(
        (candidate) => candidate.placementId === BASE_CORNER_RETURN_ID,
      );

      expect(entry?.buildId).toBe(BASE_CORNER_RETURN_BUILD_ID);
      expect(entry?.wornHandle).toBeUndefined();
    },
  );

  it.each(STORED_HANDLES)(
    "names nothing to availability when %s is switched off, so the design still prices",
    (stored) => {
      const result = priceUnder(
        availabilityOf([handleItem(stored)]),
        handEdited(stored, {}),
      );

      expect(result.ok).toBe(true);
    },
  );

  it.each(STORED_HANDLES)(
    "stays a loadable document through the migration seam, stored as %s",
    (stored) => {
      const document = handEdited(stored, {});

      expect(migrateDesign(CURRENT_SCHEMA_VERSION, document)).toEqual(document);
    },
  );

  it("refuses a handle written through the command, as before", () => {
    const refused = setHandle({
      design: handEdited("black", {}),
      catalog,
      target: { kind: "placement", id: BASE_CORNER_RETURN_ID },
      handle: "push",
      occurredAt: OCCURRED_AT,
    });

    expect(refused.ok).toBe(false);
  });

  it("is rewritten by a handle replacement like any stored handle, and the rewrite changes neither price nor count nor reading", () => {
    const edited = handEdited("black", { handle: "steel" });
    const replaced = replaceHandle({
      design: edited,
      from: "black",
      to: "push",
      occurredAt: OCCURRED_AT,
    });
    if (!replaced.ok) throw new Error("the replacement was refused");
    const storedOn = (design: Design) =>
      design.placements.find(
        (placement) => placement.id === BASE_CORNER_RETURN_ID,
      )?.body.handle;

    expect(storedOn(replaced.design)).toBe("push");
    expect(priceLinesOf(replaced.design, catalog)).toEqual(
      priceLinesOf(edited, catalog),
    );
    expect([...countsPerPlacement(replaced.design, catalog)]).toEqual([
      ...countsPerPlacement(edited, catalog),
    ]);
    expect(
      entriesOf(replaced.design, catalog).find(
        (entry) => entry.placementId === BASE_CORNER_RETURN_ID,
      )?.wornHandle,
    ).toBeUndefined();
  });
});

describe("the wall corner unit, which no seeded design stands, takes the kitchen's handle like the other corners", () => {
  it("is latched once under a push kitchen below the top row and not at all under a black one", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const unitCounts = (handle: Handle) => {
      const design = withKitchenHandles(
        {
          ...KITCHEN_L_DESIGN,
          placements: [
            ...KITCHEN_L_DESIGN.placements,
            ...CORNER_WALL_UNIT_TEMPLATES,
          ],
        },
        { handle },
      );
      const counts = countsPerPlacement(design, catalog);
      return entriesOf(design, catalog)
        .filter((entry) => entry.buildId === WALL_CORNER_UNIT_BUILD_ID)
        .map((entry) => counts.get(entry.placementId)?.pushToOpen);
    };

    expect(unitCounts("push")).toEqual([1]);
    expect(unitCounts("black")).toEqual([0]);
  });
});
