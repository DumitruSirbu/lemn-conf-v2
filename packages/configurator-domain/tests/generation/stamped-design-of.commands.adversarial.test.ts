// QA of M10 R4b3 rule 10: `stampedDesignOf` composes the public commands in one order, and offers each tier command the
// stamped tier alone. The commands are wrapped, not replaced, so what is measured is the calls the stamp makes and the
// result stays the real commands'.
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(
  () => [] as { readonly command: string; readonly input: unknown }[],
);

vi.mock(
  "../../src/commands/set-whole-kitchen-settings.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/commands/set-whole-kitchen-settings.js")
      >();
    const recorded = (command: string, run: (input: never) => unknown) =>
      ((input: unknown) => {
        calls.push({ command, input });
        return run(input as never);
      }) as never;
    return {
      ...actual,
      setMaterialTier: recorded("material", actual.setMaterialTier),
      setHardwareTier: recorded("hardware", actual.setHardwareTier),
      setGlobalFinish: recorded("finish", actual.setGlobalFinish),
    };
  },
);

vi.mock("../../src/commands/set-kitchen-handle.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/commands/set-kitchen-handle.js")
    >();
  return {
    ...actual,
    setKitchenHandle: ((input: unknown) => {
      calls.push({ command: "handle", input });
      return actual.setKitchenHandle(input as never);
    }) as never,
  };
});

import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  stampedDesignOf,
} from "../../src/index.js";

function commandsOf(
  design: Parameters<typeof stampedDesignOf>[0],
  request: Parameters<typeof stampedDesignOf>[1],
): string[] {
  calls.length = 0;
  stampedDesignOf(design, request);
  return calls.map(({ command }) => command);
}

describe("stampedDesignOf composes the public commands (rule 10)", () => {
  it("runs the material, the hardware, the colour and the handle, in that order, for a whole request", () => {
    const order = commandsOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
      finish: paletteFinish("veneer.nuc"),
      handle: "black",
      topRowHandle: "steel",
    });

    expect(order).toEqual(["material", "hardware", "finish", "handle"]);
  });

  it("offers each tier command the stamped tier and no other id", () => {
    commandsOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
    });

    const [material, hardware] = calls.map(({ input }) => input) as {
      tierId: string;
      availableTierIds: readonly string[];
    }[];
    expect(material).toMatchObject({
      tierId: "material.veneer",
      availableTierIds: ["material.veneer"],
    });
    expect(hardware).toMatchObject({
      tierId: "hardware.premium",
      availableTierIds: ["hardware.premium"],
    });
  });

  it("gives every command the design's own updatedAt as its clock", () => {
    commandsOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
      finish: paletteFinish("veneer.nuc"),
      handle: "black",
    });

    expect(calls.length).toBe(4);
    for (const { input } of calls) {
      expect(input).toMatchObject({ occurredAt: KITCHEN_L_DESIGN.updatedAt });
    }
  });

  it("runs no command for a request without the key that command writes", () => {
    expect(commandsOf(KITCHEN_L_DESIGN, {})).toEqual([]);
    expect(commandsOf(KITCHEN_L_DESIGN, { cabinetDepthMm: 700 })).toEqual([]);
    expect(commandsOf(KITCHEN_L_DESIGN, { topRowHandle: "black" })).toEqual([]);
    expect(commandsOf(KITCHEN_L_DESIGN, { handle: "black" })).toEqual([
      "handle",
    ]);
    expect(
      commandsOf(KITCHEN_L_DESIGN, { hardwareTierId: "hardware.premium" }),
    ).toEqual(["hardware"]);
  });

  it("runs no command at all for a refused request", () => {
    calls.length = 0;

    expect(() =>
      stampedDesignOf(KITCHEN_L_DESIGN, {
        materialTierId: "material.veneer",
        cabinetDepthMm: 650,
      }),
    ).toThrow();

    expect(calls).toEqual([]);
  });
});
