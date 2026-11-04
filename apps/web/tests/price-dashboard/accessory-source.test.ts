// The accessory source asks the dashboard's state for a page its staff gate has admitted, and adds what the screens need:
// the name of each cabinet type, the saved defaults a switch-off is judged by and, outside a production build only, invented
// counts of the kitchens that use each built-in accessory. Anything that does not make a page is `unavailable`, and no
// figure is claimed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { SAMPLE_ACCESSORY_USAGE } from "@/price-dashboard/accessory-sample";
import {
  readAccessories,
  readAccessory,
} from "@/price-dashboard/accessory-source";

import {
  accessoryPageOf,
  CREATED,
  CREATED_ACCESSORY,
  DRYING_RACK,
  PUBLISHED,
  PUBLISHED_RULE,
  SINK_COVER,
} from "./accessory-harness";
import { cabinetNamesOf } from "./dashboard-state-fixture";

const world = vi.hoisted(() => ({
  answer: undefined as (() => Promise<unknown>) | undefined,
  asked: [] as unknown[][],
}));

vi.mock("@/lib/server/price-dashboard/price-dashboard-service", () => ({
  PRICE_READ_EVENT: "staff-prices",
  readDashboardStateForAdmittedPage: (...args: unknown[]) => {
    world.asked.push(args);
    if (world.answer === undefined) throw new Error("no answer planned");
    return world.answer();
  },
}));
vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: () => undefined,
}));

const answerWith = (body: unknown) => () => Promise.resolve(body);
const stateOf = (options: Parameters<typeof accessoryPageOf>[0] = {}) =>
  accessoryPageOf(options).state;

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a state the dashboard holds", () => {
  it("is the page: the state as it came, the cabinet types' names, the saved defaults none-saved reads as, and the invented counts of a build that is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readAccessories();

    expect(read).toEqual({
      kind: "ready",
      page: {
        state,
        cabinetNames: cabinetNamesOf(SAMPLE_PRICE_BOOK),
        defaults: {},
        sampleUsage: SAMPLE_ACCESSORY_USAGE,
      },
    });
    expect(world.asked).toEqual([[]]);
  });

  it("hands a production build no count and no defaults, because nothing yet reads either: no figure is made up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readAccessories();

    expect(read).toEqual({
      kind: "ready",
      page: {
        state,
        cabinetNames: cabinetNamesOf(SAMPLE_PRICE_BOOK),
        defaults: undefined,
        sampleUsage: undefined,
      },
    });
  });

  it("counts only the built-in accessories in the invented counts, so a linked accessory is never given a number", () => {
    expect(
      SAMPLE_ACCESSORY_USAGE.flatMap(({ item }) =>
        item.kind === "accessory" ? [item.accessoryId] : [],
      ),
    ).toEqual([SINK_COVER, DRYING_RACK]);
  });
});

describe("anything else is unavailable, and nothing is thrown", () => {
  it("for a dashboard with no active version or a draft that cannot be read", async () => {
    world.answer = answerWith(undefined);

    expect(await readAccessories()).toEqual({ kind: "unavailable" });
  });

  it("for a read that throws, as a store that cannot be reached does", async () => {
    world.answer = () => Promise.reject(new Error("the store is down"));

    expect(await readAccessories()).toEqual({ kind: "unavailable" });
  });

  it("for a draft that does not apply to the book", async () => {
    world.answer = answerWith(
      stateOf({
        changes: [
          {
            address: {
              kind: "accessory",
              accessoryId: "stranger",
              field: "perUnitMinor",
            },
            value: 100,
          },
        ],
      }),
    );

    expect(await readAccessories()).toEqual({ kind: "unavailable" });
  });
});

describe("one accessory's page", () => {
  it.each([SINK_COVER, DRYING_RACK])(
    "is the same page for the built-in %s",
    async (accessoryId) => {
      world.answer = answerWith(stateOf());

      expect((await readAccessory(accessoryId)).kind).toBe("ready");
    },
  );

  it("is the same page for a linked accessory the book holds", async () => {
    world.answer = answerWith(stateOf({ linked: [PUBLISHED_RULE] }));

    expect((await readAccessory(PUBLISHED)).kind).toBe("ready");
  });

  it("is the same page for an accessory only the draft created", async () => {
    world.answer = answerWith(stateOf({ changes: CREATED_ACCESSORY }));

    expect((await readAccessory(CREATED)).kind).toBe("ready");
  });

  it("is not-found for an accessory neither holds, whatever the address says", async () => {
    world.answer = answerWith(stateOf({ linked: [PUBLISHED_RULE] }));

    for (const accessoryId of [
      "stranger",
      "",
      `${PUBLISHED}/`,
      "new",
      "constructor",
      "__proto__",
    ]) {
      expect(await readAccessory(accessoryId), accessoryId).toEqual({
        kind: "not-found",
      });
    }
  });

  it("is unavailable where the state is", async () => {
    world.answer = answerWith(undefined);

    expect(await readAccessory(SINK_COVER)).toEqual({ kind: "unavailable" });
  });
});
