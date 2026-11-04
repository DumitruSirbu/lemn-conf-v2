// @vitest-environment happy-dom
//
// The guard `qa-m10-u4a-rates.adversarial.dom.test.ts` relies on to stop a save once the person has typed is the late-answer
// guard. With it sabotaged (nobody ever moves on) the same gestures send every write of the save, so the adversarial test of
// that file, which expects one write, is one that can fail; with it as it is, one is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { buttonNamed, settle, typeInField } from "./cabinet-detail-harness";
import {
  HETTICH,
  hardwarePageOf,
  mountHardwareEdit,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const world = vi.hoisted(() => ({ isGuardSabotaged: false }));

vi.mock("@/price-dashboard/use-late-answer-guard", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/price-dashboard/use-late-answer-guard")
    >();
  return {
    useLateAnswerGuard: () => {
      const guard = actual.useLateAnswerGuard();
      return world.isGuardSabotaged
        ? { moveOn: guard.moveOn, begin: () => () => false }
        : guard;
    },
  };
});

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
  world.isGuardSabotaged = false;
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function typeBetweenTwoWrites(): Promise<number> {
  const page = hardwarePageOf();
  const server = inMemoryPriceDraftClient(page.state);
  mounted = await mountHardwareEdit(HETTICH, page, {
    draftClient: server.client,
  });
  const { container } = mounted;
  typeInField(container, roCopy("priceDashboard.hardware.priceHinge"), "100");
  typeInField(container, roCopy("priceDashboard.hardware.priceSlide"), "200");
  typeInField(container, roCopy("priceDashboard.hardware.priceLift"), "700");
  const release = server.holdNextWrite();
  const saving = press(
    buttonNamed(container, roCopy("priceDashboard.common.save")),
  );
  typeInField(container, roCopy("priceDashboard.hardware.pricePush"), "300");
  release();
  await saving;
  await settle();
  return server.calls.filter((call) => call.kind === "change").length;
}

describe("a sabotage of the late-answer guard", () => {
  it("sends the one write that was out and no more while the guard is as it is", async () => {
    expect(await typeBetweenTwoWrites()).toBe(1);
  });

  it("sends every write of the save, typed over or not, once nobody ever moves on", async () => {
    world.isGuardSabotaged = true;

    expect(await typeBetweenTwoWrites()).toBeGreaterThan(1);
  });
});
