// The hardware source asks the dashboard's state for a page its staff gate has admitted, and adds what judging a switch-off
// needs: the saved defaults and, outside a production build only, invented counts of the kitchens that use each class.
// Anything that does not make a page is `unavailable`, and no figure is claimed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readHardware,
  readHardwareClass,
} from "@/price-dashboard/hardware-source";
import { SAMPLE_HARDWARE_USAGE } from "@/price-dashboard/hardware-sample";

import {
  HARDWARE_RATE_FIELDS,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { stateOf } from "./dashboard-state-fixture";

const CREATION_WITH_ITS_RATES: readonly DraftChange[] = [
  {
    address: { kind: "hardware-tier-created", tierId: "hardware.economic" },
    value: { name: "GTV Economic", description: "Pentru oferte economice" },
  },
  ...HARDWARE_RATE_FIELDS.map(
    (field): DraftChange => ({
      address: { kind: "hardware", tierId: "hardware.economic", field },
      value: 2_000,
    }),
  ),
];

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

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a state the dashboard holds", () => {
  it("is the page: the state as it came, the saved defaults none-saved reads as, and the invented counts of a build that is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readHardware();

    expect(read).toEqual({
      kind: "ready",
      page: { state, defaults: {}, sampleUsage: SAMPLE_HARDWARE_USAGE },
    });
    expect(world.asked).toEqual([[]]);
  });

  it("hands a production build no count and no defaults, because nothing yet reads either: no figure is made up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readHardware();

    expect(read).toEqual({
      kind: "ready",
      page: { state, defaults: undefined, sampleUsage: undefined },
    });
  });
});

describe("anything else is unavailable, and nothing is thrown", () => {
  it("for a dashboard with no active version or a draft that cannot be read", async () => {
    world.answer = answerWith(undefined);

    expect(await readHardware()).toEqual({ kind: "unavailable" });
  });

  it("for a read that throws, as a store that cannot be reached does", async () => {
    world.answer = () => Promise.reject(new Error("the store is down"));

    expect(await readHardware()).toEqual({ kind: "unavailable" });
  });

  it("for a draft that does not apply to the book", async () => {
    world.answer = answerWith(
      stateOf([
        {
          address: {
            kind: "hardware",
            tierId: "hardware.stranger",
            field: "perLiftMinor",
          },
          value: 100,
        },
      ]),
    );

    expect(await readHardware()).toEqual({ kind: "unavailable" });
  });
});

describe("one class's page", () => {
  it("is the same page when the book holds the class", async () => {
    world.answer = answerWith(stateOf());

    const read = await readHardwareClass("hardware.soft-close");

    expect(read.kind).toBe("ready");
  });

  it("is the same page for a class only the draft created, with the rate it owes for each the book states", async () => {
    world.answer = answerWith(stateOf(CREATION_WITH_ITS_RATES));

    expect((await readHardwareClass("hardware.economic")).kind).toBe("ready");
  });

  it("is unavailable for a draft whose creation lacks a rate, since the class would be priced at one nobody set", async () => {
    world.answer = answerWith(stateOf(CREATION_WITH_ITS_RATES.slice(0, -1)));

    expect(await readHardwareClass("hardware.economic")).toEqual({
      kind: "unavailable",
    });
  });

  it("is not-found for a class neither holds, whatever the address says", async () => {
    world.answer = answerWith(stateOf());

    for (const tierId of [
      "hardware.stranger",
      "",
      "hardware.soft-close/",
      "new",
    ]) {
      expect(await readHardwareClass(tierId), tierId).toEqual({
        kind: "not-found",
      });
    }
  });

  it("is unavailable where the state is", async () => {
    world.answer = answerWith(undefined);

    expect(await readHardwareClass("hardware.soft-close")).toEqual({
      kind: "unavailable",
    });
  });
});
