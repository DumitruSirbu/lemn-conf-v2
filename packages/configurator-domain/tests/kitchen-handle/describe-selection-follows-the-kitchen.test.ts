import { describe, expect, it } from "vitest";

import type { Handle } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import type { PlacementRecord } from "../../src/void-engine.js";
import { createWorld } from "../support/kitchen-world.js";

const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];
const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function recordWhere(
  predicate: (record: PlacementRecord) => boolean,
  what: string,
): PlacementRecord {
  const found = world.records.find(predicate);
  if (!found) throw new Error(`the seeded kitchen has no ${what}`);
  return found;
}

/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;

const isTopRow = (record: PlacementRecord) =>
  Math.round(record.frame.y0 * 1000) >= MODULE_LINE_MM;

const BELOW_THE_TOP_ROW = recordWhere(
  (record) => record.canHandle && !isTopRow(record),
  "body below the top row that takes a handle",
);
const TOP_ROW = recordWhere(
  (record) => record.canHandle && isTopRow(record),
  "top-row body that takes a handle",
);
const TAKES_NO_HANDLE = recordWhere(
  (record) => !record.canHandle && !isTopRow(record),
  "body below the top row that takes no handle",
);

function metaOf(record: PlacementRecord, kitchenHandle?: Handle) {
  const meta = describeSelection({
    ...world,
    target: { kind: "placement", id: record.id },
    kitchenSettings: { handle: kitchenHandle },
  });
  if (!meta) throw new Error(`${record.id} did not resolve`);
  return meta;
}

describe("describeSelection with a kitchen handle", () => {
  it("marks the kitchen's handle as the default of a body below the top row that has chosen none", () => {
    for (const kitchenHandle of EVERY_HANDLE) {
      const meta = metaOf(BELOW_THE_TOP_ROW, kitchenHandle);

      expect(meta.defaultHandle).toBe(kitchenHandle);
      expect(meta).not.toHaveProperty("handle");
    }
  });

  it("never gives the top row the kitchen's handle", () => {
    for (const kitchenHandle of EVERY_HANDLE) {
      expect(metaOf(TOP_ROW, kitchenHandle).defaultHandle).toBe("push");
    }
  });

  it("never gives a body that takes no handle the kitchen's", () => {
    for (const kitchenHandle of EVERY_HANDLE) {
      const meta = metaOf(TAKES_NO_HANDLE, kitchenHandle);

      expect(meta.defaultHandle).toBe("steel");
      expect(meta).not.toHaveProperty("handle");
    }
  });

  // `meta.handle` has always echoed the document; only the kitchen's handle must not arrive.
  it("still echoes a hand-edited handle on a body that takes none, and still adds no kitchen handle", () => {
    const handEdited = createWorld(
      {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) =>
          placement.id === TAKES_NO_HANDLE.id
            ? { ...placement, body: { ...placement.body, handle: "black" } }
            : placement,
        ),
      },
      KITCHEN_L_BODY_CATALOG,
    );

    const meta = describeSelection({
      ...handEdited,
      target: { kind: "placement", id: TAKES_NO_HANDLE.id },
      kitchenSettings: { handle: "push" },
    });

    expect(meta?.handle).toBe("black");
    expect(meta?.defaultHandle).toBe("steel");
  });

  it("keeps a cabinet's own handle as its `handle` under any kitchen handle", () => {
    const choosing = createWorld(
      {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) =>
          placement.id === BELOW_THE_TOP_ROW.id
            ? { ...placement, body: { ...placement.body, handle: "black" } }
            : placement,
        ),
      },
      KITCHEN_L_BODY_CATALOG,
    );

    for (const kitchenHandle of EVERY_HANDLE) {
      const meta = describeSelection({
        ...choosing,
        target: { kind: "placement", id: BELOW_THE_TOP_ROW.id },
        kitchenSettings: { handle: kitchenHandle },
      });

      expect(meta?.handle).toBe("black");
    }
  });

  it("answers as before when the kitchen has chosen none: the cabinet's own handle, else the slot's default", () => {
    for (const record of world.records) {
      expect(metaOf(record).handle).toBe(record.handleMode);
      expect(metaOf(record).defaultHandle).toBe(
        isTopRow(record) ? "push" : "steel",
      );
    }
  });
});
