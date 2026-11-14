// What the two W2 test files (`generation/over-the-fridge.test.ts`, `generation/qa-m12-w2-over-the-fridge.adversarial
// .test.ts`) share: the numbers they stand on, stated once, and the helpers both read generated kitchens with.
//
// The ceiling bands are ADR 0183 decision 2, as amended by the owner's ruling of 2026-11-15 ("always place it"): the
// cabinet is placed wherever `insertBody` accepts it, so there is a band of ceilings that get a shortened one, a band
// where the engine refuses it and a band where no void exists over the fridge at all.
import {
  buildKitchenLBodyCatalog,
  generateKitchen,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type GenerateKitchenResult,
  type GenerationStep,
} from "../../src/index.js";
import { LEVELS } from "../../src/module-grid.js";
import { createFakeProbeFactory } from "./fake-probe.js";

export const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
export const FRIDGE_BUILD_ID = "fridge-free";
export const FRIDGE_STEP_ID = "fridge";
export const WALL_CABINET_BUILD_ID = "wall-cabinet";
export const OVER_BODY_ROLE = "over-body";
export const OVER_BODY_STEP_ID = "over-body:fridge";
export const DEPTHS_MM = [600, 700] as const;

/** Where the module grid's last level ends: the top of the opening over a fridge at every taller ceiling, and the
 *  ceiling from which the top row is generated. Read off `LEVELS`, never restated. */
export const OPENING_TOP_MM = Math.round((LEVELS.at(-1)?.[1] ?? 0) * 1000);

/** The fridge's declared top above the floor: the floor of the opening the cabinet stands in. Read from the
 *  catalogue's declared height, as generation does (ADR 0102: no second copy). */
export const FRIDGE_TOP_MM = declaredFridgeTopMm();

/** The ceiling band edges, **measured** on the engine (L and straight rooms, both depths) and ruled by the
 *  coordinator on 2026-11-15 (ADR 0183 decision 2): from 2501 mm up the opening over the fridge reaches the ceiling and
 *  `insertBody` seats the cabinet, shortened to the opening; through 2500 the void is cut at the wall row's top and
 *  the insert is refused `OPENING_TOO_SHORT`; through 2150 there is no void and no insert is attempted. */
export const LOWEST_CEILING_THAT_FITS_MM = 2501;
export const NO_OPENING_THROUGH_MM = 2150;
export const TOO_SHORT_FROM_MM = NO_OPENING_THROUGH_MM + 1;

/** The ceilings above the lowest that fits and below the grid's last level: a cabinet shortened to its opening. */
export const HIGHEST_SHORTENED_CEILING_MM = OPENING_TOP_MM - 1;
export const MIDDLE_SHORTENED_CEILING_MM = 2550;

function declaredFridgeTopMm(): number {
  const heightMm =
    buildKitchenLBodyCatalog(600).get(FRIDGE_BUILD_ID)?.nominalHeightMm;
  if (heightMm === undefined) {
    throw new Error(`${FRIDGE_BUILD_ID} declares no height`);
  }
  return heightMm;
}

export function generate(room: DesignRoom, cabinetDepthMm: number) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
    newKitchenSettings: { cabinetDepthMm },
  });
}

export function stepNamed(
  result: GenerateKitchenResult,
  id: string,
): GenerationStep | undefined {
  return result.log.steps.find((step) => step.id === id);
}

export function overBodyStepOf(
  result: GenerateKitchenResult,
): GenerationStep | undefined {
  return result.log.steps.find((step) => step.role === OVER_BODY_ROLE);
}

export function placementOf(
  design: Design,
  step: GenerationStep,
): DesignPlacement {
  if (step.status !== "placed") throw new Error(`${step.id} was not placed`);
  const found = design.placements.find(({ id }) => id === step.placementId);
  if (!found) throw new Error(`${step.id} has no placement`);
  return found;
}

export function startMmOf(placement: DesignPlacement): number {
  return placement.alongMm - placement.body.widthMm / 2;
}

export function endMmOf(placement: DesignPlacement): number {
  return placement.alongMm + placement.body.widthMm / 2;
}

export function spansOverlap(
  left: DesignPlacement,
  right: DesignPlacement,
): boolean {
  return (
    left.wall === right.wall &&
    startMmOf(left) < endMmOf(right) &&
    startMmOf(right) < endMmOf(left)
  );
}

/** What a sweep reached, so each can say which arms it stood on: a grid that stopped reaching an arm fails. */
export class Reach {
  private readonly counts = new Map<string, number>();

  note(arm: string): void {
    this.counts.set(arm, (this.counts.get(arm) ?? 0) + 1);
  }

  of(arm: string): number {
    return this.counts.get(arm) ?? 0;
  }
}

/** A deterministic stream of rooms that no grid of round numbers reaches: odd millimetres, every shape. */
export function seededRooms(
  count: number,
  heightsMm: readonly number[],
): DesignRoom[] {
  let state = 0x2f6e2b1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const between = (low: number, high: number) =>
    low + Math.floor(next() * (high - low + 1));
  const rooms: DesignRoom[] = [];
  for (let index = 0; index < count; index += 1) {
    const heightMm = heightsMm[index % heightsMm.length] ?? OPENING_TOP_MM;
    const shape = (["L", "linear", "U"] as const)[index % 3] ?? "L";
    const widthMm = between(2400, 6000);
    if (shape === "linear") {
      rooms.push({ shape, widthMm, depthMm: 3400, heightMm });
    } else if (shape === "L") {
      rooms.push({ shape, widthMm, depthMm: between(1800, 5000), heightMm });
    } else {
      rooms.push({
        shape,
        widthMm,
        depthMm: between(1800, 5000),
        wallCMm: between(1800, 5000),
        heightMm,
      });
    }
  }
  return rooms;
}
