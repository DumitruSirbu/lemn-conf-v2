// **M12 wave W3b adversarial QA (ADR 0183 decision 4): the seeded cabinet over the freestanding fridge, `p24`, through the
// real store, the real probe and the real scene.**
//
// The implementer's evidence for "p24 cannot be carried to a stale depth" (the `KNOWN_HAZARD_ENTRIES` note in
// `cabinet-depth-legacy-fallback.test.ts`) was a scratch run on the fake probe that, in its own words, did not reach the
// hazard's path. This file reaches it, and asserts what the flows have in common rather than one example:
//
//   - **I1** the body drawn is the body recorded: a wall cabinet's mounted depth is its record's frame depth plus the front
//     assembly, with its back face on the wall plane, in every state of every flow (a seeded decomposition ignores the
//     depth it is asked for, so a record and a mesh could part company the moment `p24` is re-planned away from 700);
//   - **I2** the seeded over-fridge row never becomes the recorded depth source of a wall-B column while the fridge was
//     ever in the document: the fridge's 742 always sets its column's depth (the implementer's inference, measured here);
//   - **I3** after a depth change, a body whose row declares the fridge arm stands over a column that says a fridge is
//     under it (the row-level declaration and the column's `hasDeepWallBodyUnder` do not drift past a re-plan);
//   - **I4** after a depth change, every wall cabinet is at its own column's build depth, less the front assembly.
//
// The hazard's own path is separate: a document that arrives with the fridge already gone has no recorded extent, so the
// column over `p24` is derived from `p24` alone and carries `p24`'s row as its source.
import {
  buildKitchenLBodyCatalog,
  columnBuildDepthMm,
  createBodyProbeLease,
  declaresTheDeepestCabinetDepth,
  DesignSchema,
  KITCHEN_L_DESIGN,
  WALL_FRONT_ASSEMBLY_MM,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import {
  createBodyProbe,
  disposeKit,
  makeKit,
  syncSolidBodies,
} from "@lemnaria/three-adapter";
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createHeadlessCanvas } from "../support/headless-canvas";

const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
const FRIDGE_ID = "p7";
const OVER_THE_FRIDGE_ID = "p24";
const OVER_THE_FRIDGE_ROW = "wall-2door-700-over-fridge";
const WALL_B = "B";
/** The owner's number (ADR 0183 decision 4), written out and not read from the rule under test. */
const OVER_THE_FRIDGE_FINISHED_MM = 700;
const HALF_A_MILLIMETRE_M = 0.0005;
const ONE_MICROMETRE_M = 1e-6;
const FRONT_ASSEMBLY_M = WALL_FRONT_ASSEMBLY_MM / 1000;

const realProbeAt: BodyProbeFactory = (cabinetDepthMm) => {
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  const room = kit.builders["kitchen-l"]();
  return createBodyProbeLease(createBodyProbe(kit, room), () => {
    disposeKit(kit, room);
  });
};

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeAt,
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function settingOf(store: Store): number {
  return store.getState().design.settings?.cabinetDepthMm ?? 600;
}

function removePlacementOf(store: Store, id: string): void {
  if (!store.getState().records.some((record) => record.id === id)) return;
  store.getState().select({ kind: "placement", id });
  store.getState().remove();
}

function setDepthOf(store: Store, cabinetDepthMm: number): void {
  store.getState().setCabinetDepth(cabinetDepthMm);
}

function swapFridgeForAFridge(store: Store): void {
  const fridge = store.getState().records.find(({ id }) => id === FRIDGE_ID);
  if (!fridge) return;
  store.getState().select({ kind: "placement", id: FRIDGE_ID });
  store.getState().insert("fridge-free");
}

/** Refused (`COLUMN_MEMBER_NOT_RESIZABLE`) while the fridge stands under the cabinet, which is why ADR 0101 decision 2's
 *  `neverMigratedByAResize` holds in the seeded state; accepted, and migrating the cabinet to `wall-cabinet`, once the
 *  fridge has been deleted (measured 2026-11-15). The sequences below reach it in that second state. */
function narrowOverTheFridgeTo600(store: Store): void {
  if (!store.getState().records.some(({ id }) => id === OVER_THE_FRIDGE_ID)) {
    return;
  }
  store.getState().select({ kind: "placement", id: OVER_THE_FRIDGE_ID });
  store.getState().setWidth(600);
}

/** The held design as a document predating recorded sources, as the sibling legacy suite builds one. */
function asLegacyDocument(store: Store): Store {
  const held = store.getState().design;
  const strip = (entry: EmptyColumn): EmptyColumn => {
    const stripped = { ...entry };
    delete stripped.depthFromBuildId;
    return stripped;
  };
  return createStore(
    DesignSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...held,
          emptyColumns: (held.emptyColumns ?? []).map(strip),
          columnExtents: (held.columnExtents ?? []).map(strip),
        }),
      ),
    ),
  );
}

type Operation =
  | "delete the fridge"
  | "delete the cabinet over the fridge"
  | "swap the fridge for a fridge"
  | "narrow the cabinet over the fridge"
  | "deepen to 700"
  | "shallow to 600";

const OPERATIONS: readonly Operation[] = [
  "delete the fridge",
  "delete the cabinet over the fridge",
  "swap the fridge for a fridge",
  "narrow the cabinet over the fridge",
  "deepen to 700",
  "shallow to 600",
];

function apply(store: Store, operation: Operation): void {
  switch (operation) {
    case "delete the fridge":
      removePlacementOf(store, FRIDGE_ID);
      break;
    case "delete the cabinet over the fridge":
      removePlacementOf(store, OVER_THE_FRIDGE_ID);
      break;
    case "swap the fridge for a fridge":
      swapFridgeForAFridge(store);
      break;
    case "narrow the cabinet over the fridge":
      narrowOverTheFridgeTo600(store);
      break;
    case "deepen to 700":
      setDepthOf(store, 700);
      break;
    case "shallow to 600":
      setDepthOf(store, 600);
      break;
  }
}

function isADepthChange(operation: Operation): boolean {
  return operation === "deepen to 700" || operation === "shallow to 600";
}

/** Every record mounted by the real scene sync, as the stage does it. */
function mountedBodies(store: Store): ReadonlyMap<string, THREE.Object3D> {
  const cabinetDepthMm = settingOf(store);
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  const root = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot: root,
    records: store.getState().records,
    room: store.getState().design.room,
  });
  root.updateMatrixWorld(true);
  return new Map(
    root.children.map((child) => [String(child.userData.placementId), child]),
  );
}

interface Violation {
  readonly invariant: string;
  readonly detail: string;
}

/** I1: a wall cabinet is drawn as deep as it is recorded, back face on the wall plane. */
function drawnAsRecorded(store: Store): readonly Violation[] {
  const bodies = mountedBodies(store);
  const found: Violation[] = [];
  for (const record of store.getState().records) {
    if (record.kind !== "wall_cabinet" || record.wall !== WALL_B) continue;
    const body = bodies.get(record.id);
    if (!body) {
      found.push({ invariant: "I1", detail: `${record.id} is not mounted` });
      continue;
    }
    const box = new THREE.Box3().setFromObject(body);
    const drawnM = box.max.x - box.min.x;
    const recordedM = record.frame.d + FRONT_ASSEMBLY_M;
    if (Math.abs(drawnM - recordedM) > HALF_A_MILLIMETRE_M) {
      found.push({
        invariant: "I1",
        detail: `${record.id} (${record.buildId}) is drawn ${drawnM.toFixed(4)} m deep and recorded ${recordedM.toFixed(4)} m`,
      });
    }
    if (Math.abs(box.min.x) > ONE_MICROMETRE_M) {
      found.push({
        invariant: "I1",
        detail: `${record.id} back face is at ${box.min.x.toFixed(6)}, not on the wall plane`,
      });
    }
  }
  return found;
}

/** I2: no wall-B column has the seeded over-fridge row as its recorded depth source. */
function overTheFridgeIsNoColumnsSource(store: Store): readonly Violation[] {
  return [...store.getState().columns]
    .filter(
      ([, column]) =>
        column.wall === WALL_B &&
        column.depthFromBuildId === OVER_THE_FRIDGE_ROW,
    )
    .map(([key]) => ({
      invariant: "I2",
      detail: `column ${key} takes its depth from ${OVER_THE_FRIDGE_ROW}`,
    }));
}

/** I3: a body that declares the fridge arm stands over a column that says a fridge is under it. */
function declarationAgreesWithItsColumn(store: Store): readonly Violation[] {
  const catalog = buildKitchenLBodyCatalog(settingOf(store));
  return store
    .getState()
    .records.filter((record) =>
      declaresTheDeepestCabinetDepth(catalog.get(record.buildId)),
    )
    .filter(
      (record) =>
        store.getState().columns.get(record.col)?.hasDeepWallBodyUnder !== true,
    )
    .map((record) => ({
      invariant: "I3",
      detail: `${record.id} declares the fridge arm over column ${record.col}, which has no fridge under it`,
    }));
}

/** I4: a wall cabinet is built to what its own column answers, less the front assembly. */
function atItsColumnsBuildDepth(store: Store): readonly Violation[] {
  const found: Violation[] = [];
  for (const record of store.getState().records) {
    if (record.kind !== "wall_cabinet" || record.wall !== WALL_B) continue;
    const column = store.getState().columns.get(record.col);
    if (!column) continue;
    const answerMm = columnBuildDepthMm({
      cabinetDepthMm: settingOf(store),
      hasFullHeightUnder: column.hasFullHeightUnder,
      hasDeepWallBodyUnder: column.hasDeepWallBodyUnder,
    });
    const recordedMm =
      Math.round(record.frame.d * 1000) + WALL_FRONT_ASSEMBLY_MM;
    if (recordedMm !== answerMm) {
      found.push({
        invariant: "I4",
        detail: `${record.id} (${record.buildId}) is built ${String(recordedMm)} mm deep at ${String(settingOf(store))} and its column ${record.col} answers ${String(answerMm)}`,
      });
    }
  }
  return found;
}

function violationsAfter(store: Store, operation: Operation): Violation[] {
  return [
    ...drawnAsRecorded(store),
    ...overTheFridgeIsNoColumnsSource(store),
    ...(isADepthChange(operation)
      ? [
          ...declarationAgreesWithItsColumn(store),
          ...atItsColumnsBuildDepth(store),
        ]
      : []),
  ];
}

function runFlow(
  operations: readonly Operation[],
  start: Design = KITCHEN_L_DESIGN,
): { readonly violations: string[]; readonly store: Store } {
  const store = createStore(start);
  const violations: string[] = [];
  operations.forEach((operation, step) => {
    apply(store, operation);
    for (const found of violationsAfter(store, operation)) {
      violations.push(
        `after ${operations.slice(0, step + 1).join(" > ")}: ${found.invariant} ${found.detail}`,
      );
    }
  });
  return { violations, store };
}

describe("the seeded cabinet over the fridge is drawn as it is recorded, whatever happens to the fridge under it", () => {
  const NAMED_FLOWS: readonly (readonly Operation[])[] = [
    ["delete the fridge", "deepen to 700", "shallow to 600", "deepen to 700"],
    ["deepen to 700", "delete the fridge", "shallow to 600", "deepen to 700"],
    ["swap the fridge for a fridge", "deepen to 700", "shallow to 600"],
    ["deepen to 700", "swap the fridge for a fridge", "shallow to 600"],
    [
      "delete the fridge",
      "narrow the cabinet over the fridge",
      "deepen to 700",
    ],
    [
      "delete the fridge",
      "delete the cabinet over the fridge",
      "deepen to 700",
      "shallow to 600",
    ],
    [
      "delete the cabinet over the fridge",
      "delete the fridge",
      "deepen to 700",
      "shallow to 600",
    ],
  ];

  it.each(NAMED_FLOWS.map((flow) => [flow.join(" > "), flow] as const))(
    "holds I1-I4 along %s",
    (_name, flow) => {
      const { violations } = runFlow(flow);

      expect(violations).toStrictEqual([]);
    },
  );

  it("holds I1-I4 along any sequence of the six operations (sweep over shuffled flows)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...OPERATIONS), {
          minLength: 1,
          maxLength: 7,
        }),
        (flow) => runFlow(flow).violations.length === 0,
      ),
      { numRuns: 120, seed: 20261115 },
    );
  });

  it("repeats itself: one flow, run twice, ends in one design", () => {
    const flow: readonly Operation[] = [
      "delete the fridge",
      "deepen to 700",
      "swap the fridge for a fridge",
      "shallow to 600",
    ];

    expect(runFlow(flow).store.getState().design).toStrictEqual(
      runFlow(flow).store.getState().design,
    );
  });

  it("is non-vacuous: the flows really put the cabinet through a re-plan and a rename", () => {
    const { store } = runFlow(["delete the fridge", "deepen to 700"]);
    const over = store
      .getState()
      .records.find((record) => record.id === OVER_THE_FRIDGE_ID);

    expect(over?.buildId).toBe("wall-cabinet");
    expect(
      Math.round((over?.frame.d ?? 0) * 1000) + WALL_FRONT_ASSEMBLY_MM,
    ).toBe(400);
  });
});

describe("the seeded cabinet over the fridge keeps the fridge arm while the fridge stands, and gives it up the moment a depth change finds none", () => {
  it.each([600, 700])(
    "stands 700 deep at %i mm with the fridge under it",
    (cabinetDepthMm) => {
      const store = createStore();
      if (cabinetDepthMm === 700) setDepthOf(store, 700);
      const record = store
        .getState()
        .records.find(({ id }) => id === OVER_THE_FRIDGE_ID);

      expect(
        Math.round((record?.frame.d ?? 0) * 1000) + WALL_FRONT_ASSEMBLY_MM,
      ).toBe(OVER_THE_FRIDGE_FINISHED_MM);
      expect(
        store.getState().columns.get(record?.col ?? "")?.hasDeepWallBodyUnder,
      ).toBe(true);
    },
  );

  it.each([600, 700])(
    "stays 700 deep when the fridge is swapped for the catalogue's fridge, and through the depth changes after it (start %i mm)",
    (start) => {
      const store = createStore();
      if (start === 700) setDepthOf(store, 700);
      const finishedMm = () => {
        const record = store
          .getState()
          .records.find(({ id }) => id === OVER_THE_FRIDGE_ID);
        return (
          Math.round((record?.frame.d ?? 0) * 1000) + WALL_FRONT_ASSEMBLY_MM
        );
      };

      swapFridgeForAFridge(store);
      const trail = [finishedMm()];
      for (const cabinetDepthMm of [600, 700, 600]) {
        setDepthOf(store, cabinetDepthMm);
        trail.push(finishedMm());
      }

      expect(store.getState().lastRejection).toBeNull();
      expect(trail).toStrictEqual(trail.map(() => OVER_THE_FRIDGE_FINISHED_MM));
    },
  );

  it("is left at its recorded 700 by a delete and re-planned by the next depth change, as ADR 0103 rules", () => {
    const store = createStore();

    removePlacementOf(store, FRIDGE_ID);
    const afterTheDelete = store
      .getState()
      .records.find(({ id }) => id === OVER_THE_FRIDGE_ID);
    setDepthOf(store, 700);
    const afterTheDepthChange = store
      .getState()
      .records.find(({ id }) => id === OVER_THE_FRIDGE_ID);

    expect(afterTheDelete?.buildId).toBe(OVER_THE_FRIDGE_ROW);
    expect(Math.round((afterTheDelete?.frame.d ?? 0) * 1000)).toBe(661);
    expect(Math.round((afterTheDepthChange?.frame.d ?? 0) * 1000)).toBe(361);
  });
});

describe("the declared hazard, reached on its own path: a document that arrives without the fridge", () => {
  // No recorded extents: the column over `p24` is derived from `p24` alone, so its depth source is `p24`'s row (the case
  // the implementer's scratch run did not reach). Deleting `p24` then leaves a member-less opening whose frozen depth is
  // re-asked of that row at every setting.
  function documentWithoutTheFridge(cabinetDepthMm: number): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        ({ id }) => id !== FRIDGE_ID,
      ),
      settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
    };
  }

  function overTheFridgeColumn(store: Store) {
    const found = [...store.getState().columns].filter(
      ([, column]) =>
        column.wall === WALL_B &&
        column.depthFromBuildId === OVER_THE_FRIDGE_ROW,
    );
    return found.map(([, column]) => column);
  }

  it("derives a column sourced by the seeded row, so the sweep's hazard shape is real (non-vacuous)", () => {
    const store = createStore(documentWithoutTheFridge(600));

    const [column] = overTheFridgeColumn(store);

    expect(overTheFridgeColumn(store)).toHaveLength(1);
    expect(Math.round((column?.d ?? 0) * 1000)).toBe(
      OVER_THE_FRIDGE_FINISHED_MM,
    );
  });

  it.each([
    { start: 600, then: [700, 600, 700, 600] },
    { start: 700, then: [600, 700, 600] },
  ])(
    "gives its sourced twin and its legacy twin one depth at every setting after the cabinet goes (start $start)",
    ({ start, then }) => {
      const sourced = createStore(documentWithoutTheFridge(start));
      removePlacementOf(sourced, OVER_THE_FRIDGE_ID);
      const legacy = asLegacyDocument(sourced);
      const trail: string[] = [];

      for (const cabinetDepthMm of then) {
        setDepthOf(sourced, cabinetDepthMm);
        setDepthOf(legacy, cabinetDepthMm);
        const opening = (store: Store) =>
          [...store.getState().columns]
            .filter(([, column]) => column.wall === WALL_B)
            .map(([, column]) => Math.round(column.d * 1000))
            .sort();
        trail.push(
          `${String(cabinetDepthMm)}: ${JSON.stringify(opening(sourced))} vs ${JSON.stringify(opening(legacy))}`,
        );
        expect(opening(sourced), trail.join(" | ")).toStrictEqual(
          opening(legacy),
        );
      }
    },
  );

  it("never leaves a live body carried to a depth it was not built to when the document had no fridge", () => {
    for (const start of [600, 700]) {
      const { violations } = runFlow(
        ["deepen to 700", "shallow to 600", "deepen to 700"],
        documentWithoutTheFridge(start),
      );

      expect(violations, `start ${String(start)}`).toStrictEqual([]);
    }
  });
});
