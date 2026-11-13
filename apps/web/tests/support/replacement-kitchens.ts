// The kitchens and availabilities the replacement sheet's suites share: the sample kitchen given settings, colours and handles at
// the levels a design stores them, and a price root that switches named items off.
import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type { PriceBookRoot } from "@/price/price-book-root";

import { SAMPLE_PRICE_ROOT } from "./sample-price-root";

export const OCCURRED_AT = "2026-11-09T09:00:00.000Z";

export const WHITE = paletteFinish("pal.alb");
export const ANTHRACITE = paletteFinish("pal.antracit");
export const HAVANNA = paletteFinish("pal.gri-havanna");
export const VENEER_OAK = paletteFinish("veneer.stejar");

export const BLACK_OFF: ItemRef = { kind: "handle", handle: "black" };
export const WHITE_OFF: ItemRef = { kind: "finish", finishId: "pal.alb" };
export const ANTHRACITE_OFF: ItemRef = {
  kind: "finish",
  finishId: "pal.antracit",
};
export const HAVANNA_OFF: ItemRef = {
  kind: "finish",
  finishId: "pal.gri-havanna",
};
export const VENEER_OFF: ItemRef = {
  kind: "material",
  tierId: "material.veneer",
};
export const VENEER_OAK_OFF: ItemRef = {
  kind: "finish",
  finishId: "veneer.stejar",
};

type Settings = NonNullable<Design["settings"]>;
type Body = Design["placements"][number]["body"];

/** The sample kitchen with these settings laid over its own. */
export function kitchenWith(settings: Settings): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

/** The design with the first cabinets given their own colour or handle; a cabinet with no entry here is left as it is. */
export function withCabinets(
  design: Design,
  bodies: readonly Partial<Body>[],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const own = bodies[index];
      return own === undefined
        ? placement
        : { ...placement, body: { ...placement.body, ...own } };
    }),
  };
}

/** The design with the cabinet at this position given its own colour or handle. */
export function withCabinetAt(
  design: Design,
  index: number,
  body: Partial<Body>,
): Design {
  return withCabinets(
    design,
    Array.from({ length: index + 1 }, (_, at) => (at === index ? body : {})),
  );
}

/** The sample price root, with availability switching exactly these items off. */
export function rootSwitchingOff(...items: readonly ItemRef[]): PriceBookRoot {
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: { revision: "1", disabled: items },
  };
}
