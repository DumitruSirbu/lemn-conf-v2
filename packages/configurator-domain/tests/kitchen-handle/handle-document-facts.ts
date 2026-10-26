// The documents the handle tests sweep: the seeded kitchen and composed rooms, each as generated and
// again with own handles dealt out. None carries a kitchen handle.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  cabinetDepthMmOf,
  generateKitchen,
  type BodyCatalog,
  type Design,
  type DesignRoom,
  type Handle,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-26T12:00:00.000Z";

const OWN_HANDLE_ROTATION: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];

const ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 4200, depthMm: 3200, heightMm: 2600 },
  { shape: "linear", widthMm: 3200, depthMm: 2400, heightMm: 2600 },
  { shape: "U", widthMm: 4200, depthMm: 3600, heightMm: 2600, wallCMm: 3000 },
];

export interface NamedDocument {
  readonly name: string;
  readonly design: Design;
  readonly catalog: BodyCatalog;
}

export function documentsWithNoKitchenHandle(): readonly NamedDocument[] {
  const seeded: NamedDocument = {
    name: "seeded",
    design: KITCHEN_L_DESIGN,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
  };
  const documents = [seeded, ...ROOMS.flatMap((room) => generatedFrom(room))];
  return [...documents, ...documents.map(withOwnHandlesDealtOut)];
}

function generatedFrom(room: DesignRoom): readonly NamedDocument[] {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) return [];
  // Fails loudly if generation starts stamping a kitchen handle: the sweeps assume none.
  if (result.design.settings?.handle !== undefined) {
    throw new Error("a generated kitchen carries settings.handle");
  }
  return [
    {
      name: `generated-${room.shape}-${String(room.widthMm)}x${String(room.depthMm)}`,
      design: result.design,
      catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design)),
    },
  ];
}

function withOwnHandlesDealtOut(document: NamedDocument): NamedDocument {
  const placements = document.design.placements.map((placement, index) => {
    const handle = OWN_HANDLE_ROTATION[index % OWN_HANDLE_ROTATION.length];
    if (handle === undefined) return placement;
    return { ...placement, body: { ...placement.body, handle } };
  });
  return {
    ...document,
    name: `${document.name}+own-handles`,
    design: { ...document.design, placements },
  };
}
