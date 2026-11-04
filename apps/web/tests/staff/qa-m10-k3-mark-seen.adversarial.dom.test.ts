// @vitest-environment happy-dom
//
// Adversarial QA of the mark made on opening a changed kitchen: a hook that is handed another kitchen marks that one, and the
// page that mounts the hook is keyed by the kitchen's id, which is what keeps the hook's once-only guard from outliving
// a kitchen.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import {
  useMarkSeen,
  type SeenMark,
  type SeenMarkSeed,
} from "@/staff/use-mark-seen";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  installStaffKitchensServer,
  staffKitchenIdOf,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

let server: StaffKitchensServer;
let hook: RenderedHook<SeenMark> | undefined;
let seed: SeenMarkSeed;

beforeEach(() => {
  vi.useFakeTimers();
  resetStaffSessionExpiryForTests();
  seed = {
    designId: staffKitchenIdOf(1),
    displayedRevision: "7",
    isChangedAfterSeen: true,
  };
  server = installStaffKitchensServer();
  server.script(() => ({ body: { changedAfterSeen: false } }));
});

afterEach(() => {
  hook?.unmount();
  hook = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe("the mark of a hook handed another kitchen", () => {
  it("sends the new kitchen's own mark, with its own revision, when it is a changed one", async () => {
    hook = renderHook(() => useMarkSeen(seed));
    await settle();

    seed = {
      designId: staffKitchenIdOf(2),
      displayedRevision: "3",
      isChangedAfterSeen: true,
    };
    act(() => {
      hook?.rerender();
    });
    await settle();

    expect(
      server.requests.map(({ url, init }) => [
        url.pathname,
        JSON.parse(init.body as string) as unknown,
      ]),
    ).toEqual([
      [
        `/api/staff/kitchens/${staffKitchenIdOf(1)}/seen`,
        { displayedRevision: "7" },
      ],
      [
        `/api/staff/kitchens/${staffKitchenIdOf(2)}/seen`,
        { displayedRevision: "3" },
      ],
    ]);
  });
});

describe("the page that mounts the hook", () => {
  it("is keyed by the kitchen's id, so a kitchen opened after another is a new mount with a fresh guard", () => {
    const page = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "src",
        "app",
        "[locale]",
        "staff",
        "kitchens",
        "[id]",
        "page.tsx",
      ),
      "utf8",
    );

    expect(page).toMatch(/<StaffKitchenScreen\s+key=\{id\}/u);
  });
});
