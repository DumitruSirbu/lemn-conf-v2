// M10 Q5a QA: the store's fold of `colour_replaced` and `handle_replaced`, attacked where the implementer's file did not.
//
// `q5a-replacement-effects.test.ts` holds the selection through each effect from a design with no opening. This adds:
// the document's geometry (columns, openings, every placement's frame) untouched by a replacement even when the design
// has an opening to lose; a selected opening carried through and a dangling opening dropped; the replaced values shown
// on the placement records; and a refusal of each kind leaving the store's state to the rejection alone.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  paletteFinish,
  replaceColour,
  replaceHandle,
  type CommandResult,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  applyCommandResult,
  type Selection,
} from "../../src/store/apply-command-result";
import { createConfiguratorStore } from "../../src/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const CLOCK = "2026-11-09T09:00:00.000Z";
const ANTRACIT = paletteFinish("pal.antracit");
const ALB = paletteFinish("pal.alb");

/** A kitchen with one cabinet removed, so it has an opening, wearing colours and handles at both levels. */
function stateWithAnOpening() {
  const store = createConfiguratorStore({
    design: {
      ...KITCHEN_L_DESIGN,
      settings: {
        cabinetDepthMm: 600,
        finish: ANTRACIT,
        handle: "black",
        topRowHandle: "black",
      },
      placements: KITCHEN_L_DESIGN.placements.map((placement, index) =>
        index === 1
          ? {
              ...placement,
              body: {
                ...placement.body,
                finish: ANTRACIT,
                handle: "black" as Handle,
              },
            }
          : placement,
      ),
    },
    catalogAt: buildKitchenLBodyCatalog,
    now: () => CLOCK,
    probeAt: createFakeProbeFactory(),
    onDesignChanged: () => undefined,
  });
  const removed = store.getState().records[0]?.id ?? "";
  store.getState().select({ kind: "placement", id: removed });
  store.getState().remove();
  return store.getState();
}

const state = stateWithAnOpening();
const aVoid: Selection = { kind: "void", id: state.voids[0]?.id ?? "" };
const aPlacement: Selection = {
  kind: "placement",
  id: state.records[0]?.id ?? "",
};

function colourReplacement(design: Design): CommandResult {
  return replaceColour({ design, from: ANTRACIT, to: ALB, occurredAt: CLOCK });
}

function handleReplacement(design: Design): CommandResult {
  return replaceHandle({
    design,
    from: "black",
    to: "push",
    occurredAt: CLOCK,
  });
}

const replacements: readonly (readonly [string, CommandResult])[] = [
  ["replaceColour", colourReplacement(state.design)],
  ["replaceHandle", handleReplacement(state.design)],
];

function foldOf(result: CommandResult, selection: Selection) {
  return applyCommandResult({
    result,
    catalog: state.catalog,
    columns: state.recordedColumns,
    selection,
  });
}

describe("the fold of a replacement into a kitchen that has an opening", () => {
  it("has an opening and a cabinet to select, and a design that wears what the replacements replace", () => {
    expect(aVoid.id).not.toBe("");
    expect(aPlacement.id).not.toBe("");
    expect(JSON.stringify(state.design)).toContain("pal.antracit");
  });

  it.each(replacements)(
    "%s moves no column, no opening and no frame: only what the cabinets say they wear",
    (_name, result) => {
      const folded = foldOf(result, null);
      if (!folded.applied) throw new Error("the command refused");

      expect(folded.state.voids).toEqual(state.voids);
      expect(folded.state.columns).toEqual(state.columns);
      expect(folded.state.recordedColumns).toEqual(state.recordedColumns);
      expect(folded.state.records.map(({ id, frame }) => [id, frame])).toEqual(
        state.records.map(({ id, frame }) => [id, frame]),
      );
      expect(folded.state.design.emptyColumns).toEqual(
        state.design.emptyColumns,
      );
      expect(folded.state.design.columnExtents).toEqual(
        state.design.columnExtents,
      );
    },
  );

  it.each(replacements)(
    "%s keeps a selected opening selected, and clears the sentence a refusal left",
    (_name, result) => {
      const folded = foldOf(result, aVoid);
      if (!folded.applied) throw new Error("the command refused");

      expect(folded.state.selection).toEqual(aVoid);
      expect(folded.state.lastRejection).toBeNull();
    },
  );

  it.each(replacements)(
    "%s drops an opening that is not there rather than keeping an id nothing answers",
    (_name, result) => {
      const folded = foldOf(result, { kind: "void", id: "no-such-opening" });
      if (!folded.applied) throw new Error("the command refused");

      expect(folded.state.selection).toBeNull();
    },
  );

  it("shows the replaced colour and handle on the cabinet's record, and only there", () => {
    const withColour = foldOf(colourReplacement(state.design), null);
    const withHandle = foldOf(handleReplacement(state.design), null);
    if (!withColour.applied || !withHandle.applied) throw new Error("refused");

    const colours = (records: typeof state.records) =>
      records.flatMap(({ finishKey }) => (finishKey ? [finishKey] : []));
    const handles = (records: typeof state.records) =>
      records.flatMap(({ handleMode }) => (handleMode ? [handleMode] : []));
    expect(colours(state.records)).toEqual([ANTRACIT]);
    expect(colours(withColour.state.records)).toEqual([ALB]);
    expect(handles(withColour.state.records)).toEqual(handles(state.records));
    expect(handles(withHandle.state.records)).toEqual(["push"]);
    expect(colours(withHandle.state.records)).toEqual(colours(state.records));
  });
});

describe("a refused replacement reaches the store as the rejection alone", () => {
  const refusals: readonly (readonly [string, CommandResult, string])[] = [
    [
      "a malformed clock",
      replaceColour({
        design: state.design,
        from: ANTRACIT,
        to: ALB,
        occurredAt: "yesterday",
      }),
      "INVALID_OCCURRED_AT",
    ],
    [
      "a colour the material does not offer",
      replaceColour({
        design: state.design,
        from: ANTRACIT,
        to: paletteFinish("veneer.nuc"),
        occurredAt: CLOCK,
      }),
      "FINISH_NOT_OFFERED",
    ],
    [
      "a handle outside the declared set",
      replaceHandle({
        design: state.design,
        from: "black",
        to: "gold" as Handle,
        occurredAt: CLOCK,
      }),
      "UNKNOWN_HANDLE",
    ],
  ];

  it.each(refusals)(
    "%s: the application is `applied: false`, carries the code, and no design, records or selection",
    (_label, result, code) => {
      const folded = foldOf(result, aPlacement);

      if (folded.applied) throw new Error("a refusal was applied");
      expect(folded.state.lastRejection.code).toBe(code);
      expect(Object.keys(folded.state)).toEqual(["lastRejection"]);
      expect(result.design).toBe(state.design);
    },
  );
});
