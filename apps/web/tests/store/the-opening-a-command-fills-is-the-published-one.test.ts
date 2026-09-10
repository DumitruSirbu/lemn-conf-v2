// AUD-005, the half backlog 52 left open: **`insertBody` is handed the published opening and the
// recorded map**, and it built its own openings out of whichever map it was given.
//
// `wall-end-cap-and-the-recorded-map.test.ts` pins the first half — `CommandContext.columns` is the
// recorded face, so a command's `effect.columns` cannot write the room-derived cap into the
// document. That change alone made the *uncapped map the uncapped opening*: at 700 mm the space
// flush to wall B's end published a 500 mm opening and the command built a 600 mm body 100 mm past
// a 2920 mm wall, out of an opening ADR 0069's owner ruling ("never", 2026-09-04) says may not be
// offered at all — while §9's own list refused a `base-sink` in that same opening by name.
//
// So `InsertBodyInput` carries both faces, each in the role ADR 0090 Amendment B gives it:
//
//   - `voids` — the **published** list, which the wall bounds. The opening is resolved out of it.
//   - `columns` — the **recorded** map, which the split rewrites and the document is projected from.
//
// Which is `OffersInput` field for field, and that is the point: §11 row 6 and ADR 0032 say the
// offer list and the command are *"the same evaluation `insertBody` runs"*, and they can only be
// that if they are handed the same openings.
//
// **Stated over the record the insert added**, not over the first record carrying the offer's
// build id: `setCabinetDepth` rebuilds every body through the catalogue, so at 700 mm the seeded
// design already holds a `base-3drawer`, a `base-dishwasher` and a `tall-pantry` of its own.
import {
  buildKitchenLBodyCatalog,
  listInsertableBodies,
  offersFor,
  KITCHEN_L_DESIGN,
  wallLengthMm,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-06T12:00:00.000Z";
const DEEPER_MM = 700;

/** The recorded space at the far end of wall B — ADR 0090 Amendment B's own fixture: 2320 to 2920
 *  at the default depth, slid to 2420–3020 at 700 and capped to 2420–2920 for publication. */
const FAR_END: EmptyColumn = {
  wall: "B",
  alongMm: 2620,
  widthMm: 600,
  y0Mm: 0,
  topMm: 2600,
  depthMm: 742,
  depthFromBuildId: "fridge-free-700",
};

/** The key both faces carry: the record slid +100 and the cap does not rename what it narrows. */
const THE_CAPPED_COLUMN = "B|2.72";

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** The store at 700 mm with the far-end space capped: recorded 600 mm wide, published 500. */
function atTheDeeperSetting(): Store {
  const store = createStore({
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => !["p7", "p24"].includes(placement.id),
    ),
    emptyColumns: [FAR_END],
  });
  store.getState().setCabinetDepth(DEEPER_MM);
  expect(store.getState().lastRejection, "the depth change itself").toBeNull();
  return store;
}

function theCappedOpeningId(store: Store): string {
  const opening = store
    .getState()
    .voids.find(
      (record) => record.col === THE_CAPPED_COLUMN && record.y0 === 0,
    );
  if (!opening) throw new Error("the capped column publishes no base opening");
  return opening.id;
}

/** §9's list for that opening, composed exactly as `useSelectionOffers` composes it: the published
 *  voids and the recorded columns. */
function offersOnTheCappedOpening(store: Store) {
  const state = store.getState();
  return offersFor({
    records: state.records,
    voids: state.voids,
    columns: state.recordedColumns,
    catalog: state.catalog,
    target: { kind: "void", id: theCappedOpeningId(store) },
    cabinetDepthMm: DEEPER_MM,
  });
}

/** The record the tap added, identified by **id** rather than by build id — the ids the store has
 *  not seen before this insert. */
function theRecordTheTapAdded(store: Store, before: readonly string[]) {
  const added = store
    .getState()
    .records.filter((record) => !before.includes(record.id));
  expect(added, "a successful insert adds exactly one record").toHaveLength(1);
  return added[0];
}

describe("an insert fills the opening the panel drew, not the one the document records", () => {
  it("places the body inside the wall, at the published width", () => {
    const store = atTheDeeperSetting();
    const before = store.getState().records.map((record) => record.id);

    store.getState().select({ kind: "void", id: theCappedOpeningId(store) });
    store.getState().insert("base-cabinet");

    expect(store.getState().lastRejection).toBeNull();
    const placed = theRecordTheTapAdded(store, before);
    expect(placed?.widthMm).toBe(500);
    expect(Math.round((placed?.frame.z ?? 0) * 1000)).toBe(2670);
  });

  it("builds every offered row at the width its own row quoted", () => {
    const listed = offersOnTheCappedOpening(atTheDeeperSetting());
    expect(listed.length).toBeGreaterThan(0);

    for (const offer of listed) {
      const store = atTheDeeperSetting();
      const before = store.getState().records.map((record) => record.id);

      store.getState().select({ kind: "void", id: theCappedOpeningId(store) });
      store.getState().insert(offer.buildId);

      expect(store.getState().lastRejection, offer.buildId).toBeNull();
      expect(
        theRecordTheTapAdded(store, before)?.widthMm,
        `${offer.buildId}'s built width`,
      ).toBe(offer.buildsToWidthMm);
    }
  });

  // **The converse, read from absence** since the owner's ruling of 2026-09-10 stopped the list
  // carrying refused rows: an entry the list left out is one this opening's tap must refuse. Same
  // correspondence, and the direction that matters more here — a row quietly missing from a capped
  // opening is a cabinet the customer could have had.
  it("refuses every row its own list left out, on that same opening", () => {
    const offered = new Set(
      offersOnTheCappedOpening(atTheDeeperSetting()).map(
        (offer) => offer.buildId,
      ),
    );
    let omitted = 0;

    for (const body of listInsertableBodies(
      atTheDeeperSetting().getState().catalog,
    )) {
      if (offered.has(body.buildId)) continue;
      omitted += 1;
      const store = atTheDeeperSetting();

      store.getState().select({ kind: "void", id: theCappedOpeningId(store) });
      store.getState().insert(body.buildId);

      expect(store.getState().lastRejection, body.buildId).not.toBeNull();
    }

    expect(omitted).toBeGreaterThan(0);
  });

  it("leaves no body past the end of its wall, whichever row was tapped", () => {
    for (const offer of offersOnTheCappedOpening(atTheDeeperSetting())) {
      const store = atTheDeeperSetting();
      store.getState().select({ kind: "void", id: theCappedOpeningId(store) });
      store.getState().insert(offer.buildId);

      const { room } = store.getState().design;
      for (const record of store.getState().records) {
        const alongM = record.wall === "A" ? record.frame.x : record.frame.z;
        expect(
          Math.round((alongM + record.frame.w / 2) * 1000),
          `${record.id} after tapping ${offer.buildId}`,
        ).toBeLessThanOrEqual(wallLengthMm(record.wall, room));
      }
    }
  });
});
