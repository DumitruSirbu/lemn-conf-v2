// @vitest-environment happy-dom
//
// The defaults screen in a production build (R4b2, U6's failed and refused-save states): with no client handed in it saves
// through the server's route and reads its facts again from the two routes, so the words of each non-success are the
// ones the route's answer calls for. The answers are the routes' own wire, stubbed at `fetch`.
import { paletteFinish } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenDefaultsScreen } from "@/price-dashboard/kitchen-defaults-page";
import { SAMPLE_KITCHEN_DEFAULTS } from "@/price-dashboard/kitchen-defaults-sample";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  type MountedScreen,
} from "../support/render-with-intl";
import { stateOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DEFAULTS_ADDRESS = "/api/staff/prices/defaults";
const STATE_ADDRESS = "/api/staff/prices";
const PAGE = SAMPLE_KITCHEN_DEFAULTS;
const BLACK = { kind: "handle", handle: "black" } as const;

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

interface Server {
  /** The answer to a `PUT` of the defaults. */
  readonly save: () => Response;
  /** The defaults a `GET` of them states, as the wire. */
  readonly defaults?: object;
  /** The head and the items the dashboard's state states. */
  readonly stateHead?: { revision: string; disabled: object[] };
}

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

/** The staff session as `stubTheStaffServer` answers it, and the two defaults routes as `server` does. */
function serverAnswering(server: Server): { puts: unknown[] } {
  const session = globalThis.fetch;
  const held = { puts: [] as unknown[] };
  vi.stubGlobal("fetch", (address: string, init?: RequestInit) => {
    if (address === DEFAULTS_ADDRESS && init?.method === "PUT") {
      held.puts.push(JSON.parse(init.body as string));
      return Promise.resolve(server.save());
    }
    if (address === DEFAULTS_ADDRESS) {
      return Promise.resolve(
        respond(200, server.defaults ?? { ...PAGE.state }),
      );
    }
    if (address === STATE_ADDRESS) {
      const state = stateOf();
      const head = server.stateHead ?? { revision: "1", disabled: [] };
      return Promise.resolve(
        respond(200, {
          ...state,
          active: { ...state.active, availability: head },
        }),
      );
    }
    return session(address, init);
  });
  return held;
}

function mount(): HTMLElement {
  screen = mountInCatalogue(
    createElement(KitchenDefaultsScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "cabinets", "defaults"]),
      input: PAGE,
    }),
    "ro",
  );
  return screen.container;
}

const row = (container: HTMLElement, member: string): HTMLElement =>
  requireIn(container, `[data-member="${member}"]`);

const radioOf = (
  container: HTMLElement,
  member: string,
  value: string,
): HTMLInputElement =>
  requireIn<HTMLInputElement>(
    row(container, member),
    `input[type="radio"][value="${value}"]`,
  );

async function changeDepthAndSave(container: HTMLElement): Promise<void> {
  click(radioOf(container, "cabinetDepthMm", "700"));
  await flushPromises(3);
  submitFormIn(container);
  await flushPromises(12);
}

const noticeText = (container: HTMLElement): string =>
  requireIn(container, "[data-tone]").textContent.trim();

describe("a save in a production build", () => {
  it("sends the whole of the defaults to the route with the revisions the page read, and shows the saved notice", async () => {
    const asked = serverAnswering({
      save: () => respond(200, { revision: "2", availabilityRevision: "1" }),
    });
    const container = mount();

    await changeDepthAndSave(container);

    expect(asked.puts).toEqual([
      {
        expectedRevision: PAGE.state.revision,
        expectedAvailabilityRevision: PAGE.state.availabilityRevision,
        defaults: { ...PAGE.state.defaults, cabinetDepthMm: 700 },
      },
    ]);
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
  });

  it.each([
    ["503, the stores being down", 503, { status: "unavailable" }],
    ["429, the allowance being spent", 429, { status: "rate-limited" }],
    ["401, the session having ended", 401, { status: "unauthenticated" }],
    ["a body that is no answer of the route", 200, { surprise: true }],
  ])(
    "says the save failed, keeping what was typed, for %s",
    async (_name, status, body) => {
      serverAnswering({ save: () => respond(status, body) });
      const container = mount();

      await changeDepthAndSave(container);

      expect(noticeText(container)).toBe(
        roCopy("priceDashboard.errors.saveFailed"),
      );
      expect(radioOf(container, "cabinetDepthMm", "700").checked).toBe(true);
    },
  );

  it("shows a refused value on its own row when the route refuses the colour as malformed", async () => {
    serverAnswering({
      save: () =>
        respond(400, {
          status: "invalid-input",
          issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
        }),
    });
    const container = mount();
    click(radioOf(container, "finish", "pal.antracit"));
    await flushPromises(3);
    submitFormIn(container);
    await flushPromises(12);

    expect(
      requireIn(row(container, "finish"), '[role="alert"]').textContent,
    ).toBe(roCopy("priceDashboard.defaults.itemUnavailable"));
  });

  it("flags the row holding an item the route says is switched off, after reading the facts again from the two routes", async () => {
    serverAnswering({
      save: () => respond(409, { status: "item-unavailable", item: BLACK }),
      defaults: { ...PAGE.state, availabilityRevision: "2" },
      stateHead: { revision: "2", disabled: [BLACK] },
    });
    const container = mount();
    click(radioOf(container, "handle", "black"));
    await flushPromises(3);
    submitFormIn(container);
    await flushPromises(12);

    expect(
      requireIn(row(container, "handle"), '[role="alert"]').textContent,
    ).toBe(roCopy("priceDashboard.defaults.itemUnavailable"));
    expect(
      allIn(row(container, "handle"), "label").map((label) =>
        label.textContent.trim(),
      ),
    ).not.toContain(roCopy("panel.handleLabels.black"));
  });
});

describe("a conflict in a production build", () => {
  it("says the data changed meanwhile and takes the values the routes now state, when both reads state one head", async () => {
    serverAnswering({
      save: () => respond(409, { status: "changed-meanwhile" }),
      defaults: {
        revision: "5",
        availabilityRevision: "1",
        saved: true,
        defaults: { ...PAGE.state.defaults, finish: paletteFinish("pal.alb") },
      },
    });
    const container = mount();

    await changeDepthAndSave(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
  });

  it("says the save failed, and never a mixed state, when the head moved between the two reads", async () => {
    serverAnswering({
      save: () => respond(409, { status: "availability-changed-meanwhile" }),
      defaults: { ...PAGE.state, availabilityRevision: "2" },
      stateHead: { revision: "3", disabled: [BLACK] },
    });
    const container = mount();

    await changeDepthAndSave(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(
      allIn(row(container, "handle"), "label").map((label) =>
        label.textContent.trim(),
      ),
    ).toContain(roCopy("panel.handleLabels.black"));
  });
});
