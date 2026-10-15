// The order of revisions as the store uses it when the probe answers: the stored copy is taken where its revision is
// the greater whole number and nowhere else. Each case is driven through `applyWriteAccess` on a clean store, and each
// asserts the design and the revision together: either both are the answer's or both are the page's.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";

const DESIGN_ID = "returned-to" as DesignId;
const KEPT_PAGE: Design = { ...KITCHEN_L_DESIGN, presetId: "kept-by-the-page" };
const STORED_COPY: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.slice(0, -1),
};
/** Past the largest whole number a JavaScript `number` holds exactly, where two neighbours round to one value. */
const BEYOND_A_NUMBER = 10n ** 30n;

function storeAt(revision: string | null) {
  const store = createConfiguratorStore({
    design: KEPT_PAGE,
    catalogAt: buildKitchenLBodyCatalog,
    designId: DESIGN_ID,
    revision,
  });
  if (revision !== null)
    store.getState().hydrate({
      design: KEPT_PAGE,
      designId: DESIGN_ID,
      revision,
      canWrite: "checking",
    });
  return store;
}

function answerAt(revision: string) {
  return {
    designId: DESIGN_ID,
    canWrite: true,
    stored: { design: STORED_COPY, revision },
  };
}

type Store = ReturnType<typeof storeAt>;

function expectTheCopyTaken(store: Store, revision: string): void {
  expect(store.getState()).toMatchObject({
    design: STORED_COPY,
    savedDesign: STORED_COPY,
    revision,
    canWrite: true,
  });
}

function expectThePageKept(store: Store, revision: string | null): void {
  expect(store.getState()).toMatchObject({
    design: KEPT_PAGE,
    savedDesign: KEPT_PAGE,
    revision,
    canWrite: true,
  });
}

describe("the stored copy is taken with its revision", () => {
  it.each([
    ["9", "10"],
    ["99", "100"],
    ["999999999", "1000000000"],
    ["1", "2"],
    ["9007199254740992", "9007199254740993"],
    ["19", "20"],
    ["2", "10"],
  ])("from a page at %s when %s is stored", (held, stored) => {
    const store = storeAt(held);

    store.getState().applyWriteAccess(answerAt(stored));

    expectTheCopyTaken(store, stored);
  });

  it("by a store that holds no revision at all, the design and the revision arriving together", () => {
    const store = storeAt(null);

    store.getState().applyWriteAccess(answerAt("1"));

    expectTheCopyTaken(store, "1");
  });
});

describe("the page's copy is kept with its revision, and write access alone is applied", () => {
  it.each([
    ["an equal revision", "10", "10"],
    ["the revision before a longer one", "10", "9"],
    ["the revision before a longer one, two digits to three", "100", "99"],
    ["a lesser revision of the same length", "20", "19"],
    ["a lesser single digit", "9", "1"],
    [
      "the lesser of two neighbours past what a number holds",
      "9007199254740993",
      "9007199254740992",
    ],
    ["a leading zero on the stored one", "9", "010"],
    ["a leading zero that would equal the held one", "10", "010"],
    ["nought", "1", "0"],
    ["an empty stored revision", "3", ""],
    ["a stored revision that is a word", "3", "four"],
    ["a stored revision with a sign", "3", "+4"],
    ["a negative stored revision", "3", "-4"],
    ["a stored revision with a point", "3", "4.0"],
    ["a stored revision with an exponent", "3", "1e9"],
    ["a stored revision in hexadecimal", "3", "0x10"],
    ["a stored revision with a space before it", "3", " 4"],
    ["a stored revision with a line end after it", "3", "4\n"],
    ["a stored revision in full-width digits", "3", "４"],
    ["a stored revision in Arabic-Indic digits", "3", "٤"],
    ["a held revision with a leading zero", "03", "4"],
    ["an empty held revision", "", "4"],
    ["a held revision that is a word", "three", "4"],
    ["a held revision with a line end after it", "3\n", "4"],
  ])("with %s (held %j, stored %j)", (_name, held, stored) => {
    const store = storeAt(held);

    store.getState().applyWriteAccess(answerAt(stored));

    expectThePageKept(store, held);
  });

  it.each(["", "three", "03", "0", " 1"])(
    "by a store that holds no revision when the stored one is %j",
    (stored) => {
      const store = storeAt(null);

      store.getState().applyWriteAccess(answerAt(stored));

      expectThePageKept(store, null);
    },
  );
});

describe("the order of revisions, swept", () => {
  propertyTest.prop(
    [
      fc.bigInt({ min: 1n, max: BEYOND_A_NUMBER }),
      fc.bigInt({ min: 1n, max: BEYOND_A_NUMBER }),
    ],
    { numRuns: 500 },
  )(
    "takes the copy exactly where the stored whole number is the greater, with one store write either way",
    (held, stored) => {
      const store = storeAt(String(held));
      const writes = vi.fn();
      store.subscribe(writes);

      store.getState().applyWriteAccess(answerAt(String(stored)));

      expect(writes).toHaveBeenCalledTimes(1);
      if (stored > held) expectTheCopyTaken(store, String(stored));
      else expectThePageKept(store, String(held));
    },
  );

  propertyTest.prop(
    [
      fc.bigInt({ min: 1n, max: BEYOND_A_NUMBER }),
      fc.integer({ min: -2, max: 2 }),
    ],
    { numRuns: 300 },
  )(
    "decides the same way within two of the held revision, across every change of length",
    (held, distance) => {
      const stored = held + BigInt(distance);
      fc.pre(stored >= 1n);
      const store = storeAt(String(held));

      store.getState().applyWriteAccess(answerAt(String(stored)));

      if (distance > 0) expectTheCopyTaken(store, String(stored));
      else expectThePageKept(store, String(held));
    },
  );

  it.each([9n, 99n, 999n, 10n ** 15n - 1n, 10n ** 16n - 1n, 10n ** 29n - 1n])(
    "takes the copy from %s to the next revision, one digit longer, and not the other way",
    (allNines) => {
      const next = String(allNines + 1n);
      const forward = storeAt(String(allNines));
      const backward = storeAt(next);

      forward.getState().applyWriteAccess(answerAt(next));
      backward.getState().applyWriteAccess(answerAt(String(allNines)));

      expectTheCopyTaken(forward, next);
      expectThePageKept(backward, next);
    },
  );
});
