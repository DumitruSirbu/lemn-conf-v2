import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";

import {
  plantSentKitchen,
  plantStaffWorld,
  saveKitchenAgain,
  type StaffWorld,
} from "./staff-world";

// The scenario of the changed-kitchens specs: three sent kitchens of one client, planted on the test database. One the
// client saved again after sending it, so staff read it as changed; one it did not; and one whose document as it stands
// has a body no price list holds, so its current estimate is refused. Every figure the specs read is derived here, so a
// spec states what it expects and not how the world was made.

/** What the request of the changed and the unpriceable kitchens was priced at, in bani: 58 200 lei. */
export const SENT_TOTAL_MINOR = 5_820_000;

/** The number of bodies the copy as sent holds; the kitchen as it stands holds more. */
export const BODIES_SENT = 3;

const UNKNOWN_BODY_ID = "a-body-no-price-list-holds";

const SENT_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.slice(0, BODIES_SENT),
};

const UNPRICEABLE_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.map((placement, index) =>
    index === 0
      ? { ...placement, body: { ...placement.body, buildId: UNKNOWN_BODY_ID } }
      : placement,
  ),
};

/** The bodies of the kitchen as it stands, which the copy as sent adds up to once its own are taken away. */
export const BODIES_NOW = KITCHEN_L_DESIGN.placements.length;

export interface ChangedWorld {
  readonly world: StaffWorld;
  readonly changed: { readonly id: string; readonly name: string };
  readonly unchanged: { readonly id: string; readonly name: string };
  readonly unpriceable: { readonly id: string; readonly name: string };
}

export async function plantChangedWorld(): Promise<ChangedWorld> {
  const world = await plantStaffWorld();
  const changed = {
    name: `${world.marker} modificata`,
    id: await plantSentKitchen(world, {
      name: `${world.marker} modificata`,
      sentCopy: { document: SENT_DESIGN, pricedTotalMinor: SENT_TOTAL_MINOR },
    }),
  };
  await saveKitchenAgain(world, changed.id);
  const unchanged = {
    name: `${world.marker} nemodificata`,
    id: await plantSentKitchen(world, {
      name: `${world.marker} nemodificata`,
    }),
  };
  const unpriceable = {
    name: `${world.marker} fara pret`,
    id: await plantSentKitchen(world, {
      name: `${world.marker} fara pret`,
      savedBeforeSending: UNPRICEABLE_DESIGN,
      sentCopy: {
        document: SENT_DESIGN,
        pricedTotalMinor: SENT_TOTAL_MINOR,
        designRevision: "2",
      },
    }),
  };
  return { world, changed, unchanged, unpriceable };
}

/** The three kitchens of the world, which a search for its marker finds. */
export const KITCHENS_OF_THE_WORLD = 3;
