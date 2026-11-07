// The row `POST /api/designs` mints under the test world's seeded price book and nothing saved: `KITCHEN_L_DESIGN`
// stamped with the fixed fallbacks (M10 R4b3 item 5, A-9). The five keys are written out, not read from the reader that
// resolves them, so a reader that resolved another value turns the tests that compare against this red. The depth stays
// the fixture's: the server has no probe to move it (rule 4).
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
