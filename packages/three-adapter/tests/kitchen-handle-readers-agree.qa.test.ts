// **Wave H1b QA (M10): the scene, the price and the panel never split on the kitchen's handle (ADR 0092
// Amendment C), on generated rooms and at the module line, measured on meshes.**
//
// `kitchen-handle-reaches-the-scene.test.ts` mounts the one seeded kitchen. This file mounts the rooms the product
// generates (L, linear, U: top row, tall columns, appliances) under random own handles and every kitchen handle, and
// asks each body three ways: the meshes the scene drew, the latch the real counter bills, and an oracle written out
// here from the rule's words (own handle, else the kitchen's below the top row, else steel; the top row is the
// kitchen's top-row handle, else push; a body that takes no handle is neither black nor ever follows, whatever either
// kitchen handle says). The oracle reads no production resolver.
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
  type NewKitchenSettings,
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

/** What the kitchen says: the handle below the top row, and (H2) the top row's own. Either may be absent. */
interface KitchenChoice {
  readonly handle?: Handle;
  readonly topRowHandle?: Handle;
}

/** The kitchen's settings the sweeps cover: absent, each handle alone, each top-row handle alone, and two pairs that
 *  disagree, so a reader that swaps the two keys is caught. */
const KITCHEN_SETTINGS_SAMPLE: readonly KitchenChoice[] = [
  {},
  { handle: "steel" },
  { handle: "black" },
  { handle: "push" },
  { topRowHandle: "steel" },
  { topRowHandle: "black" },
  { topRowHandle: "push" },
  { handle: "push", topRowHandle: "steel" },
  { handle: "black", topRowHandle: "push" },
];
/** Defaults the product stamps: planned, built and probed at 700 mm, with a kitchen and a top-row handle of their own. */
const NATIVE_700_DEFAULTS: NewKitchenSettings = {
  cabinetDepthMm: 700,
  handle: "black",
  topRowHandle: "steel",
};
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
let kit700: Kit;
let documents: readonly Document[];

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  kit700 = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm: 700 });
  documents = [
    {
      name: "seeded",
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
    },
    ...GENERATED_ROOMS.map((room) => generatedDocument(room)),
    generatedDocument(GENERATED_ROOMS[0] as DesignRoom, NATIVE_700_DEFAULTS),
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

function generatedDocument(
  room: DesignRoom,
  newKitchenSettings?: NewKitchenSettings,
): Document {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
    ...(newKitchenSettings === undefined ? {} : { newKitchenSettings }),
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return {
    name:
      newKitchenSettings === undefined
        ? `generated-${room.shape}`
        : `generated-${room.shape}-at-${String(cabinetDepthMmOf(result.design))}`,
    design: result.design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design)),
  };
}

function withKitchenSettings(design: Design, kitchen: KitchenChoice): Design {
  return { ...design, settings: { ...design.settings, ...kitchen } };
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
  const sceneKit = cabinetDepthMmOf(design) === 700 ? kit700 : kit;
  syncSolidBodies({
    kit: sceneKit,
    solidsRoot: into,
    records,
    room: design.room,
  });
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
function expectedOf(record: PlacementRecord, kitchen: KitchenChoice): Expected {
  const isTopRow = Math.round(record.frame.y0 * 1000) >= MODULE_LINE_MM;
  if (!record.canHandle) return { hidden: isTopRow, black: false };
  const followed: Handle = isTopRow
    ? (kitchen.topRowHandle ?? "push")
    : (kitchen.handle ?? "steel");
  const wears: Handle = record.handleMode ?? followed;
  return { hidden: wears === "push", black: wears === "black" };
}

/** Whether the kitchen's choice moving from `from` to `to` moves this body: only a body with no handle of its own
 *  that takes one, and only through the key its row reads. */
function followsTheChange(
  record: PlacementRecord,
  change: { readonly from: KitchenChoice; readonly to: KitchenChoice },
): boolean {
  if (!record.canHandle || record.handleMode !== undefined) return false;
  const isTopRow = Math.round(record.frame.y0 * 1000) >= MODULE_LINE_MM;
  return isTopRow
    ? (change.from.topRowHandle ?? "push") !==
        (change.to.topRowHandle ?? "push")
    : (change.from.handle ?? "steel") !== (change.to.handle ?? "steel");
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
  kitchen: KitchenChoice,
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

/** The seeded kitchen, each generated room, and the L generated natively at 700 mm. */
const documentIndex = fc.nat({ max: GENERATED_ROOMS.length + 1 });
const ownChoices = fc.array(
  fc.constantFrom<Handle | undefined>(...KITCHEN_CHOICES),
  { minLength: 1, maxLength: 9 },
);
const handleChoice = fc.constantFrom<Handle | undefined>(...KITCHEN_CHOICES);
const kitchenChoice = fc.tuple(handleChoice, handleChoice).map(
  ([handle, topRowHandle]): KitchenChoice => ({
    ...(handle === undefined ? {} : { handle }),
    ...(topRowHandle === undefined ? {} : { topRowHandle }),
  }),
);

describe("on generated rooms, the drawn bars, the billed latches and the rule agree body by body", () => {
  propertyTest.prop(
    { index: documentIndex, own: ownChoices, kitchen: kitchenChoice },
    { numRuns: 24 },
  )(
    "under random own handles and every kitchen handle and top-row handle",
    ({ index, own, kitchen }) => {
      const document = required(documents[index], "a document");
      const design = withKitchenSettings(
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

describe("a kitchen-handle or top-row-handle change rebuilds exactly the bodies whose handle moved", () => {
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
      const first = mount(withKitchenSettings(dealt, from), document.catalog);
      const before = new Map(
        first.records.map((record) => [
          record.id,
          bodyOf(first.solidsRoot, record.id),
        ]),
      );

      const second = mount(
        withKitchenSettings(dealt, to),
        document.catalog,
        first.solidsRoot,
      );

      const expected = second.records
        .filter((record) => followsTheChange(record, { from, to }))
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
    kitchen: KitchenChoice,
    depthMm = 600,
  ): Design {
    const definition = required(
      KITCHEN_L_BODY_CATALOG.get(buildId),
      `catalogue row ${buildId}`,
    );
    return withKitchenSettings(
      {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: depthMm },
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

  it.each([600, 700])(
    "is drawn and billed as the rule says at 2199, 2200 and 2201 under each kitchen handle and top-row handle, at cabinet depth %s",
    (depthMm) => {
      const catalog = buildKitchenLBodyCatalog(depthMm);
      const disagreements: string[] = [];

      for (const buildId of catalog.keys()) {
        for (const y0Mm of FLOORS_MM) {
          for (const kitchen of KITCHEN_SETTINGS_SAMPLE) {
            for (const own of [undefined, "steel"] as const) {
              disagreements.push(
                ...disagreementsOf(
                  soloAt(buildId, y0Mm, own, kitchen, depthMm),
                  catalog,
                  kitchen,
                ).map(
                  (line) =>
                    `${line} [own ${String(own)}, kitchen ${JSON.stringify(kitchen)}]`,
                ),
              );
            }
          }
        }
      }

      expect(disagreements).toEqual([]);
    },
  );

  it("is not vacuous: most rows draw cabinet bars, and the kitchen's choice moves them across the line", () => {
    const buildIds = [...KITCHEN_L_BODY_CATALOG.keys()];
    const barred = buildIds.filter((buildId) => {
      const { solidsRoot } = mount(
        soloAt(buildId, MODULE_LINE_MM - 1, undefined, {}),
        KITCHEN_L_BODY_CATALOG,
      );
      return drawnBarsOf(bodyOf(solidsRoot, "solo")).built > 0;
    });
    const takingAHandle = barred.filter(
      (buildId) => KITCHEN_L_BODY_CATALOG.get(buildId)?.canHandle === true,
    );
    const hiddenBelowTheLine = takingAHandle.filter((buildId) => {
      const { solidsRoot } = mount(
        soloAt(buildId, MODULE_LINE_MM - 1, undefined, { handle: "push" }),
        KITCHEN_L_BODY_CATALOG,
      );
      return drawnBarsOf(bodyOf(solidsRoot, "solo")).visible === 0;
    });

    expect(takingAHandle.length).toBeGreaterThanOrEqual(15);
    expect(hiddenBelowTheLine).toEqual(takingAHandle);
  });
});

describe("a top-row body takes the kitchen's top-row handle, and only the top row does", () => {
  const topRowBuildIds = [...KITCHEN_L_BODY_CATALOG.keys()].filter(
    (buildId) => KITCHEN_L_BODY_CATALOG.get(buildId)?.canHandle === true,
  );

  function solo(buildId: string, y0Mm: number, kitchen: KitchenChoice) {
    const definition = required(
      KITCHEN_L_BODY_CATALOG.get(buildId),
      `catalogue row ${buildId}`,
    );
    return withKitchenSettings(
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
            },
          },
        ],
      },
      kitchen,
    );
  }

  it("shows the bars on every barred top-row row when the top-row handle is steel, and hides them when it is push", () => {
    const barred = topRowBuildIds.filter(
      (buildId) =>
        drawnBarsOf(
          bodyOf(
            mount(solo(buildId, MODULE_LINE_MM, {}), KITCHEN_L_BODY_CATALOG)
              .solidsRoot,
            "solo",
          ),
        ).built > 0,
    );
    const visibleUnder = (kitchen: KitchenChoice) =>
      barred.filter(
        (buildId) =>
          drawnBarsOf(
            bodyOf(
              mount(
                solo(buildId, MODULE_LINE_MM, kitchen),
                KITCHEN_L_BODY_CATALOG,
              ).solidsRoot,
              "solo",
            ),
          ).visible > 0,
      );

    expect(barred.length).toBeGreaterThanOrEqual(10);
    expect(visibleUnder({ topRowHandle: "steel" })).toEqual(barred);
    expect(visibleUnder({ topRowHandle: "black" })).toEqual(barred);
    expect(visibleUnder({ topRowHandle: "push" })).toEqual([]);
    expect(visibleUnder({})).toEqual([]);
    expect(visibleUnder({ handle: "steel" })).toEqual([]);
  });

  it("leaves a body below the line alone: the top-row handle never reaches it", () => {
    const below = topRowBuildIds.filter(
      (buildId) =>
        drawnBarsOf(
          bodyOf(
            mount(solo(buildId, MODULE_LINE_MM - 1, {}), KITCHEN_L_BODY_CATALOG)
              .solidsRoot,
            "solo",
          ),
        ).built > 0,
    );
    const hiddenUnder = (kitchen: KitchenChoice) =>
      below.filter(
        (buildId) =>
          drawnBarsOf(
            bodyOf(
              mount(
                solo(buildId, MODULE_LINE_MM - 1, kitchen),
                KITCHEN_L_BODY_CATALOG,
              ).solidsRoot,
              "solo",
            ),
          ).visible === 0,
      );

    expect(below.length).toBeGreaterThanOrEqual(15);
    expect(hiddenUnder({ topRowHandle: "push" })).toEqual([]);
    expect(hiddenUnder({ handle: "push", topRowHandle: "steel" })).toEqual(
      below,
    );
  });
});
