// Everything a document says about handles to its readers, as plain JSON: the placement records' handle
// fields, `describeSelection` per placement, the latch decision per front, and the mechanism counts the
// hardware line is built from.
//
// The golden comparison (`h1c-no-kitchen-handle-golden.test.ts`) read these facts from the base commit
// (`be4a23bb`, before wave H1) and stored them; `handleProjectionOf` keeps only the handle-related part of
// them, so another lane changing a label, a size set or a mechanism the golden also holds cannot fail it.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  cabinetDepthMmOf,
  countHardwareMechanisms,
  generateKitchen,
  isPushToOpen,
  projectDesignForDisplay,
  type BodyCatalog,
  type Design,
  type DesignRoom,
  type Handle,
} from "../../src/index.js";
import {
  describeSelection,
  type SelectionMeta,
} from "../../src/queries/describe-selection.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld } from "../support/kitchen-world.js";

const OCCURRED_AT = "2026-10-26T12:00:00.000Z";

/** Own handles dealt to placements in turn; `undefined` leaves the placement choosing nothing. */
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

/** The seeded kitchen and every composed room, each as generated and again with own handles dealt out.
 *  None of them carries a kitchen handle: the golden is of documents that have chosen none. */
export function documentsWithNoKitchenHandle(): readonly NamedDocument[] {
  const seeded: NamedDocument = {
    name: "seeded",
    design: KITCHEN_L_DESIGN,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
  };
  const generated = ROOMS.flatMap((room) => generatedFrom(room));
  const documents = [seeded, ...generated];
  return [...documents, ...documents.map(withOwnHandlesDealtOut)];
}

function generatedFrom(room: DesignRoom): readonly NamedDocument[] {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) return [];
  // H2 will stamp a handle into every generated design. This golden's premise is that none carries one,
  // so it must fail loudly when that changes rather than quietly test a different population.
  if (result.design.settings?.handle !== undefined) {
    throw new Error(
      `a generated kitchen now carries settings.handle (${result.design.settings.handle}); ` +
        "the H1-c golden's documents must be built without one",
    );
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

/** What the readers of handles say about `document`, as the JSON a stored copy would hold. */
export function handleFactsOf(document: NamedDocument): unknown {
  const { design, catalog } = document;
  const world = createWorld(design, catalog);
  const entries = projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
  const facts = {
    name: document.name,
    records: world.records.map((record) => ({
      id: record.id,
      handleMode: record.handleMode ?? null,
      canHandle: record.canHandle,
      y0: record.frame.y0,
    })),
    selections: world.records.map((record) =>
      describeSelection({
        ...world,
        target: { kind: "placement", id: record.id },
      }),
    ),
    latches: entries.map((entry) => ({
      id: entry.placementId,
      pushToOpen: isPushToOpen({
        y0Mm: entry.y0Mm,
        recordedHandle: entry.handle,
        canHandle: catalog.get(entry.buildId)?.canHandle === true,
      }),
    })),
    mechanisms: countHardwareMechanisms(entries, catalog),
  };
  return JSON.parse(JSON.stringify(facts)) as unknown;
}

interface StoredFacts {
  readonly name: string;
  readonly records: readonly unknown[];
  readonly selections: readonly Pick<
    SelectionMeta,
    "id" | "canHandle" | "handle" | "defaultHandle"
  >[];
  readonly latches: readonly unknown[];
  readonly mechanisms: { readonly pushToOpen: number };
}

/** The handle-related part of `facts`, and nothing another lane's work could legitimately move: no label,
 *  no size set, no hinge or drawer count, no price. */
export function handleProjectionOf(facts: unknown): unknown {
  const stored = facts as StoredFacts;
  return {
    name: stored.name,
    records: stored.records,
    selections: stored.selections.map((selection) => ({
      id: selection.id,
      canHandle: selection.canHandle,
      handle: selection.handle ?? null,
      defaultHandle: selection.defaultHandle,
    })),
    latches: stored.latches,
    pushToOpenCount: stored.mechanisms.pushToOpen,
  };
}
