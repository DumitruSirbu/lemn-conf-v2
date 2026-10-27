// **Wave H1b item (0) QA (M10): the review row, the price and the scene name the same handle for every body.**
//
// `review-resolved-handle.test.ts` pins the seeded kitchen. This file attacks the seam with random designs: every kitchen
// handle, own handles dealt over the placements, floors at 2199 / 2200 / 2201, bodies that take no handle, and cabinet
// depths 600 and 700 (the model builds its own catalogue from the design's depth, so a depth the catalogue is not
// built at would show here), and, since H2, the kitchen's top-row handle beside its handle. Each body's row is held to an oracle written out from the rule's words, the latches the
// rows imply are held to the price's count, and the scene is asked by meshes: a body drawn from the design must look
// as it does when the handle the row names is written onto it as its own, which a split between the row and the scene
// would break.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  countHardwareMechanisms,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  type BodyCatalog,
  type Design,
  type DesignPlacement,
  type DisplayEntry,
  type Handle,
} from "@lemnaria/configurator-domain";
import { makeKit, syncSolidBodies, type Kit } from "@lemnaria/three-adapter";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { describeReview, type AvailableReview } from "@/review/review-model";

import roMessages from "../../src/messages/ro.json";
import { contentFor } from "../support/catalogues";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  generatePricedKitchen,
  priceAndProject,
} from "../support/generated-kitchens";
import { createHeadlessCanvas } from "../support/headless-canvas";

/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;
const BLACK_HANDLE_HEX = "1c1e20";
const WORDS = roMessages.panel.handleLabels;
const ALL_WORDS: readonly string[] = Object.values(WORDS);
const CHOICES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const choice = fc.constantFrom<Handle | undefined>(...CHOICES);
const floorChoice = fc.constantFrom<number | undefined>(
  undefined,
  MODULE_LINE_MM - 1,
  MODULE_LINE_MM,
  MODULE_LINE_MM + 1,
);

let kit: Kit;
let bases: readonly Design[];

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  const generated = generatePricedKitchen({
    shape: "L",
    widthMm: 3600,
    depthMm: 3000,
    heightMm: 2600,
  });
  const seeds = [
    KITCHEN_L_DESIGN,
    ...(generated.kind === "composed" ? [generated.kitchen.design] : []),
  ];
  bases = [...seeds, ...seeds.map(atDepth700)];
});

function atDepth700(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    cabinetDepthMm: 700,
    occurredAt: "2026-10-26T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(`depth refused: ${result.reason.code}`);
  return result.design;
}

interface Variation {
  readonly base: number;
  readonly own: readonly (Handle | undefined)[];
  readonly floors: readonly (number | undefined)[];
  readonly kitchen: Handle | undefined;
  readonly topRow: Handle | undefined;
}

const variation = fc.record({
  base: fc.nat({ max: 3 }),
  own: fc.array(choice, { minLength: 1, maxLength: 9 }),
  floors: fc.array(floorChoice, { minLength: 1, maxLength: 7 }),
  kitchen: choice,
  topRow: choice,
});

function designOf({ base, own, floors, kitchen, topRow }: Variation): Design {
  const root = bases[base % bases.length];
  if (!root) throw new Error("no base design");
  const placements = root.placements.map((placement, index) => {
    const handle = own[index % own.length];
    const floor = floors[index % floors.length];
    return {
      ...placement,
      ...(floor === undefined ? {} : { y0Mm: floor }),
      body:
        handle === undefined ? placement.body : { ...placement.body, handle },
    };
  });
  return {
    ...root,
    placements,
    ...(kitchen === undefined && topRow === undefined
      ? {}
      : {
          settings: {
            ...root.settings,
            ...(kitchen === undefined ? {} : { handle: kitchen }),
            ...(topRow === undefined ? {} : { topRowHandle: topRow }),
          },
        }),
  };
}

function reviewOf(design: Design): AvailableReview | undefined {
  const view = describeReview({
    content: contentFor("ro", roMessages),
    ...priceAndProject(design),
  });
  return view.kind === "available" ? view : undefined;
}

/**
 * What the row's second line must say of this body, from the rule's words: a body taking a handle wears its own, else
 * push on the top row, else the kitchen's, else steel; a body taking none wears push-to-open only when it is on the top
 * row and has a front that opens (the price bills a latch per such front), and nothing otherwise.
 */
function expectedWord(args: {
  readonly placement: DesignPlacement;
  readonly canHandle: boolean;
  readonly fronts: number;
  readonly kitchen: Handle | undefined;
  readonly topRow: Handle | undefined;
}): string | undefined {
  const { placement, canHandle, fronts, kitchen, topRow } = args;
  const isTopRow = placement.y0Mm >= MODULE_LINE_MM;
  if (!canHandle) return isTopRow && fronts > 0 ? WORDS.push : undefined;
  const wears =
    placement.body.handle ??
    (isTopRow ? (topRow ?? "push") : (kitchen ?? "steel"));
  return WORDS[wears];
}

function handleWordsOf(view: AvailableReview, id: string): string[] {
  const facts = view.rowDetails[id]?.facts;
  if (!facts) throw new Error(`no row detail for ${id}`);
  return facts.filter((fact) => ALL_WORDS.includes(fact));
}

function frontsOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

function handleMeshes(root: THREE.Object3D): {
  visible: number;
  black: number;
} {
  let visible = 0;
  let black = 0;
  root.traverse((node) => {
    if (node.name !== "handle") return;
    node.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      if (part.visible) visible += 1;
      const material = part.material as THREE.MeshStandardMaterial;
      if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
    });
  });
  return { visible, black };
}

function drawnHandlesOf(
  design: Design,
  placementId: string,
): { visible: number; black: number } {
  const solidsRoot = new THREE.Group();
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  const body = solidsRoot.children.find(
    (child) => child.userData.placementId === placementId,
  );
  if (!body) throw new Error(`no body mounted for ${placementId}`);
  return handleMeshes(body);
}

/** The design with `handle` written onto one placement as its own, and no kitchen or top-row handle to follow. */
function withOwnHandleOnly(
  design: Design,
  placementId: string,
  handle: Handle,
): Design {
  const settings = { ...design.settings };
  delete settings.handle;
  delete settings.topRowHandle;
  return {
    ...design,
    settings,
    placements: design.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, handle } }
        : placement,
    ),
  };
}

const WORD_TO_HANDLE: ReadonlyMap<string, Handle> = new Map(
  (Object.entries(WORDS) as [Handle, string][]).map(([handle, word]) => [
    word,
    handle,
  ]),
);

describe("the review's rows, the price and the scene never split on a body's handle", () => {
  propertyTest.prop([variation], { numRuns: 60 })(
    "each row says what the oracle says, in the catalogue the design's depth builds",
    (vary) => {
      const design = designOf(vary);
      const view = reviewOf(design);
      if (!view) return;
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const entries = priceAndProject(design).groups.flatMap(
        (group) => group.entries,
      );

      const wrong = design.placements.flatMap((placement) => {
        const entry = entries.find(
          (candidate) => candidate.placementId === placement.id,
        );
        if (!entry) throw new Error(`no entry for ${placement.id}`);
        const expected = expectedWord({
          placement,
          canHandle: catalog.get(placement.body.buildId)?.canHandle === true,
          fronts: frontsOf(entry, catalog),
          kitchen: vary.kitchen,
          topRow: vary.topRow,
        });
        const said = handleWordsOf(view, placement.id);
        return JSON.stringify(said) ===
          JSON.stringify(expected ? [expected] : [])
          ? []
          : [
              `${placement.id} ${placement.body.buildId}@${String(placement.y0Mm)}: said ${JSON.stringify(said)}, expected ${String(expected)}`,
            ];
      });

      expect(wrong).toEqual([]);
    },
  );

  propertyTest.prop([variation], { numRuns: 60 })(
    "the latches the rows imply are the latches the price bills",
    (vary) => {
      const design = designOf(vary);
      const view = reviewOf(design);
      if (!view) return;
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const entries = priceAndProject(design).groups.flatMap(
        (group) => group.entries,
      );

      const implied = entries
        .filter((entry) =>
          handleWordsOf(view, entry.placementId).includes(WORDS.push),
        )
        .reduce((total, entry) => total + frontsOf(entry, catalog), 0);

      expect(implied).toBe(
        countHardwareMechanisms(entries, catalog).pushToOpen,
      );
    },
  );

  propertyTest.prop([variation], { numRuns: 30 })(
    "a body is drawn as it is when the handle its row names is written onto it as its own",
    (vary) => {
      const design = designOf(vary);
      const view = reviewOf(design);
      if (!view) return;
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
      const split: string[] = [];

      for (const placement of design.placements) {
        if (catalog.get(placement.body.buildId)?.canHandle !== true) continue;
        const [word] = handleWordsOf(view, placement.id);
        const named = word === undefined ? undefined : WORD_TO_HANDLE.get(word);
        if (named === undefined) {
          split.push(`${placement.id}: a body taking a handle has no word`);
          continue;
        }
        const asDrawn = drawnHandlesOf(design, placement.id);
        const asNamed = drawnHandlesOf(
          withOwnHandleOnly(design, placement.id, named),
          placement.id,
        );
        if (JSON.stringify(asDrawn) !== JSON.stringify(asNamed)) {
          split.push(
            `${placement.id} ${placement.body.buildId}: drawn ${JSON.stringify(asDrawn)}, as named ${named} ${JSON.stringify(asNamed)}`,
          );
        }
      }

      expect(split).toEqual([]);
    },
  );

  it("is not vacuous: the bases include a 700 mm design, and the handle words vary across kitchen handles and top-row handles", () => {
    expect(bases.map(cabinetDepthMmOf)).toContain(700);
    expect(declaredCabinetDepthsMm()).toContain(700);
    const words = new Set(
      ["steel", "black", "push"].map((kitchen) => {
        const view = reviewOf(
          designOf({
            base: 0,
            own: [undefined],
            floors: [undefined],
            kitchen: kitchen as Handle,
            topRow: undefined,
          }),
        );
        return view ? handleWordsOf(view, "p0").join() : "";
      }),
    );
    expect(words.size).toBe(3);
    const topRowWords = new Set(
      ["steel", "black", "push"].map((topRow) => {
        const view = reviewOf(
          designOf({
            base: 0,
            own: [undefined],
            floors: [MODULE_LINE_MM],
            kitchen: "black",
            topRow: topRow as Handle,
          }),
        );
        return view ? handleWordsOf(view, "p0").join() : "";
      }),
    );
    expect(topRowWords.size).toBe(3);
  });
});

describe("the catalogue the review model builds is the one the design's depth means", () => {
  it("declares the same handle permission on every row at every declared depth", () => {
    const [first, ...others] = declaredCabinetDepthsMm().map((depth) =>
      buildKitchenLBodyCatalog(depth),
    );
    if (!first) throw new Error("no declared depth");

    for (const other of others) {
      expect([...other].map(([id, row]) => [id, row.canHandle])).toEqual(
        [...first].map(([id, row]) => [id, row.canHandle]),
      );
    }
  });
});
