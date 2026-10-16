// The version 1 arm still cuts a 1600 mm entry at 800, a current-version document carries the same 1600 whole, and
// the load-time merge decides whether the two derive one map.
import { describe, expect, it } from "vitest";

import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import type { Design, EmptyColumn } from "../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import {
  derivePlacementRecords,
  deriveRecordedColumns,
  projectEmptyColumns,
} from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

/** No placements, and a room that is not the 3600 × 2400 the room correction rewrites, so the only arm either
 *  document walks that touches `emptyColumns` is version 1's split. */
const EMPTY_ROOM: Design = {
  room: { shape: "L", widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [],
  settings: { cabinetDepthMm: 600 },
  createdAt: NOW,
  updatedAt: NOW,
};

const WIDE_ENTRY: EmptyColumn = {
  wall: "A",
  alongMm: 1800,
  widthMm: 1600,
  y0Mm: 0,
  topMm: 2600,
  depthMm: 580,
};

const STORED = { ...EMPTY_ROOM, emptyColumns: [WIDE_ENTRY] };

function load(schemaVersion: number, design: Design): Design {
  return migrateDesign(
    schemaVersion,
    JSON.parse(JSON.stringify(design)) as unknown,
    CATALOG,
  );
}

/** The recorded map a load derives, projected back to whole-millimetre entries so float noise cannot decide it. */
function recordedMapOf(
  design: Design,
  mergeWidthLimitMm?: number,
): readonly EmptyColumn[] {
  const records = derivePlacementRecords(design, CATALOG);
  const columns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
    mergeWidthLimitMm,
  );
  return projectEmptyColumns(columns, records);
}

describe("a 1600 mm entry stored at version 1 and at the current version", () => {
  it("is cut 800 + 800 by the version 1 arm and carried whole at the current version", () => {
    expect(
      load(1, STORED).emptyColumns?.map((entry) => entry.widthMm),
    ).toStrictEqual([800, 800]);
    expect(load(CURRENT_SCHEMA_VERSION, STORED).emptyColumns).toStrictEqual([
      WIDE_ENTRY,
    ]);
  });

  it("loads at the current version as a fixed point", () => {
    const loaded = load(CURRENT_SCHEMA_VERSION, STORED);

    expect(load(CURRENT_SCHEMA_VERSION, loaded)).toStrictEqual(loaded);
  });

  /** The merge is the only difference: uncapped, the version 1 pieces rejoin into the stored 1600. */
  it("derives one map from both once the merge is uncapped", () => {
    const fromVersionOne = recordedMapOf(
      load(1, STORED),
      Number.POSITIVE_INFINITY,
    );
    const fromCurrent = recordedMapOf(
      load(CURRENT_SCHEMA_VERSION, STORED),
      Number.POSITIVE_INFINITY,
    );

    expect(fromVersionOne).toStrictEqual([WIDE_ENTRY]);
    expect(fromCurrent).toStrictEqual([WIDE_ENTRY]);
  });

  // See 8U plan §10 criterion 14.
  it("derives one map from both under the editor's own merge limit", () => {
    const fromVersionOne = recordedMapOf(load(1, STORED));

    expect(fromVersionOne).toStrictEqual([WIDE_ENTRY]);
    expect(fromVersionOne).toStrictEqual(
      recordedMapOf(load(CURRENT_SCHEMA_VERSION, STORED)),
    );
  });
});
