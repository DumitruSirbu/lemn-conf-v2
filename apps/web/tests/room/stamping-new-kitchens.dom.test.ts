// @vitest-environment happy-dom
// M10 R4b3 items 3 and 4: a generated kitchen and the copy of a preset are created with the new-kitchen settings, through
// the real `useGeneration` and `usePresetCopy`. The attempt is replaced by one that records the design it was given and
// how often it was run, so "one row per preset" is counted where rows are made; the adapter is a fake kit over the
// fake probe, so the depth the copy is moved to is the domain's own rebuild.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  freeColourFinish,
  KITCHEN_L_DESIGN,
  paletteFinish,
  setCabinetDepth,
  stampedDesignOf,
  type BodyProbe,
  type Design,
  type DesignRoom,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const adapter = vi.hoisted(() => ({ built: 0, makeKitThrows: false }));
const attempts = vi.hoisted(() => ({
  designs: [] as Design[],
  runs: 0,
  failuresLeft: 0,
}));
const domain = vi.hoisted(() => ({ refuseDepthOnce: false }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => router,
}));

vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    makeKit: (options: { cabinetDepthMm?: number }) => {
      if (adapter.makeKitThrows) throw new Error("the adapter chunk failed");
      adapter.built += 1;
      return {
        cabinetDepthMm: options.cabinetDepthMm,
        builders: { "kitchen-l": () => ({}) },
      };
    },
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe =>
      createFakeBodyProbe({ cabinetDepthMm: kit.cabinetDepthMm ?? 600 }),
    disposeKit: () => undefined,
  };
});

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    generateKitchen: vi.fn(actual.generateKitchen),
    setCabinetDepth: vi.fn(
      (input: Parameters<typeof actual.setCabinetDepth>[0]) => {
        if (domain.refuseDepthOnce) {
          domain.refuseDepthOnce = false;
          return {
            ok: false,
            design: input.design,
            reason: { code: "UNKNOWN_CABINET_DEPTH", params: {} },
          };
        }
        return actual.setCabinetDepth(input);
      },
    ),
  };
});

vi.mock("@/room/create-design", () => ({
  createDesignCreationAttempt: ({ design }: { design: Design }) => {
    attempts.designs.push(design);
    return {
      run: () => {
        attempts.runs += 1;
        if (attempts.failuresLeft > 0) {
          attempts.failuresLeft -= 1;
          return Promise.reject(new Error("the write failed"));
        }
        return Promise.resolve({ id: "design-0", revision: "1" });
      },
    };
  },
}));

import { generateKitchen } from "@lemnaria/configurator-domain";

import {
  useGeneration,
  usePresetCopy,
  type GenerationRun,
  type PresetCopy,
} from "@/room/use-generation";

import {
  createFakeBodyProbe,
  createFakeProbeFactory,
} from "../support/fake-body-probe";

const NOW = "2026-11-08T10:00:00.000Z";
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3600,
  depthMm: 3000,
  heightMm: 2600,
};

/** Every one of the six differs from the reference kitchen's. */
const SAVED_700: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware.premium",
  cabinetDepthMm: 700,
  finish: freeColourFinish("#336699"),
  handle: "black",
  topRowHandle: "steel",
};
const SAVED_600: NewKitchenSettings = { ...SAVED_700, cabinetDepthMm: 600 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  adapter.built = 0;
  adapter.makeKitThrows = false;
  attempts.designs.length = 0;
  attempts.runs = 0;
  attempts.failuresLeft = 0;
  domain.refuseDepthOnce = false;
  router.push.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mountPresetCopy(
  settings: NewKitchenSettings | undefined,
): () => PresetCopy {
  let latest: PresetCopy | undefined;
  function Probe() {
    latest = usePresetCopy(settings);
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return () => {
    if (latest === undefined) throw new Error("the hook has not rendered");
    return latest;
  };
}

function mountGeneration(
  settings: NewKitchenSettings | undefined,
): () => GenerationRun {
  let latest: GenerationRun | undefined;
  function Probe() {
    latest = useGeneration(settings);
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return () => {
    if (latest === undefined) throw new Error("the hook has not rendered");
    return latest;
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function untilWritten(count: number): Promise<void> {
  for (let tries = 0; tries < 200 && attempts.designs.length < count; tries++) {
    await settle();
  }
  expect(attempts.designs.length).toBeGreaterThanOrEqual(count);
}

function writtenDesign(): Design {
  const [design] = attempts.designs;
  if (design === undefined) throw new Error("nothing was written");
  return design;
}

/** A design of the seeded L kitchen standing at `cabinetDepthMm`, moved there by the editor's own command. */
function presetDesignAt(cabinetDepthMm: number): Design {
  if (cabinetDepthMm === cabinetDepthMmOf(KITCHEN_L_DESIGN)) {
    return KITCHEN_L_DESIGN;
  }
  const moved = setCabinetDepth({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: NOW,
  });
  if (!moved.ok) throw new Error("the seeded kitchen moves to that depth");
  return moved.design;
}

/** The copy as rule 10 and criterion (a) say it: stamped by the commands, then moved by `setCabinetDepth` alone. */
function expectedCopy(
  preset: Design,
  presetId: string,
  settings: NewKitchenSettings,
): Design {
  const fresh: Design = { ...preset, presetId, createdAt: NOW, updatedAt: NOW };
  const stamped = stampedDesignOf(fresh, settings);
  const depthMm = settings.cabinetDepthMm ?? cabinetDepthMmOf(stamped);
  if (depthMm === cabinetDepthMmOf(stamped)) return stamped;
  const moved = setCabinetDepth({
    design: stamped,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: depthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: NOW,
  });
  if (!moved.ok) throw new Error("the stamped copy moves to that depth");
  return moved.design;
}

describe("a preset copy is stamped, then moved to the saved depth by setCabinetDepth alone (criterion (a))", () => {
  it.each([
    ["600 to 700", 600, SAVED_700],
    ["700 to 600", 700, SAVED_600],
  ] as const)(
    "equals setCabinetDepth over the stamped copy for a preset standing at %s",
    async (_, presetDepthMm, saved) => {
      const copy = mountPresetCopy(saved);
      const preset = presetDesignAt(presetDepthMm);

      act(() => {
        copy().select({ presetId: "preset-1", design: preset });
      });
      await untilWritten(1);

      expect(writtenDesign()).toEqual(expectedCopy(preset, "preset-1", saved));
      expect(cabinetDepthMmOf(writtenDesign())).toBe(saved.cabinetDepthMm);
    },
  );

  it("equals it over every partial saved row and every pair of depths, the empty row included", async () => {
    const partialRows = fc.record(
      {
        materialTierId: fc.constantFrom(
          "material.melamine",
          "material.painted-mdf",
          "material.veneer",
        ),
        hardwareTierId: fc.constantFrom(
          "hardware.standard",
          "hardware.premium",
        ),
        cabinetDepthMm: fc.constantFrom(600, 700),
        finish: fc.constantFrom(
          paletteFinish("pal.alb"),
          paletteFinish("veneer.stejar"),
          freeColourFinish("#336699"),
        ),
        handle: fc.constantFrom("steel", "black", "push"),
        topRowHandle: fc.constantFrom("steel", "black", "push"),
      },
      { requiredKeys: [] },
    );
    const presets = [presetDesignAt(600), presetDesignAt(700)] as const;

    await fc.assert(
      fc.asyncProperty(
        partialRows,
        fc.constantFrom(0, 1),
        async (saved: NewKitchenSettings, which: 0 | 1) => {
          attempts.designs.length = 0;
          const preset = presets[which];
          const copy = mountPresetCopy(saved);

          act(() => {
            copy().select({ presetId: "preset-1", design: preset });
          });
          await untilWritten(1);

          expect(writtenDesign()).toEqual(
            expectedCopy(preset, "preset-1", saved),
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("leases no probe and builds no kit when the preset already stands at the saved depth", async () => {
    const copy = mountPresetCopy(SAVED_600);

    act(() => {
      copy().select({ presetId: "preset-1", design: KITCHEN_L_DESIGN });
    });
    await untilWritten(1);

    expect(adapter.built).toBe(0);
    expect(setCabinetDepth).not.toHaveBeenCalled();
    expect(writtenDesign()).toEqual(
      expectedCopy(KITCHEN_L_DESIGN, "preset-1", SAVED_600),
    );
  });

  it("writes the offer as it was, only freshly stamped, when it is handed no settings", async () => {
    const copy = mountPresetCopy(undefined);

    act(() => {
      copy().select({ presetId: "preset-1", design: KITCHEN_L_DESIGN });
    });
    await untilWritten(1);

    expect(writtenDesign()).toEqual({
      ...KITCHEN_L_DESIGN,
      presetId: "preset-1",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
});

describe("a copy is never refused for its depth (rule 5)", () => {
  it("keeps the preset's own depth with the other five stamped when setCabinetDepth refuses, and says nothing failed", async () => {
    domain.refuseDepthOnce = true;
    const copy = mountPresetCopy(SAVED_700);

    act(() => {
      copy().select({ presetId: "preset-1", design: KITCHEN_L_DESIGN });
    });
    await untilWritten(1);

    expect(writtenDesign().settings).toEqual({
      ...SAVED_700,
      cabinetDepthMm: 600,
    });
    expect(writtenDesign().placements).toEqual(KITCHEN_L_DESIGN.placements);
    expect(copy().status).not.toBe("failed");
    expect(attempts.runs).toBe(1);
  });

  it("keeps the preset's own depth when the adapter's chunk fails", async () => {
    adapter.makeKitThrows = true;
    const copy = mountPresetCopy(SAVED_700);

    act(() => {
      copy().select({ presetId: "preset-1", design: KITCHEN_L_DESIGN });
    });
    await untilWritten(1);

    expect(cabinetDepthMmOf(writtenDesign())).toBe(600);
    expect(writtenDesign().settings?.handle).toBe("black");
    expect(copy().status).not.toBe("failed");
  });
});

describe("one attempt per preset, though the depth is moved after an await (rule 11)", () => {
  it("makes one attempt and one write for two taps made before the depth has been moved", async () => {
    const copy = mountPresetCopy(SAVED_700);
    const selection = { presetId: "preset-1", design: KITCHEN_L_DESIGN };

    act(() => {
      copy().select(selection);
      copy().select(selection);
    });
    await untilWritten(1);
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.runs).toBe(1);
  });

  it("asks the same attempt again after a failed write, and builds no second one", async () => {
    attempts.failuresLeft = 1;
    const copy = mountPresetCopy(SAVED_700);
    const selection = { presetId: "preset-1", design: KITCHEN_L_DESIGN };

    act(() => {
      copy().select(selection);
    });
    await untilWritten(1);
    await settle();
    expect(copy().status).toBe("failed");
    act(() => {
      copy().select(selection);
    });
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.runs).toBe(2);
    expect(adapter.built).toBe(1);
  });

  it("writes nothing for a visit left while the depth was being moved", async () => {
    const copy = mountPresetCopy(SAVED_700);

    act(() => {
      copy().select({ presetId: "preset-1", design: KITCHEN_L_DESIGN });
      copy().reset();
    });
    await settle();

    expect(attempts.runs).toBe(0);
  });
});

describe("a generated kitchen is created with the new-kitchen settings (item 3)", () => {
  async function composedWith(
    settings: NewKitchenSettings | undefined,
  ): Promise<Design> {
    attempts.designs.length = 0;
    const run = mountGeneration(settings);
    act(() => {
      run().compose(ROOM);
    });
    await untilWritten(1);
    return writtenDesign();
  }

  it("passes the settings to generateKitchen and stamps all six, the depth natively", async () => {
    const design = await composedWith(SAVED_700);

    expect(generateKitchen).toHaveBeenCalledWith(
      expect.objectContaining({ newKitchenSettings: SAVED_700 }),
    );
    expect(design.settings).toEqual(SAVED_700);
    expect(cabinetDepthMmOf(design)).toBe(700);
  });

  it("makes the reference kitchen when it is handed no settings", async () => {
    const design = await composedWith(undefined);

    expect(design.settings).toEqual({ cabinetDepthMm: 600 });
  });

  it("carries all six keys over every whole row the page can hand it (criterion (b))", async () => {
    const wholeRows = fc.record({
      materialTierId: fc.constantFrom(
        "material.melamine",
        "material.painted-mdf",
        "material.veneer",
      ),
      hardwareTierId: fc.constantFrom("hardware.standard", "hardware.premium"),
      cabinetDepthMm: fc.constantFrom(600, 700),
      finish: fc.constantFrom(
        paletteFinish("pal.alb"),
        paletteFinish("veneer.stejar"),
        freeColourFinish("#336699"),
      ),
      handle: fc.constantFrom("steel", "black", "push"),
      topRowHandle: fc.constantFrom("steel", "black", "push"),
    });

    await fc.assert(
      fc.asyncProperty(wholeRows, async (saved: NewKitchenSettings) => {
        const { settings } = await composedWith(saved);

        for (const key of Object.keys(saved)) {
          expect(settings?.[key as keyof NewKitchenSettings]).toBeDefined();
        }
        expect(cabinetDepthMmOf({ ...KITCHEN_L_DESIGN, settings })).toBe(
          saved.cabinetDepthMm,
        );
      }),
      { numRuns: 6 },
    );
  });
});
