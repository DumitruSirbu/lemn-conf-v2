import { describe, expect, it } from "vitest";

import type { Handle } from "../../src/design.js";
import {
  DEFAULT_HANDLE,
  defaultHandleOf,
  resolvedHandleOf,
  TOP_ROW_HANDLE,
  type HandleResolutionQuery,
} from "../../src/kitchen-handle/kitchen-handle.js";

const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

/** A body below the top row that takes a handle and has chosen nothing, the state every override
 *  below departs from. */
const FOLLOWING_BELOW_THE_TOP_ROW: HandleResolutionQuery = {
  ownHandle: undefined,
  kitchenSettings: {},
  canHandle: true,
  isTopRow: false,
};

function resolved(overrides: Partial<HandleResolutionQuery>) {
  return resolvedHandleOf({ ...FOLLOWING_BELOW_THE_TOP_ROW, ...overrides });
}

describe("resolvedHandleOf — a cabinet's own handle wins", () => {
  for (const own of EVERY_HANDLE) {
    for (const kitchen of EVERY_HANDLE) {
      it(`keeps its own ${own} under a kitchen ${kitchen}`, () => {
        expect(
          resolved({ ownHandle: own, kitchenSettings: { handle: kitchen } }),
        ).toBe(own);
      });
    }
  }

  it("keeps its own handle on the top row too", () => {
    expect(
      resolved({
        ownHandle: "black",
        kitchenSettings: { handle: "push" },
        isTopRow: true,
      }),
    ).toBe("black");
  });
});

describe("resolvedHandleOf — a cabinet with none follows the kitchen", () => {
  for (const kitchen of EVERY_HANDLE) {
    it(`wears the kitchen's ${kitchen} below the top row`, () => {
      expect(resolved({ kitchenSettings: { handle: kitchen } })).toBe(kitchen);
    });
  }

  it("falls to today's default when the kitchen has chosen none", () => {
    expect(resolved({ kitchenSettings: {} })).toBe(DEFAULT_HANDLE);
    expect(DEFAULT_HANDLE).toBe("steel");
  });
});

describe("resolvedHandleOf — the top row never follows the kitchen", () => {
  for (const kitchen of EVERY_HANDLE) {
    it(`stays push-to-open under a kitchen ${kitchen}`, () => {
      expect(
        resolved({ kitchenSettings: { handle: kitchen }, isTopRow: true }),
      ).toBe(TOP_ROW_HANDLE);
    });
  }

  it("is push-to-open with no kitchen handle either, as before", () => {
    expect(resolved({ isTopRow: true })).toBe("push");
  });
});

describe("resolvedHandleOf — a body that takes no handle never reports one", () => {
  for (const isTopRow of [false, true]) {
    for (const kitchenHandle of [undefined, ...EVERY_HANDLE]) {
      for (const ownHandle of [undefined, ...EVERY_HANDLE]) {
        it(`answers nothing at isTopRow ${String(isTopRow)}, kitchen ${String(kitchenHandle)}, own ${String(ownHandle)}`, () => {
          expect(
            resolved({
              canHandle: false,
              isTopRow,
              kitchenSettings: { handle: kitchenHandle },
              ownHandle,
            }),
          ).toBeUndefined();
        });
      }
    }
  }

  // A truthy non-boolean `canHandle` must be refused here as `isPushToOpen` refuses it.
  it("treats a truthy non-boolean canHandle as not taking one", () => {
    const declared = "yes" as unknown as boolean;

    expect(
      resolved({ canHandle: declared, kitchenSettings: { handle: "black" } }),
    ).toBeUndefined();
  });
});

describe("defaultHandleOf — what the panel marks when nothing is chosen", () => {
  const BELOW_THE_TOP_ROW: Omit<HandleResolutionQuery, "ownHandle"> = {
    kitchenSettings: {},
    canHandle: true,
    isTopRow: false,
  };

  it("follows the kitchen below the top row for a body that takes a handle", () => {
    expect(
      defaultHandleOf({
        ...BELOW_THE_TOP_ROW,
        kitchenSettings: { handle: "black" },
      }),
    ).toBe("black");
  });

  it("is push on the top row whatever the kitchen says", () => {
    expect(
      defaultHandleOf({
        ...BELOW_THE_TOP_ROW,
        kitchenSettings: { handle: "steel" },
        isTopRow: true,
      }),
    ).toBe("push");
  });

  it("gives a body that takes no handle the slot's default and never the kitchen's", () => {
    const base = { ...BELOW_THE_TOP_ROW, canHandle: false };

    expect(
      defaultHandleOf({ ...base, kitchenSettings: { handle: "push" } }),
    ).toBe("steel");
    expect(
      defaultHandleOf({
        ...base,
        kitchenSettings: { handle: "black" },
        isTopRow: true,
      }),
    ).toBe("push");
  });

  it("agrees with the resolver for every body that takes a handle and has chosen nothing", () => {
    for (const kitchenHandle of [undefined, ...EVERY_HANDLE]) {
      for (const isTopRow of [false, true]) {
        const query = {
          kitchenSettings: { handle: kitchenHandle },
          canHandle: true,
          isTopRow,
        };

        expect(defaultHandleOf(query)).toBe(
          resolvedHandleOf({ ...query, ownHandle: undefined }),
        );
      }
    }
  });
});
