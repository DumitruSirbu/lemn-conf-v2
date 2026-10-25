// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4, the request status against the kitchen changing underneath it: what the sentence of a
// conflict promises about the re-read behind it, and which picture of the kitchen wins when a re-read is overtaken by a
// newer save of the page's own.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  chooseOption,
  conflict,
  readsOf,
  routeKitchen,
  statusSaved,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import { wireChangedStatus, wireKitchen } from "../support/staff-kitchen-wire";
import { UNAVAILABLE_ANSWER } from "../support/staff-kitchens-wire";

import {
  setUpScreenHarness,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

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

const copy = roMessages.staffActions;
const lists = roMessages.staffKitchens;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function control(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-status-control"]');
}

function select(): HTMLSelectElement {
  return requireIn<HTMLSelectElement>(control(), "select");
}

function badge(): HTMLElement {
  return requireIn(
    harness.container(),
    '[data-testid="staff-kitchen-status"] [data-kind="status"]',
  );
}

async function saveChoice(value: string): Promise<void> {
  chooseOption(select(), value);
  click(requireIn(control(), "button"));
  await harness.settle();
}

describe("a conflict whose re-read cannot be had", () => {
  it.each([
    ["changed-meanwhile", copy.statusChangedMeanwhile],
    ["not-sent", copy.statusNotSent],
  ])(
    "does not say the kitchen was read again after the 409 %s when the re-read failed and the page still shows the old status",
    async (word, claimsReread) => {
      let reads = 0;
      harness.answers(
        routeKitchen({
          read: () => {
            reads += 1;
            return reads === 1 ? { body: wireKitchen() } : UNAVAILABLE_ANSWER;
          },
          status: () => conflict(word),
        }),
      );
      await harness.mount();

      await saveChoice("contacted");

      expect(readsOf(harness.server)).toHaveLength(2);
      expect(badge().textContent).toBe(lists.statusNew);
      expect(
        requireIn(control(), '[data-tone="warning"]').textContent,
      ).not.toContain(claimsReread);
    },
  );
});

describe("a re-read overtaken by a newer save of the page's own", () => {
  it("does not put the older status back over the one just saved", async () => {
    let writes = 0;
    let reads = 0;
    harness.answers(
      routeKitchen({
        read: () => {
          reads += 1;
          return reads === 1 ? { body: wireKitchen() } : "hold";
        },
        status: () => {
          writes += 1;
          return writes === 1
            ? conflict("changed-meanwhile")
            : statusSaved("contacted");
        },
      }),
    );
    await harness.mount();
    await saveChoice("contacted");
    expect(harness.server.held).toHaveLength(1);

    await saveChoice("contacted");
    expect(badge().textContent).toBe(lists.statusContacted);
    harness.server.held[0]?.answer({
      body: wireKitchen({ status: wireChangedStatus("closed") }),
    });
    await harness.settle();

    expect(writesOf(harness.server)).toHaveLength(2);
    expect(badge().textContent).toBe(lists.statusContacted);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
    ).toHaveLength(1);
  });

  it("asks for the kitchen exactly once for one conflict, however long the page then stays open", async () => {
    harness.answers(
      routeKitchen({
        read: () => ({ body: wireKitchen() }),
        status: () => conflict("changed-meanwhile"),
      }),
    );
    await harness.mount();

    await saveChoice("contacted");
    await harness.pass(24 * 60 * 60 * 1000);

    expect(readsOf(harness.server)).toHaveLength(2);
  });
});
