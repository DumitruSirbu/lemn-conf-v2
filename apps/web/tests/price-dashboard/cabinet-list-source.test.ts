// The list's source asks the dashboard's own read, the answer `GET /api/staff/prices` gives, and turns it into the page the
// screen is drawn from. Everything but a `200` that makes a list is `unavailable`: until the real stores exist the read
// answers `503`, and no price is claimed.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";

import roMessages from "../../src/messages/ro.json";
import { stateOf } from "./dashboard-state-fixture";

const world = vi.hoisted(() => ({
  answer: undefined as (() => Promise<Response>) | undefined,
  asked: [] as unknown[],
}));

vi.mock("@/lib/server/price-dashboard/price-dashboard-service", () => ({
  PRICE_READ_EVENT: "staff-prices",
  readDashboardForStaff: (request: unknown) => {
    world.asked.push(request);
    if (world.answer === undefined) throw new Error("no answer planned");
    return world.answer();
  },
}));
vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: () => undefined,
}));

const REQUEST = {
  cookies: { get: () => undefined },
  headers: { get: () => null },
};

const answerWith = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );

beforeEach(() => {
  world.answer = undefined;
  world.asked = [];
});

describe("a 200 that holds the dashboard's state", () => {
  it("is the page: the state as it came, and the catalogue's Romanian name of each cabinet", async () => {
    const state = stateOf();
    world.answer = answerWith(200, state);

    const read = await readCabinetList(REQUEST);

    expect(read).toEqual({
      kind: "ready",
      page: {
        state,
        cabinetNames: expect.objectContaining({
          "base-cabinet": roMessages.catalog.entries["base-cabinet"],
        }) as unknown,
      },
    });
    expect(world.asked).toEqual([REQUEST]);
  });

  it("names every cabinet rule of the book, corners included", async () => {
    world.answer = answerWith(200, stateOf());

    const read = await readCabinetList(REQUEST);

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
  it.each([
    [401, { status: "unauthenticated" }],
    [403, undefined],
    [409, { status: "no-active-version" }],
    [409, { status: "draft-unreadable", draftRevision: "1" }],
    [429, undefined],
    [503, undefined],
  ])("for the answer %i", async (status, body) => {
    world.answer = answerWith(status, body);

    expect(await readCabinetList(REQUEST)).toEqual({ kind: "unavailable" });
  });

  it("for a read that throws, as a store that cannot be reached does", async () => {
    world.answer = () => Promise.reject(new Error("the store is down"));

    expect(await readCabinetList(REQUEST)).toEqual({ kind: "unavailable" });
  });

  it.each([
    [
      "a body that is not JSON",
      () => Promise.resolve(new Response("<html>", { status: 200 })),
    ],
    ["a body that is not a state", answerWith(200, { active: 1 })],
  ])("for %s", async (_name, answer) => {
    world.answer = answer;

    expect(await readCabinetList(REQUEST)).toEqual({ kind: "unavailable" });
  });

  it("for a state whose list cannot be worked out: a book that prices a cabinet the catalogue does not hold", async () => {
    const state = stateOf();
    const [first] = SAMPLE_PRICE_BOOK.cabinetRules;
    world.answer = answerWith(200, {
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

    expect(await readCabinetList(REQUEST)).toEqual({ kind: "unavailable" });
  });
});
