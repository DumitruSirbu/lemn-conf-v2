// @vitest-environment happy-dom
// QA of M10 R4b3 rule 11 and rule 5 at the preset copy: a copy that waits for a probe is still one attempt per preset, writes
// nothing for a screen that is gone, never fails for its depth, and gives every kit back. The attempt is replaced by one that
// records the design it was given and how often it ran, as the implementer's own file does.
import {
  KITCHEN_L_DESIGN,
  cabinetDepthMmOf,
  type BodyProbe,
  type Design,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const adapter = vi.hoisted(() => ({
  built: 0,
  disposed: 0,
  probeThrows: false,
}));
const attempts = vi.hoisted(() => ({
  designs: [] as Design[],
  runs: 0,
  failuresLeft: 0,
  runGate: undefined as Promise<void> | undefined,
}));

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
      adapter.built += 1;
      return {
        cabinetDepthMm: options.cabinetDepthMm,
        builders: { "kitchen-l": () => ({}) },
      };
    },
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe => {
      if (adapter.probeThrows) throw new Error("the probe could not be made");
      return createFakeBodyProbe({ cabinetDepthMm: kit.cabinetDepthMm ?? 600 });
    },
    disposeKit: () => {
      adapter.disposed += 1;
    },
  };
});

vi.mock("@/room/create-design", () => ({
  createDesignCreationAttempt: ({ design }: { design: Design }) => {
    attempts.designs.push(design);
    return {
      run: async () => {
        attempts.runs += 1;
        await attempts.runGate;
        if (attempts.failuresLeft > 0) {
          attempts.failuresLeft -= 1;
          throw new Error("the write failed");
        }
        return { id: "design-0", revision: "1" };
      },
    };
  },
}));

import { usePresetCopy, type PresetCopy } from "@/room/use-generation";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const SAVED_700: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware.premium",
  cabinetDepthMm: 700,
  handle: "black",
  topRowHandle: "steel",
};
const SELECTION = { presetId: "preset-1", design: KITCHEN_L_DESIGN } as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  adapter.built = 0;
  adapter.disposed = 0;
  adapter.probeThrows = false;
  attempts.designs.length = 0;
  attempts.runs = 0;
  attempts.failuresLeft = 0;
  attempts.runGate = undefined;
  router.push.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

interface Mounted {
  readonly copy: () => PresetCopy;
  readonly rerender: (settings: NewKitchenSettings | undefined) => void;
  readonly unmount: () => void;
}

function mount(settings: NewKitchenSettings | undefined): Mounted {
  let latest: PresetCopy | undefined;
  function Probe({ current }: { current: NewKitchenSettings | undefined }) {
    latest = usePresetCopy(current);
    return null;
  }
  const render = (current: NewKitchenSettings | undefined) => {
    act(() => {
      root.render(createElement(Probe, { current }));
    });
  };
  render(settings);
  return {
    copy: () => {
      if (latest === undefined) throw new Error("the hook has not rendered");
      return latest;
    },
    rerender: render,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

describe("a screen that is gone while the copy waits for its depth (rule 11)", () => {
  it("begins no write when the screen unmounts between the tap and the move to the saved depth", async () => {
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
    });
    screen.unmount();
    await settle();

    expect(attempts.runs).toBe(0);
  });

  it("begins no write when the visit is reset between the tap and the move to the saved depth", async () => {
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
      screen.copy().reset();
    });
    await settle();

    expect(attempts.runs).toBe(0);
  });
});

describe("one attempt per preset across every way a second tap can arrive (rule 11)", () => {
  it("reuses the attempt when the failure is dismissed and the same preset is asked for again", async () => {
    attempts.failuresLeft = 1;
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();
    expect(screen.copy().status).toBe("failed");
    act(() => {
      screen.copy().dismissFailure();
    });
    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.runs).toBe(2);
    expect(adapter.built).toBe(1);
  });

  it("reuses the attempt when the page re-renders with another settings object between the failure and the retry", async () => {
    attempts.failuresLeft = 1;
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();
    screen.rerender({ ...SAVED_700, handle: "push" });
    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.designs[0]?.settings?.handle).toBe("black");
    expect(attempts.runs).toBe(2);
  });

  it("begins no second attempt for another preset tapped while the first is waiting for its depth", async () => {
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
      screen.copy().select({ presetId: "preset-2", design: KITCHEN_L_DESIGN });
    });
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.designs[0]?.presetId).toBe("preset-1");
  });

  it("copies afresh, as a second attempt, when the visit was reset between two taps on the same preset", async () => {
    const screen = mount(SAVED_700);
    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();
    act(() => {
      screen.copy().reset();
    });

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(attempts.designs).toHaveLength(2);
  });
});

describe("a copy is never refused or failed for its depth, and gives every kit back (rules 5 and 11)", () => {
  it("disposes the kit it built to move the depth", async () => {
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(cabinetDepthMmOf(attempts.designs[0] ?? KITCHEN_L_DESIGN)).toBe(700);
    expect(adapter.built).toBe(1);
    expect(adapter.disposed).toBe(adapter.built);
  });

  it("keeps the preset's depth, stamps the other five, and disposes the kit when the probe cannot be made", async () => {
    adapter.probeThrows = true;
    const screen = mount(SAVED_700);

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(attempts.designs).toHaveLength(1);
    expect(attempts.designs[0]?.settings).toMatchObject({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      handle: "black",
      topRowHandle: "steel",
    });
    expect(screen.copy().status).not.toBe("failed");
    expect(adapter.disposed).toBe(adapter.built);
  });

  it("builds no kit and asks for no probe when the saved depth is the preset's", async () => {
    const screen = mount({ ...SAVED_700, cabinetDepthMm: 600 });

    act(() => {
      screen.copy().select(SELECTION);
    });
    await settle();

    expect(adapter.built).toBe(0);
    expect(attempts.designs).toHaveLength(1);
  });
});
