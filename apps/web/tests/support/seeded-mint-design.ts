// The row `POST /api/designs` mints under the seeded book with nothing saved. The keys are written out, not read from the
// reader, so a reader that resolved another value turns the tests comparing against this red.
import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  stampedDesignOf,
  type Design,
} from "@lemnaria/configurator-domain";

export const SEEDED_MINT_DESIGN: Design = stampedDesignOf(KITCHEN_L_DESIGN, {
  materialTierId: "material.melamine",
  hardwareTierId: "hardware.standard",
  finish: paletteFinish("pal.alb"),
  handle: "steel",
  topRowHandle: "push",
});
