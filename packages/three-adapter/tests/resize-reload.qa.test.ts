// Adversarial QA on the reload anti-invariant, for the **whole** accepted population rather than
// one case, and through the **real** builders and the real `BodyProbe`.
//
// Backlog entry 9 is why this is here and not in the domain: a fake probe reports back the depth it
// was handed, so `seatDepthMm` — the one number a resize persists that is a *measurement* and not a
// derivation — reads correct in a domain test whatever the builder actually did. `refuseBuiltSize`
// gates the carcass width and height and nothing gates the seat, so the real builder is the only
// thing standing between a resize and a body that reloads at a different depth.
import {
  canonicalSerializeDesign,
  deriveColumns,
  derivePlacementRecords,
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  removePlacement,
  setWidth,
  toMillimetres,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

/** Every column of the shipped kitchen whose members are all deletable. */
const CLEARABLE: readonly {
  readonly key: string;
  readonly ids: readonly string[];
}[] = [
  { key: "A|0.30", ids: ["p8", "p15"] },
  { key: "A|0.75", ids: ["p10", "p16"] },
  { key: "A|1.30", ids: ["p0", "p11", "p17"] },
  { key: "A|2.00", ids: ["p1", "p12", "p18"] },
  { key: "A|2.60", ids: ["p2", "p13", "p19"] },
  { key: "A|3.20", ids: ["p4", "p14", "p20"] },
  { key: "B|1.20", ids: ["p5", "p22"] },
  { key: "B|1.80", ids: ["p6", "p23"] },
  { key: "B|2.45", ids: ["p7", "p24"] },
];

const WIDTHS_MM: readonly number[] = [200, 300, 400, 450, 600, 700, 800, 900];

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function recordsOf(design: Design): PlacementRecord[] {
  return derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
}

interface World {
  readonly design: Design;
  readonly columns: ReturnType<typeof deriveColumns>;
}

function clear(design: Design, placementIds: readonly string[]): World {
  const columns = deriveColumns(recordsOf(design));
  const cleared = placementIds.reduce((current, id) => {
    const result = removePlacement({
      design: current,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Fixture could not remove ${id}: ${result.reason.code}`);
    }
    return result.design;
  }, design);
  return { design: cleared, columns };
}

function resize(world: World, placementId: string, widthMm: number) {
  return setWidth({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    widthMm,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
}

function frameOf(design: Design, placementId: string) {
  const record = recordsOf(design).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for ${placementId}`);
  return record.frame;
}

describe("every resize the shipped kitchen accepts survives a save and a reload", () => {
  it("reparses without UnknownBodyError and reproduces the post-resize frame exactly", () => {
    const swept: string[] = [];
    for (const cleared of CLEARABLE) {
      const world = clear(KITCHEN_L_DESIGN, cleared.ids);
      for (const placement of world.design.placements) {
        for (const widthMm of WIDTHS_MM) {
          const result = resize(world, placement.id, widthMm);
          if (!result.ok) continue;
          swept.push(`${cleared.key}:${placement.id}@${String(widthMm)}`);

          const reloaded: Design = DesignSchema.parse(
            JSON.parse(canonicalSerializeDesign(result.design)),
          );
          expect(() => recordsOf(reloaded)).not.toThrow();

          for (const id of result.effect.columnPlacementIds) {
            // The depth anti-invariant, measured against the real builder both times.
            expect(toMillimetres(frameOf(result.design, id).d)).toBe(
              toMillimetres(frameOf(world.design, id).d),
            );
            // And the whole frame survives the round trip, not merely the depth.
            expect(frameOf(reloaded, id)).toEqual(frameOf(result.design, id));
          }

          // No member is left carrying a seeded id at a width that id cannot build.
          for (const id of result.effect.columnPlacementIds) {
            const body = reloaded.placements.find(
              (entry) => entry.id === id,
            )?.body;
            expect(
              KITCHEN_L_BODY_CATALOG.get(body?.buildId ?? "")?.insertable,
            ).toBe(true);
            expect(body?.widthMm).toBe(widthMm);
          }
        }
      }
    }

    // The sweep cannot pass by accepting nothing.
    expect(swept).toHaveLength(15);
  });
});
