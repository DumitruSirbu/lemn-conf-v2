// @vitest-environment happy-dom
//
// The staff 3D read keeps its answer beside the kitchen and copy it answered: a change of either never shows the
// earlier answer under the new arguments. The server is a stand-in for `fetch`.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import {
  useStaffKitchen3d,
  type StaffKitchen3dReading,
} from "@/staff/use-staff-kitchen-3d";

import { renderHook, type RenderedHook } from "../support/render-hook";
import { WIRE_DESIGN } from "../support/staff-kitchen-wire";
import {
  installStaffKitchensServer,
  staffKitchenIdOf,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const FIRST_ID = staffKitchenIdOf(1);
const SECOND_ID = staffKitchenIdOf(2);
const READY = { body: { design: WIRE_DESIGN, source: "current" } } as const;

type Version = "sent" | "current" | undefined;

let server: StaffKitchensServer;
let hook: RenderedHook<StaffKitchen3dReading> | undefined;
let arguments3d: { designId: string; version: Version };

beforeEach(() => {
  vi.useFakeTimers();
  resetStaffSessionExpiryForTests();
  server = installStaffKitchensServer();
  arguments3d = { designId: FIRST_ID, version: undefined };
});

afterEach(() => {
  hook?.unmount();
  hook = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function mount(): Promise<void> {
  hook = renderHook(() => useStaffKitchen3d(arguments3d));
  await settle();
}

async function changeArgumentsTo(next: typeof arguments3d): Promise<void> {
  arguments3d = next;
  hook?.rerender();
  await settle();
}

function phase(): string {
  return hook?.result.current.state.phase ?? "unmounted";
}

describe("a change of the arguments", () => {
  it("shows loading, not the earlier kitchen, in the render that changes it, and reads the new one", async () => {
    server.script(() => READY);
    await mount();
    expect(phase()).toBe("ready");
    server.script(() => "hold");

    arguments3d = { designId: SECOND_ID, version: undefined };
    hook?.rerender();

    expect(phase()).toBe("loading");
    await settle();
    expect(server.requests.map(({ url }) => url.pathname)).toEqual([
      `/api/staff/kitchens/${FIRST_ID}/3d`,
      `/api/staff/kitchens/${SECOND_ID}/3d`,
    ]);
  });

  it("does the same for the copy, and asks for the new copy", async () => {
    server.script(() => READY);
    await mount();
    server.script(() => "hold");

    await changeArgumentsTo({ designId: FIRST_ID, version: "current" });

    expect(phase()).toBe("loading");
    expect(server.requests.map(({ url }) => url.search)).toEqual([
      "",
      "?version=current",
    ]);
  });

  it("drops an answer to the earlier arguments that arrives after the change", async () => {
    server.honoursAbort = false;
    server.script(() => "hold");
    await mount();
    await changeArgumentsTo({ designId: SECOND_ID, version: undefined });
    const [earlier, later] = server.held;

    earlier?.answer(READY);
    await settle();
    expect(phase()).toBe("loading");

    later?.answer({ status: 404, body: { error: "Design not found" } });
    await settle();
    expect(phase()).toBe("not-found");
  });
});
