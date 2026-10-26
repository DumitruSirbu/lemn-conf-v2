// **Wave H1b QA (M10): the scene, the price and the panel never split on the kitchen's handle (ADR 0092
// Amendment C), on generated rooms and at the module line, measured on meshes.**
//
// `kitchen-handle-reaches-the-scene.test.ts` mounts the one seeded kitchen. This file mounts the rooms the product
// generates (L, linear, U: top row, tall columns, appliances) under random own handles and every kitchen handle, and
// asks each body three ways: the meshes the scene drew, the latch the real counter bills, and an oracle written out
// here from the rule's words (own handle, else the kitchen's below the top row, else steel; the top row is push; a body
// that takes no handle is neither black nor ever follows). The oracle reads no production resolver.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  countHardwareMechanisms,
  createBodyProbeLease,
  derivePlacementRecords,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type BodyCatalog,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type Handle,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { forEachCabinetHandleMesh } from "../src/cabinet-handle-meshes.js";
import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-10-26T12:00:00.000Z";
const BLACK_HANDLE_HEX = "1c1e20";
/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;
const KITCHEN_CHOICES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const GENERATED_ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  { shape: "linear", widthMm: 3200, depthMm: 2400, heightMm: 2600 },
  { shape: "U", widthMm: 4200, depthMm: 3600, heightMm: 2600, wallCMm: 3000 },
];

interface Document {
  readonly name: string;
  readonly design: Design;
  readonly catalog: BodyCatalog;
}

let kit: Kit;
let documents: readonly Document[];

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  documents = [
    {
      name: "seeded",
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
    },
    ...GENERATED_ROOMS.map(generatedDocument),
  ];
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const probeKit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
    });
    const room = probeKit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(probeKit, room), () => {
      disposeKit(probeKit, room);
    });
  };
}

function generatedDocument(room: DesignRoom): Document {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return {
    name: `generated-${room.shape}`,
    design: result.design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design)),
  };
}

function withKitchenHandle(design: Design, handle: Handle | undefined): Design {
  if (handle === undefined) return design;
  return { ...design, settings: { ...design.settings, handle } };
}

function withOwnHandles(
  design: Design,
  choices: readonly (Handle | undefined)[],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const own = choices[index % choices.length];
      if (own === undefined) return placement;
      return { ...placement, body: { ...placement.body, handle: own } };
    }),
  };
}

interface Mounted {
  readonly solidsRoot: THREE.Group;
  readonly records: readonly PlacementRecord[];
}

function mount(
  design: Design,
  catalog: BodyCatalog,
  into: THREE.Group = new THREE.Group(),
): Mounted {
  const records = derivePlacementRecords(design, catalog);
  syncSolidBodies({ kit, solidsRoot: into, records, room: design.room });
  return { solidsRoot: into, records };
}

function bodyOf(solidsRoot: THREE.Group, placementId: string): THREE.Object3D {
  return required(
    solidsRoot.children.find(
      (child) => child.userData["placementId"] === placementId,
    ),
    `a body mounted for "${placementId}"`,
  );
}

interface DrawnBars {
  readonly built: number;
  readonly visible: number;
  readonly black: number;
}

function drawnBarsOf(body: THREE.Object3D): DrawnBars {
  let built = 0;
  let visible = 0;
  let black = 0;
  forEachCabinetHandleMesh(body, (part) => {
    built += 1;
    if (part.visible) visible += 1;
    const material = part.material as THREE.MeshStandardMaterial;
    if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
  });
  return { built, visible, black };
}

interface Expected {
  readonly hidden: boolean;
  readonly black: boolean;
}

/** The rule, from its words: what this one body is drawn as. */
function expectedOf(
  record: PlacementRecord,
  kitchen: Handle | undefined,
): Expected {
  const isTopRow = Math.round(record.frame.y0 * 1000) >= MODULE_LINE_MM;
  if (!record.canHandle) return { hidden: isTopRow, black: false };
  const wears: Handle =
    record.handleMode ?? (isTopRow ? "push" : (kitchen ?? "steel"));
  return { hidden: wears === "push", black: wears === "black" };
}

function followsKitchen(record: PlacementRecord): boolean {
  return (
    record.canHandle &&
    record.handleMode === undefined &&
    Math.round(record.frame.y0 * 1000) < MODULE_LINE_MM
  );
}

function billsALatch(
  design: Design,
  catalog: BodyCatalog,
  placementId: string,
): { readonly latched: boolean; readonly hasFronts: boolean } {
  const entry = required(
    projectDesignForDisplay(design, catalog)
      .flatMap((group) => group.entries)
      .find((candidate) => candidate.placementId === placementId),
    `a display entry for "${placementId}"`,
  );
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return {
    latched: countHardwareMechanisms([entry], catalog).pushToOpen > 0,
    hasFronts: doorLeafHeightsMm(query).length + drawerCount(query) > 0,
  };
}

function disagreementsOf(
  design: Design,
  catalog: BodyCatalog,
  kitchen: Handle | undefined,
): string[] {
  const { solidsRoot, records } = mount(design, catalog);
  const found: string[] = [];
  for (const record of records) {
    const expected = expectedOf(record, kitchen);
    const bars = drawnBarsOf(bodyOf(solidsRoot, record.id));
    const price = billsALatch(design, catalog, record.id);
    if (bars.built > 0) {
      const sceneHidden = bars.visible === 0;
      const sceneBlack = bars.black === bars.built;
      const barsAreOneColour = bars.black === 0 || sceneBlack;
      if (
        sceneHidden !== expected.hidden ||
        (!sceneHidden && bars.visible !== bars.built) ||
        sceneBlack !== expected.black ||
        !barsAreOneColour
      ) {
        found.push(
          `${record.buildId}@${String(Math.round(record.frame.y0 * 1000))} (${record.id}) scene ${JSON.stringify(bars)} vs expected ${JSON.stringify(expected)}`,
        );
      }
    }
    if (price.hasFronts && price.latched !== expected.hidden) {
      found.push(
        `${record.buildId}@${String(Math.round(record.frame.y0 * 1000))} (${record.id}) price latched ${String(price.latched)} vs expected ${String(expected.hidden)}`,
      );
    }
  }
  return found;
}

const documentIndex = fc.nat({ max: GENERATED_ROOMS.length });
const ownChoices = fc.array(
  fc.constantFrom<Handle | undefined>(...KITCHEN_CHOICES),
  { minLength: 1, maxLength: 9 },
);
const kitchenChoice = fc.constantFrom<Handle | undefined>(...KITCHEN_CHOICES);

describe("on generated rooms, the drawn bars, the billed latches and the rule agree body by body", () => {
  propertyTest.prop(
    { index: documentIndex, own: ownChoices, kitchen: kitchenChoice },
    { numRuns: 24 },
  )(
    "under random own handles and every kitchen handle",
    ({ index, own, kitchen }) => {
      const document = required(documents[index], "a document");
      const design = withKitchenHandle(
        withOwnHandles(document.design, own),
        kitchen,
      );

      expect(disagreementsOf(design, document.catalog, kitchen)).toEqual([]);
    },
  );

  it("every document draws a cabinet bar somewhere, so the property is not vacuous", () => {
    for (const document of documents) {
      const { solidsRoot, records } = mount(document.design, document.catalog);

      expect(
        records.some(
          (record) => drawnBarsOf(bodyOf(solidsRoot, record.id)).built,
        ),
        document.name,
      ).toBe(true);
    }
  });
});

describe("a kitchen-handle change rebuilds exactly the bodies whose handle moved", () => {
  propertyTest.prop(
    {
      index: documentIndex,
      own: ownChoices,
      from: kitchenChoice,
      to: kitchenChoice,
    },
    { numRuns: 24 },
  )(
    "on generated rooms, and every other body keeps its instance",
    ({ index, own, from, to }) => {
      const document = required(documents[index], "a document");
      const dealt = withOwnHandles(document.design, own);
      const first = mount(withKitchenHandle(dealt, from), document.catalog);
      const before = new Map(
        first.records.map((record) => [
          record.id,
          bodyOf(first.solidsRoot, record.id),
        ]),
      );

      const second = mount(
        withKitchenHandle(dealt, to),
        document.catalog,
        first.solidsRoot,
      );

      const expected = second.records
        .filter(followsKitchen)
        .filter(() => (from ?? "steel") !== (to ?? "steel"))
        .map((record) => record.id);
      const rebuilt = second.records
        .map((record) => record.id)
        .filter(
          (placementId) =>
            bodyOf(second.solidsRoot, placementId) !== before.get(placementId),
        );
      expect(rebuilt.sort()).toEqual([...expected].sort());
      expect(second.solidsRoot.children).toHaveLength(second.records.length);
    },
  );
});

describe("a body standing within 1 mm of the module line, on every catalogue row", () => {
  const FLOORS_MM = [MODULE_LINE_MM - 1, MODULE_LINE_MM, MODULE_LINE_MM + 1];

  function soloAt(
    buildId: string,
    y0Mm: number,
    own: Handle | undefined,
    kitchen: Handle | undefined,
  ): Design {
    const definition = required(
      KITCHEN_L_BODY_CATALOG.get(buildId),
      `catalogue row ${buildId}`,
    );
    return withKitchenHandle(
      {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "solo",
            wall: "A",
            alongMm: 300,
            y0Mm,
            body: {
              buildId,
              widthMm: definition.sizesMm?.[0] ?? 600,
              heightMm: definition.nominalHeightMm ?? 700,
              ...(own === undefined ? {} : { handle: own }),
            },
          },
        ],
      },
      kitchen,
    );
  }

  it("is drawn and billed as the rule says at 2199, 2200 and 2201 under each kitchen handle", () => {
    const disagreements: string[] = [];

    for (const buildId of KITCHEN_L_BODY_CATALOG.keys()) {
      for (const y0Mm of FLOORS_MM) {
        for (const kitchen of KITCHEN_CHOICES) {
          for (const own of [undefined, "steel"] as const) {
            disagreements.push(
              ...disagreementsOf(
                soloAt(buildId, y0Mm, own, kitchen),
                KITCHEN_L_BODY_CATALOG,
                kitchen,
              ).map(
                (line) =>
                  `${line} [own ${String(own)}, kitchen ${String(kitchen)}]`,
              ),
            );
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
  });

  it("is not vacuous: most rows draw cabinet bars, and the kitchen's choice moves them across the line", () => {
    const buildIds = [...KITCHEN_L_BODY_CATALOG.keys()];
    const barred = buildIds.filter((buildId) => {
      const { solidsRoot } = mount(
        soloAt(buildId, MODULE_LINE_MM - 1, undefined, undefined),
        KITCHEN_L_BODY_CATALOG,
      );
      return drawnBarsOf(bodyOf(solidsRoot, "solo")).built > 0;
    });
    const takingAHandle = barred.filter(
      (buildId) => KITCHEN_L_BODY_CATALOG.get(buildId)?.canHandle === true,
    );
    const hiddenBelowTheLine = takingAHandle.filter((buildId) => {
      const { solidsRoot } = mount(
        soloAt(buildId, MODULE_LINE_MM - 1, undefined, "push"),
        KITCHEN_L_BODY_CATALOG,
      );
      return drawnBarsOf(bodyOf(solidsRoot, "solo")).visible === 0;
    });

    expect(takingAHandle.length).toBeGreaterThanOrEqual(15);
    expect(hiddenBelowTheLine).toEqual(takingAHandle);
  });
});
