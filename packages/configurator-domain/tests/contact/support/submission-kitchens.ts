// Kitchens for the submission tests: generated rooms of all three shapes, priced the way a surface prices
// them, and a way to push a body past its own wall.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  generateKitchen,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type BodyCatalog,
  type Design,
  type DesignRoom,
  type DesignWall,
  type PriceBook,
} from "../../../src/index.js";
import { wallLengthMm } from "../../../src/queries/overflowing-placements.js";
import { createFakeProbeFactory } from "../../support/fake-probe.js";
import {
  acceptedRoom,
  validLInput,
  validLinearInput,
} from "../../support/room-input.js";
import { uRoom } from "../../support/u-plan-fixtures.js";

/** The U fixtures' height: the generator needs a wall cabinet's opening at 1500 mm. */
const ROOM_HEIGHT_MM = 2600;

const GENERATED_AT = "2026-10-08T09:00:00.000Z";

export interface Kitchen {
  readonly name: string;
  readonly design: Design;
  readonly catalog: BodyCatalog;
}

export function catalogOf(design: Design): BodyCatalog {
  return buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
}

function composed(name: string, room: DesignRoom): Kitchen {
  const result = generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`${name} did not compose`);
  return { name, design: result.design, catalog: catalogOf(result.design) };
}

export const GENERATED_KITCHENS: readonly Kitchen[] = [
  composed(
    "linear 3600",
    acceptedRoom(validLinearInput({ wallAMm: 3600, heightMm: ROOM_HEIGHT_MM })),
  ),
  composed(
    "linear 5000",
    acceptedRoom(validLinearInput({ wallAMm: 5000, heightMm: ROOM_HEIGHT_MM })),
  ),
  composed(
    "L 4000 x 3000",
    acceptedRoom(
      validLInput({ wallAMm: 4000, wallBMm: 3000, heightMm: ROOM_HEIGHT_MM }),
    ),
  ),
  composed(
    "L 5200 x 2800",
    acceptedRoom(
      validLInput({ wallAMm: 5200, wallBMm: 2800, heightMm: ROOM_HEIGHT_MM }),
    ),
  ),
  composed("U 3600 x 2400 x 2200", uRoom(3600, 2400, 2200)),
  composed("U 5000 x 4000 x 3000", uRoom(5000, 4000, 3000)),
  composed("U 4200 x 3400 x 3400", uRoom(4200, 3400, 3400)),
  {
    name: "the seeded L",
    design: KITCHEN_L_DESIGN,
    catalog: catalogOf(KITCHEN_L_DESIGN),
  },
];

export const SAMPLE_BOOK: PriceBook = SAMPLE_PRICE_BOOK;

/** `design` with the first body standing on `wall` pushed whole-wall-length past its end. */
export function withABodyPastItsWall(design: Design, wall: DesignWall): Design {
  const target = design.placements.find((placement) => placement.wall === wall);
  if (target === undefined) throw new Error(`no body stands on wall ${wall}`);
  const pastTheEnd = wallLengthMm(wall, design.room) + target.body.widthMm;
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === target.id
        ? { ...placement, alongMm: pastTheEnd }
        : placement,
    ),
  };
}

export function placementIdOnWall(design: Design, wall: DesignWall): string {
  const found = design.placements.find((placement) => placement.wall === wall);
  if (found === undefined) throw new Error(`no body stands on wall ${wall}`);
  return found.id;
}
