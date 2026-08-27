// The seeded kitchen as it stood **before** ADR 0027 — the only shape that still carries an
// accessory.
//
// ADR 0027 made the hob part of the cabinet body, so `KITCHEN_L_DESIGN` has no accessory in it any
// more: `p2` is one hob-bearing placement where `p2` + `p3` used to be two. The panel's §11 row 24
// fallback, §9's "an accessory offers no replace section" and the store's delete cascade are all
// still live code, and a design saved before the migration is what still reaches them — which is
// why `cooktop-600` is still a catalogue row.
//
// Derived from the shipped design rather than written out beside it, so the coordinates cannot
// drift from the ones the assertions were written against. `configurator-domain` keeps its own copy
// of this for its own tests; the two packages must stay liftable into separate repositories
// (`docs/best-practices/engineering-conventions.md`), so neither imports the other's test support.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";

/** The cabinet the hob stands on — the placement ADR 0027 turned into the composite. */
export const PRE_MIGRATION_HOST_ID = "p2";

/** The hob's own placement, which the migration removed. */
export const PRE_MIGRATION_HOB_ID = "p3";

/** What `p2` was built from before the hob moved into its body. */
const PRE_MIGRATION_HOST_BUILD_ID = "base-drawer2-600";

export function preMigrationHobDesign(): Design {
  const host = KITCHEN_L_DESIGN.placements.find(
    (placement) => placement.id === PRE_MIGRATION_HOST_ID,
  );
  if (!host) {
    throw new Error(
      `The seeded design has no ${PRE_MIGRATION_HOST_ID} to un-migrate`,
    );
  }
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      ...KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === PRE_MIGRATION_HOST_ID
          ? {
              ...placement,
              body: { ...placement.body, buildId: PRE_MIGRATION_HOST_BUILD_ID },
            }
          : placement,
      ),
      {
        id: PRE_MIGRATION_HOB_ID,
        wall: "A" as const,
        alongMm: host.alongMm,
        y0Mm: 860,
        body: {
          buildId: "cooktop-600",
          widthMm: host.body.widthMm,
          heightMm: 40,
        },
      },
    ],
  };
}
