// Wave 6L QA, adapter half. The wave's own two files assert the declaration against the meshes at
// each row's declared *chips* and the apply path at each row's *narrowest* width. Both are the
// widths a sweep is cheapest at, and neither is the width a defect would hide at:
//
// - a row whose declaration is right at 400 mm and wrong at 470 passes a chip-only gate, and 470 is
//   a width the stepper reaches (ADR 0035 decision 4);
// - a body whose narrowest form draws no second door cannot show a handle choice reaching one.
//
// So this file re-runs both halves over **every whole millimetre each row can be built at**, and
// adds the counterexamples the wave's own tests do not carry: a body with no handle at all, a body
// whose only handles are an appliance's, an arbitrary sequence of handle choices on one body, and
// the M1 fidelity gate — no geometry may move, only which meshes a choice reaches.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  cabinetHandleCount,
  CabinetBodySchema,
  KITCHEN_L_BODY_CATALOG,
  TWO_DOOR_MIN_WIDTH_MM,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countBuiltCabinetHandles,
  isCabinetHandleGroup,
} from "../src/cabinet-handle-meshes.js";
import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import {
  applyBlackHandleMaterial,
  buildDecomposedBody,
  setHandlesVisible,
} from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Every mesh `barHandle` builds — the bar and its two stems — whoever the handle belongs to. */
const HANDLE_PART_NAME = /handle_bar|handle_stem/;

const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

const ALL_BUILD_IDS: readonly string[] = [
  ...CATALOG_BUILD_IDS,
  ...SEEDED_BUILD_IDS,
];

/** The rows whose door count — and therefore whose handle count — follows the width they are built
 *  to. Derived from the declaration rather than listed, so a fourth row added tomorrow is swept. */
const WIDTH_FOLLOWING_BUILD_IDS: readonly string[] = CATALOG_BUILD_IDS.filter(
  (buildId) => definitionOf(buildId).doorCountFollowsWidth === true,
);

/** §5.5's three settings, and how the two apply functions carry each one out. `steel` is the
 *  builder's own material and the visible state, so it is the absence of both calls. */
const HANDLE_SETTINGS = ["steel", "black", "push"] as const;
type HandleSetting = (typeof HANDLE_SETTINGS)[number];

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

function buildBodyOf(buildId: string, widthMm?: number): THREE.Group {
  const definition = definitionOf(buildId);
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: (widthMm ?? definition.sizesMm?.[0] ?? 0) / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

function declaredHandlesOf(buildId: string, widthMm: number): number {
  return cabinetHandleCount({
    buildId,
    rule: definitionOf(buildId).cabinetHandles,
    widthMm,
  });
}

/** Every whole millimetre this row declares it can be built at — the bound, not the chips. A
 *  discrete row's degenerate ranges collapse to its own sizes, so one helper covers both models. */
function everyBuildableWidthMm(buildId: string): readonly number[] {
  const widths: number[] = [];
  for (const range of definitionOf(buildId).widthRangesMm ?? []) {
    for (let mm = range.minMm; mm <= range.maxMm; mm += 1) widths.push(mm);
  }
  return widths;
}

interface HandleParts {
  readonly cabinet: readonly THREE.Mesh[];
  readonly appliance: readonly THREE.Mesh[];
  readonly others: readonly THREE.Mesh[];
}

/** Every mesh on this body, split three ways in one traversal so nothing falls out of all three. */
function partsOf(body: THREE.Object3D): HandleParts {
  const cabinet: THREE.Mesh[] = [];
  const appliance: THREE.Mesh[] = [];
  const others: THREE.Mesh[] = [];

  body.traverse((node) => {
    if (!isMesh(node)) return;
    if (!HANDLE_PART_NAME.test(node.name)) {
      others.push(node);
      return;
    }
    const belongsToCabinet = node.parent
      ? isCabinetHandleGroup(node.parent)
      : false;
    (belongsToCabinet ? cabinet : appliance).push(node);
  });

  return { cabinet, appliance, others };
}

function applySetting(body: THREE.Group, setting: HandleSetting): void {
  setHandlesVisible(body, setting !== "push");
  if (setting === "black") applyBlackHandleMaterial(body, kit.M);
}

/** What a mesh is and where it stands, as one comparable string. Materials are deliberately not in
 *  it: a handle choice is *allowed* to change a material and is not allowed to move anything. */
function describeGeometry(mesh: THREE.Mesh): string {
  return [
    mesh.name,
    mesh.geometry.uuid,
    mesh.position.toArray().join(","),
    mesh.quaternion.toArray().join(","),
    mesh.scale.toArray().join(","),
  ].join("|");
}

function snapshotGeometry(body: THREE.Object3D): string[] {
  const rows: string[] = [];
  body.traverse((node) => {
    if (isMesh(node)) rows.push(describeGeometry(node));
  });
  return rows;
}

describe("the declaration holds at every width a row can be built at, not only at its chips", () => {
  it.each(CATALOG_BUILD_IDS)(
    "%s: declares the handles its builder draws at every whole millimetre in its range",
    (buildId) => {
      const mismatches: string[] = [];

      for (const widthMm of everyBuildableWidthMm(buildId)) {
        const built = countBuiltCabinetHandles(buildBodyOf(buildId, widthMm));
        const declared = declaredHandlesOf(buildId, widthMm);
        if (built !== declared) {
          mismatches.push(
            `${buildId}@${String(widthMm)}: declared ${String(declared)}, built ${String(built)}`,
          );
        }
      }

      expect(mismatches).toEqual([]);
    },
  );

  // The sweep above is only worth its runtime if some row's count actually moves inside its own
  // range — otherwise it is 4 000 measurements of a constant.
  it("sweeps a range in which the count really does change", () => {
    expect(WIDTH_FOLLOWING_BUILD_IDS.length).toBeGreaterThan(0);

    for (const buildId of WIDTH_FOLLOWING_BUILD_IDS) {
      const widths = everyBuildableWidthMm(buildId);
      const counts = new Set(
        widths.map((widthMm) => declaredHandlesOf(buildId, widthMm)),
      );
      expect([buildId, counts.size]).toEqual([buildId, 2]);
    }
  });

  // ADR 0033's transition, measured on the **meshes** rather than on the declaration: the builder
  // and the price have to change their minds at the same millimetre, and a threshold that moved in
  // one of them and not the other is invisible to a gate that only compares them at the chips.
  it.each(WIDTH_FOLLOWING_BUILD_IDS)(
    "%s: the builder gains its second door at the same width the price gains its second handle",
    (buildId) => {
      const perDoor = declaredHandlesOf(buildId, TWO_DOOR_MIN_WIDTH_MM - 1);

      expect([
        buildId,
        countBuiltCabinetHandles(
          buildBodyOf(buildId, TWO_DOOR_MIN_WIDTH_MM - 1),
        ),
      ]).toEqual([buildId, perDoor]);
      expect([
        buildId,
        countBuiltCabinetHandles(buildBodyOf(buildId, TWO_DOOR_MIN_WIDTH_MM)),
      ]).toEqual([buildId, perDoor * 2]);
    },
  );

  // **The precondition the parity above rests on, pinned rather than assumed.** The builder derives
  // its door count from `toMillimetres(widthM)`, which *rounds*, and `cabinetHandleCount` reads the
  // width it is handed as it stands. So at a stored width of 499.5 mm the builder draws two doors
  // and the price bills one handle. Nothing in the product can reach that, because a body's width is
  // a whole millimetre at the schema boundary — which is the fact this test holds, so that relaxing
  // it fails here with the reason attached rather than in a price two waves later.
  it("cannot be handed a fractional width, which is the one place the two would part", () => {
    const body = {
      buildId: "base-cabinet",
      heightMm: 860,
    };

    expect(
      CabinetBodySchema.safeParse({ ...body, widthMm: TWO_DOOR_MIN_WIDTH_MM })
        .success,
    ).toBe(true);
    expect(
      CabinetBodySchema.safeParse({ ...body, widthMm: 499.5 }).success,
    ).toBe(false);

    // And the divergence the schema is standing in front of, measured so the reason is not folklore.
    const fractional = buildCatalogBody(kit, "base-cabinet", {
      widthM: 499.5 / 1000,
      heightM: 0.86,
      depthM: 0.58,
    });
    expect(countBuiltCabinetHandles(fractional)).toBe(2);
    expect(declaredHandlesOf("base-cabinet", 499.5)).toBe(1);
  });
});

describe("a handle choice reaches the cabinet's handles at every width, not only the narrowest", () => {
  it.each(CATALOG_BUILD_IDS)(
    "%s: push hides exactly the cabinet's handle parts at every width it declares",
    (buildId) => {
      for (const widthMm of definitionOf(buildId).sizesMm ?? []) {
        const body = buildBodyOf(buildId, widthMm);
        const parts = partsOf(body);
        const label = `${buildId}@${String(widthMm)}`;

        setHandlesVisible(body, false);

        expect([label, parts.cabinet.filter((p) => p.visible).length]).toEqual([
          label,
          0,
        ]);
        expect([label, parts.appliance.every((p) => p.visible)]).toEqual([
          label,
          true,
        ]);
        expect([label, parts.others.every((p) => p.visible)]).toEqual([
          label,
          true,
        ]);
        // The apply path and the priced count are the same population, at this width too.
        expect([label, parts.cabinet.length]).toEqual([
          label,
          declaredHandlesOf(buildId, widthMm) * 3,
        ]);
      }
    },
  );

  it.each(CATALOG_BUILD_IDS)(
    "%s: black repaints exactly the cabinet's handle parts at every width it declares",
    (buildId) => {
      for (const widthMm of definitionOf(buildId).sizesMm ?? []) {
        const body = buildBodyOf(buildId, widthMm);
        const parts = partsOf(body);
        const label = `${buildId}@${String(widthMm)}`;
        const materialsBefore = parts.others.map((part) => part.material);

        applyBlackHandleMaterial(body, kit.M);

        // Pinned to the **domain's** declaration, not to the adapter's own split: `partsOf` asks the
        // rule under test which handles are the cabinet's, so without this line a widened rule would
        // move both sides of the comparison together.
        expect([label, parts.cabinet.length]).toEqual([
          label,
          declaredHandlesOf(buildId, widthMm) * 3,
        ]);
        expect([
          label,
          parts.cabinet.filter((p) => p.material !== kit.M.steel).length,
        ]).toEqual([label, parts.cabinet.length]);
        expect([
          label,
          parts.appliance.every((p) => p.material === kit.M.steel),
        ]).toEqual([label, true]);
        // The half the wave's own sweep leaves out: a black chip must not reach a carcass, a door or
        // a worktop either.
        expect([label, parts.others.map((p) => p.material)]).toEqual([
          label,
          materialsBefore,
        ]);
      }
    },
  );
});

describe("a body with nothing of its own to hide", () => {
  // Three shapes of zero, and the wave's criteria name all three: an open shelf with no handle
  // anywhere, a hood with no front, and two bodies whose every bar belongs to an appliance.
  // `base-hob-oven` is asserted here **directly**, never through `canHandle: false`, so the exposure
  // cannot return if that flag is ever changed.
  it.each([
    ["open-shelf", 0],
    ["open-shelf-600", 0],
    ["hood", 0],
    ["hood-600", 0],
    ["base-hob-oven", 3],
    ["fridge-free", 6],
    ["fridge-free-700", 6],
    ["base-corner-return-320", 0],
  ])(
    "%s: both choices leave every mesh exactly as its builder made it",
    (buildId, applianceParts) => {
      const body = buildBodyOf(buildId);
      const parts = partsOf(body);
      const before = [...parts.appliance, ...parts.others].map((part) => ({
        part,
        visible: part.visible,
        material: part.material,
      }));

      expect([buildId, parts.cabinet.length]).toEqual([buildId, 0]);
      expect([buildId, parts.appliance.length]).toEqual([
        buildId,
        applianceParts,
      ]);
      expect([buildId, countBuiltCabinetHandles(body)]).toEqual([buildId, 0]);
      expect([buildId, declaredHandlesOf(buildId, 600)]).toEqual([buildId, 0]);

      setHandlesVisible(body, false);
      applyBlackHandleMaterial(body, kit.M);
      setHandlesVisible(body, true);

      for (const row of before) {
        expect([buildId, row.part.name, row.part.visible]).toEqual([
          buildId,
          row.part.name,
          row.visible,
        ]);
        expect([buildId, row.part.name, row.part.material]).toEqual([
          buildId,
          row.part.name,
          row.material,
        ]);
      }
    },
  );
});

describe("switching between the three settings, in any order", () => {
  // `scene-sync` rebuilds a body when a chip is tapped, so a long-lived group is not the shipped
  // path — but `setHandlesVisible` is called **both ways** at every mount, and a body that had its
  // handles hidden at build time (the seeded `*-top` arms) is re-shown through it. So the state after
  // a sequence has to depend on the sequence and not on how it was arrived at, and no sequence may
  // reach an appliance's bar or any other mesh.
  propertyTest.prop([
    fc.array(fc.constantFrom(...HANDLE_SETTINGS), {
      minLength: 1,
      maxLength: 8,
    }),
    fc.constantFrom(
      "tall-oven-tower",
      "tall-oven-tower-600",
      "base-cabinet",
      "wall-2door-600-top",
    ),
  ])(
    "leaves the cabinet's handles in the last setting's state and every other mesh untouched",
    (settings: readonly HandleSetting[], buildId: string) => {
      const body = buildBodyOf(buildId);
      const parts = partsOf(body);
      const applianceBefore = parts.appliance.map((part) => ({
        visible: part.visible,
        material: part.material,
      }));
      const othersBefore = parts.others.map((part) => ({
        visible: part.visible,
        material: part.material,
      }));

      for (const setting of settings) applySetting(body, setting);

      const last = settings[settings.length - 1];
      const everWentBlack = settings.includes("black");

      for (const part of parts.cabinet) {
        expect(part.visible).toBe(last !== "push");
        expect(part.material !== kit.M.steel).toBe(everWentBlack);
      }
      parts.appliance.forEach((part, index) => {
        expect(part.visible).toBe(applianceBefore[index]?.visible);
        expect(part.material).toBe(applianceBefore[index]?.material);
      });
      parts.others.forEach((part, index) => {
        expect(part.visible).toBe(othersBefore[index]?.visible);
        expect(part.material).toBe(othersBefore[index]?.material);
      });
    },
  );

  it("returns tall-oven-tower to its built state after a full round of all three", () => {
    const tower = buildBodyOf("tall-oven-tower");
    const parts = partsOf(tower);

    for (const setting of [
      "push",
      "black",
      "steel",
      "push",
      "steel",
    ] as const) {
      applySetting(tower, setting);
    }

    expect(parts.cabinet.filter((p) => p.visible)).toHaveLength(6);
    expect(parts.appliance.filter((p) => p.visible)).toHaveLength(6);
    expect(
      parts.appliance.filter((p) => p.material === kit.M.steel),
    ).toHaveLength(6);
  });
});

describe("the M1 fidelity gate: only which meshes a choice reaches", () => {
  it.each(ALL_BUILD_IDS)(
    "%s: no mesh moves, is added or is removed under any handle choice",
    (buildId) => {
      const body = buildBodyOf(buildId);
      const before = snapshotGeometry(body);

      for (const setting of HANDLE_SETTINGS) applySetting(body, setting);

      expect([buildId, snapshotGeometry(body)]).toEqual([buildId, before]);
    },
  );
});
