// Adversarial QA on backlog 52 (`e01fbdd`) — `CommandContext.columns` is now the **recorded** map.
//
// `wall-end-cap-and-the-recorded-map.test.ts` proves the half the change was made for: a resize or
// an insert no longer writes the room-derived cap into the document. This file attacks the half the
// change's own commit message asserts and does not test —
//
//   > *"The openings themselves are still derived from the capped map, so nothing past the end of a
//   > wall is offered (ADR 0069)."*
//
// — which is true of `state.voids` and **false of the openings the insert command resolves against**.
// `insertBody` does not accept an opening list. It builds its own, from the map it is handed
// (`packages/configurator-domain/src/commands/insert-body.ts:80`,
// `voids: recomputeVoids(records, input.columns)`), so handing it the uncapped face hands it the
// uncapped opening. Two things follow, and both are asserted below:
//
//   - a body is **placed past the end of its wall** out of an opening ADR 0069's owner ruling says
//     may never be offered at all;
//   - the offer list and the command **stop being one evaluation** (§11 row 6): the list judges
//     `base-cabinet` against the published 500 mm opening and says 500, the command builds it at
//     600, and `base-sink` is refused in the list and accepted by the command.
//
// The fixture is the one ADR 0090 Amendment B's addendum measured, unchanged: a recorded space
// flush to wall B's end, pushed past it by a depth change the customer can undo.
import {
  buildKitchenLBodyCatalog,
  offersFor,
  KITCHEN_L_DESIGN,
  type Design,
  type EmptyColumn,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-06T12:00:00.000Z";
const DEEPER_MM = 700;

/** The recorded space at the far end of wall B, exactly as the addendum's own fixture states it:
 *  2320 to 2920 in the 2920 mm room, on the ground the fridge and the unit over it held. */
const FAR_END: EmptyColumn = {
  wall: "B",
  alongMm: 2620,
  widthMm: 600,
  y0Mm: 0,
  topMm: 2600,
  depthMm: 742,
  depthFromBuildId: "fridge-free-700",
};

/** The key the record keeps at 700 mm — it slid +100 and the cap did not rename it — and therefore
 *  the key the capped published column carries too. Written out rather than derived so a reader can
 *  see that the two faces are being addressed by one name. */
const THE_CAPPED_COLUMN = "B|2.72";

/** A sink base, whose 560 mm aperture is wider than the capped opening. The offer list leaves it
 *  out — it refused it by name and with a number until the owner ruled a refused row off the panel
 *  on 2026-09-10 — and the command has to refuse it too. */
const A_BODY_THE_LIST_REFUSES = "base-sink";

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function withASpaceAtTheFarEnd(): Store {
  return createStore({
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => !["p7", "p24"].includes(placement.id),
    ),
    emptyColumns: [FAR_END],
  });
}

/** The store at the deeper setting, with the far-end space capped: recorded 600 mm, published 500. */
function atTheDeeperSetting(): Store {
  const store = withASpaceAtTheFarEnd();
  store.getState().setCabinetDepth(DEEPER_MM);
  expect(store.getState().lastRejection, "the depth change itself").toBeNull();
  return store;
}

/** The base opening the capped column publishes — the one the customer taps. */
function theCappedOpeningId(store: Store): string {
  const opening = store
    .getState()
    .voids.find(
      (record) => record.col === THE_CAPPED_COLUMN && record.y0 === 0,
    );
  if (!opening) throw new Error("the capped column publishes no base opening");
  return opening.id;
}

/** The offer list exactly as `useSelectionOffers` composes it since backlog 52: the published voids
 *  and the **recorded** columns. Called through the domain query rather than through the hook so
 *  this file needs no renderer — the hook adds only the four store reads. */
function offersOn(store: Store) {
  const state = store.getState();
  const listed = offersFor({
    records: state.records,
    voids: state.voids,
    columns: state.recordedColumns,
    catalog: state.catalog,
    target: { kind: "void", id: theCappedOpeningId(store) },
    cabinetDepthMm: DEEPER_MM,
  });
  if (listed.length === 0)
    throw new Error("the capped opening offers nothing at all");
  return listed;
}

function insertInto(store: Store, buildId: string): void {
  store.getState().select({ kind: "void", id: theCappedOpeningId(store) });
  store.getState().insert(buildId);
}

/** **The record this tap added, identified by id and never by `buildId`.**
 *
 *  Finding it by `buildId` reads the wrong body. `setCabinetDepth` rebuilds every placement through
 *  the catalogue and renames a seeded id to its catalogue equivalent (ADR 0055 decision 1, ADR 0022) —
 *  measured: at 700 `p4` is no longer `base-drawer3-600` but `base-3drawer`. So the design already
 *  holds `base-3drawer`, `base-dishwasher` and `tall-pantry` at their own widths *before* this
 *  opening is tapped, and `find` returns one of those for three of the offered rows.
 *
 *  The correspondence being asserted is about **the body the tap produced**, so the quantifier is
 *  narrowed to it rather than the assertion being dropped: no product state can make a `buildId`
 *  lookup answer the new record, which makes that lookup an instrument premise and not a contract
 *  fact (ADR 0091 decision 1, Q1). */
function theRecordThisTapAdded(
  store: Store,
  idsBefore: ReadonlySet<string>,
): PlacementRecord | undefined {
  return store.getState().records.find((record) => !idsBefore.has(record.id));
}

describe("the opening a command resolves against is still the capped one", () => {
  // The premise, asserted first so a later failure cannot be read as the fixture drifting: the two
  // faces disagree on width by exactly the 100 mm the wall no longer covers, and agree on the key.
  it("sets up two faces of one column, 600 recorded and 500 published", () => {
    const store = atTheDeeperSetting();

    const recorded = store.getState().recordedColumns.get(THE_CAPPED_COLUMN);
    const published = store.getState().columns.get(THE_CAPPED_COLUMN);
    expect(Math.round((recorded?.w ?? 0) * 1000)).toBe(600);
    expect(Math.round((published?.w ?? 0) * 1000)).toBe(500);
    expect(
      store.getState().voids.filter((v) => v.col === THE_CAPPED_COLUMN).length,
    ).toBeGreaterThan(0);
  });

  // §11 row 6 — the offer list and the command are one evaluation read from two ends — and ADR
  // 0032's own words for it: *"the same evaluation `insertBody` runs, which is what makes a refused
  // verdict the refusal the command would actually give."*
  //
  // **Swept across the whole list rather than shown on one row**, because the claim is a
  // correspondence and not an example: for every entry the panel draws in this opening, the tap
  // must do what the row said it would. Today `base-cabinet`, `base-3drawer`, `base-panbank` and
  // `tall-pantry` are all quoted at the published 500 mm and all built at the recorded 600, and
  // `base-sink` is absent from the list, because it needs 560 mm and the opening publishes 500; the
  // test below is the half that proves the command agrees about it.
  it("does with the tap what every row of its own offer list said", () => {
    const listed = offersOn(atTheDeeperSetting());

    for (const offer of listed) {
      const store = atTheDeeperSetting();
      const idsBefore = new Set(
        store.getState().records.map((record) => record.id),
      );
      insertInto(store, offer.buildId);
      const rejection = store.getState().lastRejection;

      expect(rejection, `${offer.buildId} was offered in the list`).toBeNull();
      const placed = theRecordThisTapAdded(store, idsBefore);
      // Non-vacuity: a lookup that answered `undefined` would make the width assertion below pass
      // for the wrong reason on every row (ADR 0093 decision 1).
      expect(placed, `${offer.buildId} produced a record`).toBeDefined();
      expect(
        placed?.buildId,
        `${offer.buildId} is the body that was built`,
      ).toBe(offer.buildId);
      expect(placed?.widthMm, `${offer.buildId}'s built width`).toBe(
        offer.buildsToWidthMm,
      );
    }
  });

  // The single row that makes the correspondence above impossible to read as a rounding difference:
  // the list refuses this body *with the opening's width in the refusal*, and the command accepts
  // it and builds a 600 mm sink base on a wall with 500 mm of room left.
  it("refuses what the offer list leaves out, on the same opening", () => {
    // **Read from absence since the owner's ruling of 2026-09-10**: the list no longer publishes a
    // refusal to compare against, so the row that is not there is the claim. The command still has
    // to agree, which is the whole correspondence — a body missing from the list that the tap then
    // accepted would be a cabinet the customer could have had and was never shown.
    const store = atTheDeeperSetting();
    expect(offersOn(store).map((offer) => offer.buildId)).not.toContain(
      A_BODY_THE_LIST_REFUSES,
    );

    insertInto(store, A_BODY_THE_LIST_REFUSES);

    expect(store.getState().lastRejection).not.toBeNull();
  });
});
