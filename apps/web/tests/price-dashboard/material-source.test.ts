// The materials source asks the dashboard's state for a page its staff gate has admitted, and adds what judging a
// switch-off needs: the saved defaults and, outside a production build only, invented counts of the kitchens that use
// each material. Anything that does not make a page is `unavailable`, and no figure is claimed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "@lemnaria/persistence";

import { readMaterial, readMaterials } from "@/price-dashboard/material-source";
import { SAMPLE_MATERIAL_USAGE } from "@/price-dashboard/material-sample";
import { surchargeAddressOf } from "@/price-dashboard/material-model";

import { stateOf } from "./dashboard-state-fixture";
import { MDF, PAL, VENEER } from "./material-harness";

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

    const read = await readMaterials();

    expect(read).toEqual({
      kind: "ready",
      page: { state, defaults: {}, sampleUsage: SAMPLE_MATERIAL_USAGE },
    });
    expect(world.asked).toEqual([[]]);
  });

  it("hands a production build no count and no defaults, because nothing yet reads either: no figure is made up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readMaterials();

    expect(read).toEqual({
      kind: "ready",
      page: { state, defaults: undefined, sampleUsage: undefined },
    });
  });
});

describe("the invented counts", () => {
  it("give each material of the sample book exactly one count, as the usage reader owes", () => {
    expect(
      SAMPLE_MATERIAL_USAGE.map(({ item }) =>
        item.kind === "material" ? item.tierId : item.kind,
      ),
    ).toEqual([PAL, MDF, VENEER]);
  });
});

describe("anything else is unavailable, and nothing is thrown", () => {
  it("for a dashboard with no active version or a draft that cannot be read", async () => {
    world.answer = answerWith(undefined);

    expect(await readMaterials()).toEqual({ kind: "unavailable" });
  });

  it("for a read that throws, as a store that cannot be reached does", async () => {
    world.answer = () =>
      Promise.reject(
        new DashboardStoreError("read the price draft", "unavailable"),
      );

    expect(await readMaterials()).toEqual({ kind: "unavailable" });
  });

  it("for a draft that does not apply to the book", async () => {
    world.answer = answerWith(
      stateOf([{ address: surchargeAddressOf(PAL), value: 10 }]),
    );

    expect(await readMaterials()).toEqual({ kind: "unavailable" });
  });
});

describe("one material's page", () => {
  it("is the same page when the book holds the material", async () => {
    world.answer = answerWith(stateOf());

    expect((await readMaterial(MDF)).kind).toBe("ready");
  });

  it("is not-found for a material the book does not hold, whatever the address says", async () => {
    world.answer = answerWith(stateOf());

    for (const tierId of ["material.stranger", "", `${MDF}/`, "new"]) {
      expect(await readMaterial(tierId), tierId).toEqual({
        kind: "not-found",
      });
    }
  });

  it("is unavailable where the state is", async () => {
    world.answer = answerWith(undefined);

    expect(await readMaterial(MDF)).toEqual({ kind: "unavailable" });
  });
});
