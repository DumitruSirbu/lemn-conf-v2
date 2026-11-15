// @vitest-environment happy-dom
//
// Adversarial QA of M12 wave W6d at the page: the kitchen page hands the answer's stored cabinet lines to the list, so the
// sent copy's rows draw the stored amounts (ADR 0185 decision 4; plan W6d-1). The implementer's tests drive the list and
// the model with the lines given directly; nothing drove the page, so a page that passed the list no lines at all kept
// every one of them green (mutation W12, QA 2026-11-15).
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { describeLineAmount } from "@/price/starting-price";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import type { StaffShellContext } from "@/staff/staff-shell";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import { installStaffKitchensServer } from "../support/staff-kitchens-wire";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const AMOUNT = '[data-testid="staff-kitchen-cabinet-amount"]';
const FEWER_BODIES = 3;
const PLACEMENTS = (WIRE_DESIGN as { placements: { id: string }[] }).placements;
const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as object),
  placements: PLACEMENTS.slice(0, FEWER_BODIES),
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mountWith(body: unknown): Promise<HTMLElement> {
  installStaffKitchensServer().script((request) =>
    request.url.pathname === KITCHEN_ADDRESS
      ? { body }
      : {
          body: {
            state: "signed-in",
            email: STAFF_ADDRESS,
            capabilities: ["design.read.any", "account.manage.own"],
          },
        },
  );
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale: "ro",
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
    }),
    "ro",
  );
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
  return screen.container;
}

function amountsOn(container: HTMLElement): string[] {
  return allIn(container, AMOUNT).map((amount) => amount.textContent);
}

describe("the kitchen page's cabinet list on the sent copy", () => {
  it("draws the amounts the answer stored for the sent copy's placements, one per stored line, and no zero", async () => {
    const lines = PLACEMENTS.slice(0, FEWER_BODIES).map(({ id }, index) => ({
      placementId: id,
      amountMinor: 987_650_000 + index * 10_000,
    }));

    const container = await mountWith(
      wireKitchen({
        kitchen: { design: WIRE_DESIGN, asSent: FEWER_BODIES_DESIGN },
        sentCabinetLines: lines,
      }),
    );

    expect(amountsOn(container).sort()).toEqual(
      lines.map(({ amountMinor }) => describeLineAmount(amountMinor)).sort(),
    );
    expect(amountsOn(container)).not.toContain("0");
  });

  it("draws the stored amount, not today's, on a kitchen the client has not changed", async () => {
    const first = PLACEMENTS[0];
    if (first === undefined) throw new Error("no body");

    const container = await mountWith(
      wireKitchen({
        sentCabinetLines: [{ placementId: first.id, amountMinor: 987_650_000 }],
      }),
    );

    expect(amountsOn(container)).toEqual([describeLineAmount(987_650_000)]);
  });

  it("draws no amount at all when the answer stored no lines", async () => {
    const container = await mountWith(
      wireKitchen({
        kitchen: { design: WIRE_DESIGN, asSent: FEWER_BODIES_DESIGN },
        sentCabinetLines: [],
      }),
    );

    expect(amountsOn(container)).toEqual([]);
  });

  it("draws a lines member the page cannot fully read for its readable pairs, and refuses an answer with no such member", async () => {
    const first = PLACEMENTS[0];
    if (first === undefined) throw new Error("no body");
    const readable = { placementId: first.id, amountMinor: 123_450_000 };

    const container = await mountWith(
      wireKitchen({
        sentCabinetLines: [
          null,
          { placementId: first.id, amountMinor: "123" },
          { placementId: first.id, amountMinor: -1 },
          readable,
        ],
      }),
    );

    expect(amountsOn(container)).toEqual([describeLineAmount(123_450_000)]);
  });
});
