// The list's source asks the dashboard's state for a page its staff gate has admitted, and turns it into the page the
// screen is drawn from. Anything that does not make a list is `unavailable`, and no price is claimed.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import {
  readCabinetDetail,
  readCabinetList,
} from "@/price-dashboard/cabinet-list-source";

import roMessages from "../../src/messages/ro.json";
import { stateOf } from "./dashboard-state-fixture";

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

describe("a state the dashboard holds", () => {
  it("is the page: the state as it came, and the catalogue's Romanian name of each cabinet", async () => {
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readCabinetList();

    expect(read).toEqual({
      kind: "ready",
      page: {
        state,
        cabinetNames: expect.objectContaining({
          "base-cabinet": roMessages.catalog.entries["base-cabinet"],
        }) as unknown,
      },
    });
    expect(world.asked).toEqual([[]]);
  });

  it("names every cabinet rule of the book, corners included", async () => {
    world.answer = answerWith(stateOf());

    const read = await readCabinetList();

    expect(
      read.kind === "ready" && Object.keys(read.page.cabinetNames),
    ).toEqual(
      expect.arrayContaining(
        SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.buildId),
      ),
    );
  });
});

describe("anything else is unavailable, and nothing is thrown", () => {
  it("for a dashboard with no active version or a draft that cannot be read: the state is nothing", async () => {
    world.answer = answerWith(undefined);

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });

  it("for a read that throws, as a store that cannot be reached does", async () => {
    world.answer = () => Promise.reject(new Error("the store is down"));

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["null", null],
    ["a string", "state"],
    ["a state with no draft", { active: stateOf().active }],
    ["an active that is not one", { active: 1, draft: stateOf().draft }],
  ])("for %s, which is not a state", async (_name, body) => {
    world.answer = answerWith(body);

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });

  it("for a state whose list cannot be worked out: a book that prices a cabinet the catalogue does not hold", async () => {
    const state = stateOf();
    const [first] = SAMPLE_PRICE_BOOK.cabinetRules;
    world.answer = answerWith({
      ...state,
      active: {
        ...state.active,
        book: {
          ...SAMPLE_PRICE_BOOK,
          cabinetRules: [
            ...SAMPLE_PRICE_BOOK.cabinetRules,
            { ...first, ruleId: "cabinet.stranger", buildId: "stranger" },
          ],
        },
      },
    });

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });
});

describe("one cabinet's page", () => {
  const BASE_CABINET_RULE = "cabinet.base-cabinet";

  it("is the same page as the list's when the book holds the rule, and reads the state without arguments", async () => {
    const state = stateOf();
    world.answer = answerWith(state);

    const read = await readCabinetDetail(BASE_CABINET_RULE);

    expect(read).toEqual({
      kind: "ready",
      page: expect.objectContaining({ state }) as unknown,
    });
    expect(world.asked).toEqual([[]]);
  });

  it("is not-found for a rule the book does not hold, whatever the address says", async () => {
    world.answer = answerWith(stateOf());

    for (const ruleId of [
      "cabinet.stranger",
      "",
      "cabinet.base-cabinet/",
      "__proto__",
      "constructor",
    ]) {
      expect(await readCabinetDetail(ruleId), ruleId).toEqual({
        kind: "not-found",
      });
    }
  });

  it("is unavailable, and not not-found, when the state cannot be had: an unreachable store never reads as an unknown cabinet", async () => {
    world.answer = () => Promise.reject(new Error("the store is down"));

    expect(await readCabinetDetail(BASE_CABINET_RULE)).toEqual({
      kind: "unavailable",
    });
  });

  it("is unavailable for a state that is not one", async () => {
    world.answer = answerWith({ active: 1, draft: stateOf().draft });

    expect(await readCabinetDetail(BASE_CABINET_RULE)).toEqual({
      kind: "unavailable",
    });
  });
});
