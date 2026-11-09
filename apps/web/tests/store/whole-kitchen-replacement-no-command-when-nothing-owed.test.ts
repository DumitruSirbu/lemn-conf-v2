// A replacement that owes nothing must not even call the domain's command: `updatedAt` moves on every command result, so a
// no-op that ran would be saved. The result-level pins (`unchanged`, no save) cannot tell a dropped replacement from a
// command that ran and happened to change nothing the test compared, so the commands themselves are spied on.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  replaceColour: vi.fn(),
  replaceHandle: vi.fn(),
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  spies.replaceColour.mockImplementation(actual.replaceColour);
  spies.replaceHandle.mockImplementation(actual.replaceHandle);
  return {
    ...actual,
    replaceColour: spies.replaceColour,
    replaceHandle: spies.replaceHandle,
  };
});

import type { AppearanceReplacement } from "@/store/whole-kitchen-apply";

import { ANTHRACITE, HAVANNA, WHITE } from "../support/replacement-kitchens";
import { preflight } from "../support/whole-kitchen-press";

const kitchen: Design = {
  ...KITCHEN_L_DESIGN,
  settings: {
    ...KITCHEN_L_DESIGN.settings,
    finish: WHITE,
    handle: "black",
    topRowHandle: "steel",
  },
  placements: KITCHEN_L_DESIGN.placements.map((placement, index) =>
    index === 0
      ? {
          ...placement,
          body: { ...placement.body, finish: WHITE, handle: "black" as const },
        }
      : placement,
  ),
};

function press(
  replacement: AppearanceReplacement | undefined,
  design: Design = kitchen,
) {
  return preflight({ replacement }, design);
}

beforeEach(() => {
  spies.replaceColour.mockClear();
  spies.replaceHandle.mockClear();
});

describe("the replacement commands run only when something is owed", () => {
  it.each([
    ["a colour for itself", { kind: "finish", from: WHITE, to: WHITE }],
    [
      "a colour stored nowhere",
      { kind: "finish", from: HAVANNA, to: ANTHRACITE },
    ],
    ["a handle for itself", { kind: "handle", from: "black", to: "black" }],
    ["a handle stored nowhere", { kind: "handle", from: "push", to: "steel" }],
    ["nothing at all", undefined],
  ] satisfies readonly (readonly [
    string,
    AppearanceReplacement | undefined,
  ])[])(
    "%s calls neither command, and the press is unchanged",
    (_name, replacement) => {
      expect(press(replacement)).toEqual({ outcome: "unchanged" });
      expect(spies.replaceColour).not.toHaveBeenCalled();
      expect(spies.replaceHandle).not.toHaveBeenCalled();
    },
  );

  it("a colour owed calls the colour command once and never the handle's", () => {
    press({ kind: "finish", from: WHITE, to: HAVANNA });

    expect(spies.replaceColour).toHaveBeenCalledTimes(1);
    expect(spies.replaceHandle).not.toHaveBeenCalled();
  });

  it("a handle owed calls the handle command once and never the colour's", () => {
    press({ kind: "handle", from: "black", to: "push" });

    expect(spies.replaceHandle).toHaveBeenCalledTimes(1);
    expect(spies.replaceColour).not.toHaveBeenCalled();
  });

  it("a handle stored only on the top row is owed, though neither the kitchen's handle nor any cabinet's is the replaced one", () => {
    const topRowOnly: Design = {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        handle: "steel",
        topRowHandle: "black",
      },
    };

    const outcome = press(
      { kind: "handle", from: "black", to: "push" },
      topRowOnly,
    );

    expect(outcome.outcome).toBe("ready");
    expect(spies.replaceHandle).toHaveBeenCalledTimes(1);
  });
});
