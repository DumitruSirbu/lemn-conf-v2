// H-6 for M10 Q5a: the two replacement effects are members of `CommandEffect` and the store's selection fold carries
// the held selection through them, as it does for every other effect that names no one cabinet. Without the branch in
// `intendSelection` the fold reads `effect.placementId`, which these effects do not have, and the selection is lost.
import {
  buildKitchenLBodyCatalog,
  deriveRecordedColumns,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  paletteFinish,
  replaceColour,
  replaceHandle,
  toMetres,
  type CommandResult,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  applyCommandResult,
  type Selection,
} from "../../src/store/apply-command-result";

const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(600);
const ANTRACIT = paletteFinish("pal.antracit");

const DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  settings: {
    cabinetDepthMm: 600,
    finish: ANTRACIT,
    handle: "black",
  },
};
const COLUMNS = deriveRecordedColumns(
  derivePlacementRecords(DESIGN, CATALOG),
  DESIGN,
  toMetres(DESIGN.room.widthMm),
);
const SURVIVING_PLACEMENT = DESIGN.placements[0];

function applyHolding(result: CommandResult, selection: Selection) {
  const application = applyCommandResult({
    result,
    catalog: CATALOG,
    columns: COLUMNS,
    selection,
  });
  if (!application.applied)
    throw new Error(application.state.lastRejection.code);
  return application.state;
}

describe("the store applies a replacement and leaves the selection where it was", () => {
  const replacements: readonly [string, () => CommandResult][] = [
    [
      "replaceColour",
      () =>
        replaceColour({
          design: DESIGN,
          from: ANTRACIT,
          to: paletteFinish("pal.alb"),
          occurredAt: OCCURRED_AT,
        }),
    ],
    [
      "replaceHandle",
      () =>
        replaceHandle({
          design: DESIGN,
          from: "black",
          to: "push",
          occurredAt: OCCURRED_AT,
        }),
    ],
  ];

  it.each(replacements)("keeps a placement selected after %s", (_name, run) => {
    if (!SURVIVING_PLACEMENT)
      throw new Error("the seeded kitchen has no cabinet");
    const selection: Selection = {
      kind: "placement",
      id: SURVIVING_PLACEMENT.id,
    };

    const state = applyHolding(run(), selection);

    expect(state.selection).toEqual(selection);
  });

  it.each(replacements)(
    "keeps nothing selected after %s when nothing was",
    (_name, run) => {
      expect(applyHolding(run(), null).selection).toBeNull();
    },
  );

  it.each(replacements)(
    "drops a selection that no longer exists after %s, never inventing one",
    (_name, run) => {
      const state = applyHolding(run(), {
        kind: "placement",
        id: "no-such-cabinet",
      });

      expect(state.selection).toBeNull();
    },
  );

  it("applies the rewritten design, not the one it was given", () => {
    const replaced = replaceColour({
      design: DESIGN,
      from: ANTRACIT,
      to: paletteFinish("pal.alb"),
      occurredAt: OCCURRED_AT,
    });

    const state = applyHolding(replaced, null);

    expect(state.design.settings?.finish).toEqual(paletteFinish("pal.alb"));
    expect(state.lastRejection).toBeNull();
  });
});
