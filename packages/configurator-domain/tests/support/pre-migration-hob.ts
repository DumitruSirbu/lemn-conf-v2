// The seeded kitchen as it stood **before** ADR 0027, which is the only shape that still carries an
// accessory.
//
// ADR 0027 made the hob part of the cabinet body, so `KITCHEN_L_DESIGN` has no accessory in it any
// more — `p2` is one hob-bearing placement where `p2` + `p3` used to be two. §6.1's host resolution
// and §5.1's delete cascade are still live code, and they are still reachable: a design saved before
// the migration carries a `cooktop-600` placement, which is exactly why that catalogue row was kept
// rather than deleted with the placement.
//
// Derived from the shipped design rather than copied beside it, so the two cannot drift: the ids,
// the coordinates and the widths are the shipped ones, and only the two placements the migration
// touched are put back the way they were.
import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";

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
