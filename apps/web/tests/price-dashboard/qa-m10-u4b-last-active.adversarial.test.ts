// What the materials screens let a person do to the last material customers can choose, held over every state of the three
// materials' availability and every defaults the kitchens may have saved. The screens judge through the lifecycle model, so
// the model is swept whole rather than sampled. The draft's own deletions are the screens', and are held in the DOM tests
// beside them.
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import {
  countedDeletionOf,
  deleteStandOf,
  switchStandOf,
  type LifecycleContext,
} from "@/price-dashboard/item-lifecycle-model";

import { MDF, PAL, VENEER, materialItem } from "./material-harness";

const TIERS = [PAL, MDF, VENEER] as const;

/** Every subset of the three materials, as a list of tier ids. */
const SUBSETS: readonly (readonly string[])[] = Array.from(
  { length: 2 ** TIERS.length },
  (_, mask) => TIERS.filter((_tier, bit) => (mask >> bit) % 2 === 1),
);

const DEFAULTS: readonly NewKitchenSettings[] = [
  {},
  { materialTierId: MDF },
  { materialTierId: VENEER },
];

interface State {
  readonly disabled: readonly string[];
  readonly defaults: NewKitchenSettings;
}

const STATES: readonly State[] = DEFAULTS.flatMap((defaults) =>
  SUBSETS.map((disabled) => ({ disabled, defaults })),
);

const contextOf = ({ disabled, defaults }: State): LifecycleContext => ({
  book: SAMPLE_PRICE_BOOK,
  availability: { revision: "1", disabled: disabled.map(materialItem) },
  defaults,
  canWrite: true,
});

const deletable = (tierId: string) => materialItem(tierId) as DeletableItemRef;

/** Counted as used by no kitchen, so a deletion is judged on the defaults alone. */
const NO_USE = TIERS.map((tierId) => ({
  item: materialItem(tierId),
  designCount: 0,
}));

const isOn = ({ disabled }: State, tierId: string) =>
  !disabled.includes(tierId);

const label = (state: State) => JSON.stringify(state);

describe("the states swept", () => {
  it("are every subset switched off under every saved defaults, so a sweep that reached nothing would show", () => {
    expect(STATES).toHaveLength(DEFAULTS.length * 2 ** TIERS.length);
  });
});

describe("PAL, the fixed default", () => {
  it("is offered neither a switch-off nor a deletion in any state, even one that already has it off", () => {
    for (const state of STATES) {
      const context = contextOf(state);

      expect(
        switchStandOf(materialItem(PAL), context).kind,
        label(state),
      ).not.toBe("disable");
      expect(deleteStandOf(deletable(PAL), context).kind, label(state)).toBe(
        "off",
      );
      expect(
        countedDeletionOf(deletable(PAL), context, NO_USE).kind,
        label(state),
      ).toBe("off");
    }
  });

  it("meets the last-active block, not the fixed-default reason, when MDF and veneer are both off", () => {
    const state: State = { disabled: [MDF, VENEER], defaults: {} };

    expect(switchStandOf(materialItem(PAL), contextOf(state))).toEqual({
      kind: "last-active-option",
    });
  });
});

describe("the one material that is on", () => {
  const ONLY_ONE_ON = STATES.filter(
    (state) => TIERS.filter((tierId) => isOn(state, tierId)).length === 1,
  );

  it("is told it cannot be switched off, whichever it is and whatever defaults are saved: the last option is judged before any default", () => {
    expect(ONLY_ONE_ON).toHaveLength(DEFAULTS.length * TIERS.length);
    for (const state of ONLY_ONE_ON) {
      const only = TIERS.find((tierId) => isOn(state, tierId)) ?? "";

      expect(
        switchStandOf(materialItem(only), contextOf(state)),
        label(state),
      ).toEqual({ kind: "last-active-option" });
    }
  });
});

describe("a switch-off that is offered", () => {
  it("never leaves customers with nothing, in any state a book can be in", () => {
    const offered = STATES.flatMap((state) =>
      TIERS.filter(
        (tierId) =>
          isOn(state, tierId) &&
          switchStandOf(materialItem(tierId), contextOf(state)).kind ===
            "disable",
      ).map((tierId) => ({ state, tierId })),
    );

    expect(offered.length).toBeGreaterThan(0);
    for (const { state, tierId } of offered) {
      const left = TIERS.filter(
        (other) => other !== tierId && isOn(state, other),
      );

      expect(left, `${tierId} off in ${label(state)}`).not.toEqual([]);
    }
  });
});

describe("a deletion that is allowed", () => {
  it("is never of PAL, and never of the material a saved default names", () => {
    const allowed = STATES.flatMap((state) =>
      TIERS.filter(
        (tierId) =>
          countedDeletionOf(deletable(tierId), contextOf(state), NO_USE)
            .kind === "allowed",
      ).map((tierId) => ({ state, tierId })),
    );

    expect(allowed.length).toBeGreaterThan(0);
    for (const { state, tierId } of allowed) {
      expect(tierId, label(state)).not.toBe(PAL);
      expect(tierId, label(state)).not.toBe(state.defaults.materialTierId);
    }
  });

  it("is refused, with the saved default's own reason, for the material the kitchens' defaults name, and so is its switch-off", () => {
    for (const tierId of [MDF, VENEER]) {
      const context = contextOf({
        disabled: [],
        defaults: { materialTierId: tierId },
      });

      expect(deleteStandOf(deletable(tierId), context), tierId).toEqual({
        kind: "off",
        reason: "item-is-default",
      });
      expect(switchStandOf(materialItem(tierId), context), tierId).toEqual({
        kind: "off",
        reason: "item-is-default",
      });
    }
  });
});

describe("a material that is off", () => {
  it("is offered a switch-on in every state that holds it off", () => {
    const offStates = STATES.flatMap((state) =>
      state.disabled.map((tierId) => ({ state, tierId })),
    );

    expect(offStates.length).toBeGreaterThan(0);
    for (const { state, tierId } of offStates) {
      expect(
        switchStandOf(materialItem(tierId), contextOf(state)).kind,
        label(state),
      ).toBe("enable");
    }
  });
});
