// M7B U5 adversarial QA: **a U in the editor before U6 lets one through Step 1.**
//
// No U reached `/d/{id}` under the approved policy before U6 widened it, and a test that needs a
// *particular* U still seeds one rather than typing it, so this puts one there without a
// production seam: mint an ordinary row, then replace its document with the domain's own generated U
// through the same `PUT /api/designs/{id}` the editor's autosave uses. The write path validates the
// schema and the catalogue (`app/api/designs/[id]/route.ts`), not the room policy, so the U is accepted
// on the same terms as any saved design, and the editor then loads it the way it loads any other.
//
// The U is composed here with the **real** body probe (`makeKit` + `createBodyProbe`, the pair
// `use-generation.ts` hands `generateKitchen`), over a headless canvas: the probe measures geometry,
// never pixels, so the stub changes no number the document carries.
import {
  createBodyProbeLease,
  derivePlacementRecords,
  buildKitchenLBodyCatalog,
  deriveRecordedColumns,
  generateKitchen,
  recomputeVoids,
  toMetres,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import { createBodyProbe, disposeKit, makeKit } from "@lemnaria/three-adapter";
import type { Page } from "@playwright/test";

import { createHeadlessCanvas } from "../../support/headless-canvas";
import { deleteMintedDesigns } from "./minted-designs";
import { mintSeededDesign, type SeededDesign } from "./seeded-design";

export interface URoomMm {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
}

/** The room the U5 S2 (5) criterion names: 3000/3000/3000, at the default ceiling. */
export const U_3000: URoomMm = {
  widthMm: 3000,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};

/** In the past on purpose: the editor stamps every command's `updatedAt` with the clock, and the write
 *  path refuses a document whose `updatedAt` precedes its `createdAt` (`TIMESTAMPS_OUT_OF_ORDER`). */
const OCCURRED_AT = "2026-01-01T00:00:00.000Z";
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/** The domain's generated U, exactly as Step 1's composition would write it. Throws by name on a
 *  refusal, so a room the engine cannot build fails in setup rather than as an empty scene. */
export function composeU(room: URoomMm): Design {
  return composeKitchen({ shape: "U", ...room });
}

/** Any shape's generated kitchen, composed exactly as `composeU` is — for a spec that seeds an L or a
 *  straight room beside a U. Throws by name on a refusal, so setup fails rather than an empty scene. */
export function composeKitchen(room: DesignRoom): Design {
  const composed = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!composed.ok) {
    throw new Error(
      `composeKitchen: generateKitchen refused ${JSON.stringify(room)}; it cannot be seeded`,
    );
  }
  return composed.design;
}

/** Which wall each placement stands on, as the domain derives it — the same records the scene is
 *  synced from, so a wall read here is the wall the adapter tagged the mounted body with. */
export function recordsByPlacementId(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, PlacementRecord> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  return new Map(records.map((record) => [record.id, record]));
}

/** The domain's derived voids for `design`, the set `syncVoidMeshes` mounts. */
export function voidsOf(
  design: Design,
  cabinetDepthMm: number,
): readonly VoidRecord[] {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  const columns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
  );
  return recomputeVoids(records, columns);
}

export function idsOnWall(
  records: ReadonlyMap<string, PlacementRecord>,
  wall: DesignWall,
): string[] {
  return [...records.values()]
    .filter((record) => record.wall === wall)
    .map((record) => record.id);
}

/**
 * Mints a row, then replaces its document with `design` from inside the page, so the write-token
 * cookie the mint set is the one the `PUT` carries. Deletes the row and throws by name when the
 * write path refuses the document, since every assertion after that would be about a different design.
 */
export async function seedDesign(
  page: Page,
  design: Design,
): Promise<SeededDesign> {
  const minted = await mintSeededDesign(page);
  const saved = await putDesign(page, minted, design);
  if (saved.status !== 200) {
    await deleteMintedDesigns([minted.id]);
    throw new Error(
      `seedDesign: PUT /api/designs/${minted.id} answered ${String(saved.status)} ` +
        `(${saved.body}), wanted 200 — the write path refused the U document`,
    );
  }
  return { id: minted.id, revision: saved.revision };
}

interface PutOutcome {
  readonly status: number;
  readonly revision: string;
  readonly body: string;
}

async function putDesign(
  page: Page,
  minted: SeededDesign,
  design: Design,
): Promise<PutOutcome> {
  return page.evaluate(
    async ({ id, revision, document, header }): Promise<PutOutcome> => {
      const response = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [header]: revision },
        body: JSON.stringify(document),
      });
      const body = await response.text();
      const parsed = (() => {
        try {
          return JSON.parse(body) as { revision?: string };
        } catch {
          return {};
        }
      })();
      return {
        status: response.status,
        revision: parsed.revision ?? "",
        body: body.slice(0, 300),
      };
    },
    {
      id: minted.id,
      revision: minted.revision,
      document: design,
      header: EXPECTED_REVISION_HEADER,
    },
  );
}

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm: number) => {
    const kit = makeKit({
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
      createCanvas: createHeadlessCanvas,
    });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}
