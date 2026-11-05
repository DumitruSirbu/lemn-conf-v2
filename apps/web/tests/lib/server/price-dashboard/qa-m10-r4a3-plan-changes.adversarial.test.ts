import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges as applyChangesOfDomain,
  hardwareRatesOf,
  isSameAddress,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import {
  planChanges,
  type DraftPlan,
  type PutRequest,
} from "@/lib/server/price-dashboard/draft-plans";
import type { RevertAddress } from "@/lib/server/price-dashboard/draft-requests";

const applyCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const domain =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...domain,
    applyChanges: (...args: Parameters<typeof domain.applyChanges>) => {
      applyCalls.count += 1;
      return domain.applyChanges(...args);
    },
  };
});

beforeEach(() => {
  applyCalls.count = 0;
});

const CLASS_ID = "hardware.economic";
const CLASS = { kind: "hardware", tierId: CLASS_ID } as const;
const RATES = hardwareRatesOf(SAMPLE_PRICE_BOOK);

const CREATION_ADDRESS = {
  kind: "hardware-tier-created",
  tierId: CLASS_ID,
} as const;
const NAME_ADDRESS = {
  kind: "created-row-text",
  item: CLASS,
  field: "name",
} as const;
const DESCRIPTION_ADDRESS = { ...NAME_ADDRESS, field: "description" } as const;

function rateRequests(value = 2_000): PutRequest[] {
  return RATES.map((field) => ({
    address: { kind: "hardware", tierId: CLASS_ID, field },
    value,
  }));
}

const CREATION: PutRequest = {
  address: CREATION_ADDRESS,
  value: { name: "GTV Economic", description: "" },
};
const DEPTH: PutRequest = { address: { kind: "depth-rule" }, value: 9 };
const PROVISIONAL: PutRequest = {
  address: { kind: "provisional" },
  value: true,
};

function asChanges(requests: readonly PutRequest[]): DraftChange[] {
  return requests.map(
    ({ address, value }) => ({ address, value }) as DraftChange,
  );
}

function stateWith(changes: readonly DraftChange[]): ActiveDashboardState {
  return {
    book: SAMPLE_PRICE_BOOK,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
}

function oneOrMore(requests: readonly PutRequest[]) {
  const [first, ...rest] = requests;
  if (first === undefined) throw new Error("no request");
  return [first, ...rest] as const;
}

function written(plan: DraftPlan) {
  if (plan.kind !== "write") throw new Error("the plan was refused");
  return plan;
}

async function refusalOf(plan: DraftPlan) {
  if (plan.kind !== "refused") throw new Error("the plan was a write");
  return {
    status: plan.response.status,
    body: (await plan.response.json()) as unknown,
  };
}

function invalid(code: string) {
  return {
    status: 400,
    body: { status: "invalid-input", issues: [{ field: "change", code }] },
  };
}

describe("several changes in one write are judged once", () => {
  it("asks the domain once for a write that applies", () => {
    const requests = [CREATION, ...rateRequests(), DEPTH];

    const plan = planChanges(oneOrMore(requests), stateWith([]));

    expect(written(plan).changes).toEqual(asChanges(requests));
    expect(applyCalls.count).toBe(1);
  });

  it("asks the domain once for a write with a refusal in its middle, and writes none of it", async () => {
    const requests: PutRequest[] = [
      DEPTH,
      { address: NAME_ADDRESS, value: "GTV 500 lei" },
      PROVISIONAL,
    ];
    const created = [...asChanges([CREATION, ...rateRequests()])];

    const plan = planChanges(oneOrMore(requests), stateWith(created));

    expect(await refusalOf(plan)).toEqual(invalid("TEXT_STATES_AN_AMOUNT"));
    expect(applyCalls.count).toBe(1);
  });

  it("refuses the whole write when the last of its changes is the refused one", async () => {
    const requests: PutRequest[] = [
      DEPTH,
      PROVISIONAL,
      { address: DESCRIPTION_ADDRESS, value: "Montaj inclus" },
    ];

    const plan = planChanges(
      oneOrMore(requests),
      stateWith(asChanges([CREATION, ...rateRequests()])),
    );

    expect(await refusalOf(plan)).toEqual(invalid("TEXT_STATES_AN_AMOUNT"));
  });

  it("refuses the whole write when the first of its changes is the refused one", async () => {
    const requests: PutRequest[] = [
      { address: NAME_ADDRESS, value: "" },
      DEPTH,
    ];

    const plan = planChanges(
      oneOrMore(requests),
      stateWith(asChanges([CREATION, ...rateRequests()])),
    );

    expect(await refusalOf(plan)).toEqual(invalid("TEXT_EMPTY"));
  });

  it("names the code of the first refused change in the draft when two are refused", async () => {
    const requests: PutRequest[] = [
      { address: NAME_ADDRESS, value: "GTV 500 lei" },
      { address: DESCRIPTION_ADDRESS, value: "x‮y" },
    ];

    const plan = planChanges(
      oneOrMore(requests),
      stateWith(asChanges([CREATION, ...rateRequests()])),
    );

    expect(await refusalOf(plan)).toEqual(invalid("TEXT_STATES_AN_AMOUNT"));
    expect(applyCalls.count).toBe(1);
  });

  it("names the first change in the audit row, whichever the draft holds first", () => {
    const requests = [DEPTH, PROVISIONAL];

    const plan = written(planChanges(oneOrMore(requests), stateWith([])));

    expect(plan.entry).toEqual({
      action: "price-draft-changed",
      detail: { changeKind: "depth-rule" },
    });
  });
});

describe("a creation put with its rates in one write", () => {
  it("is refused for the rates it owes when it comes alone", async () => {
    const plan = planChanges(oneOrMore([CREATION]), stateWith([]));

    expect(await refusalOf(plan)).toEqual(
      invalid("CREATED_TIER_RATES_MISSING"),
    );
  });

  it("is refused when one of the rates is left out", async () => {
    const requests = [CREATION, ...rateRequests().slice(1)];

    const plan = planChanges(oneOrMore(requests), stateWith([]));

    expect(await refusalOf(plan)).toEqual(
      invalid("CREATED_TIER_RATES_MISSING"),
    );
  });

  it("is written whole when every rate comes with it, however the rates are ordered", () => {
    const requests = [CREATION, ...rateRequests().reverse()];

    const plan = written(planChanges(oneOrMore(requests), stateWith([])));

    expect(plan.changes).toEqual(asChanges(requests));
  });

  it("is refused when a rate is listed before the creation it depends on", async () => {
    const [firstRate, ...otherRates] = rateRequests();
    if (firstRate === undefined) throw new Error("no rate");
    const requests = [firstRate, CREATION, ...otherRates];

    const plan = planChanges(oneOrMore(requests), stateWith([]));

    expect(await refusalOf(plan)).toEqual(invalid("UNKNOWN_ITEM"));
  });

  it("keeps the place of a creation put again in the same write as its rates, and every rate after it", () => {
    const stored = asChanges([DEPTH, CREATION, ...rateRequests(), PROVISIONAL]);
    const revised: PutRequest = {
      address: CREATION_ADDRESS,
      value: { name: "GTV Plus", description: "Nou" },
    };

    const plan = written(
      planChanges(
        oneOrMore([revised, ...rateRequests(3_000)]),
        stateWith(stored),
      ),
    );

    const creationIndex = plan.changes.findIndex(({ address }) =>
      isSameAddress(address, CREATION_ADDRESS),
    );
    expect(creationIndex).toBe(1);
    expect(plan.changes[creationIndex]?.value).toEqual(revised.value);
    plan.changes.forEach(({ address }, index) => {
      if (address.kind === "hardware") {
        expect(index).toBeGreaterThan(creationIndex);
      }
    });
    expect(plan.changes).toHaveLength(stored.length);
    expect(applyChangesOfDomain(SAMPLE_PRICE_BOOK, plan.changes).ok).toBe(true);
  });
});

describe("two changes of one address in one write", () => {
  it("keep only the later, which goes last", () => {
    const requests: PutRequest[] = [
      { address: NAME_ADDRESS, value: "Primul" },
      DEPTH,
      { address: NAME_ADDRESS, value: "Al doilea" },
    ];

    const plan = written(
      planChanges(
        oneOrMore(requests),
        stateWith(asChanges([CREATION, ...rateRequests()])),
      ),
    );

    const renames = plan.changes.filter(({ address }) =>
      isSameAddress(address, NAME_ADDRESS),
    );
    expect(renames).toEqual([{ address: NAME_ADDRESS, value: "Al doilea" }]);
    expect(plan.changes.at(-1)).toEqual({
      address: NAME_ADDRESS,
      value: "Al doilea",
    });
  });

  it("are judged by the later value, so a refused earlier one is not what refuses the write", () => {
    const requests: PutRequest[] = [
      { address: NAME_ADDRESS, value: "GTV 500 lei" },
      { address: NAME_ADDRESS, value: "GTV Max" },
    ];

    const plan = planChanges(
      oneOrMore(requests),
      stateWith(asChanges([CREATION, ...rateRequests()])),
    );

    expect(plan.kind).toBe("write");
  });
});

describe("a write beside a draft that was already refusing", () => {
  const STALE: PutRequest = {
    address: { kind: "hardware", tierId: "hardware.ghost", field: RATES[0] },
    value: 100,
  } as unknown as PutRequest;

  it("is allowed when every change it puts applies, and the stale change stays", () => {
    const stored = asChanges([STALE, DEPTH]);

    const plan = written(
      planChanges(oneOrMore([PROVISIONAL]), stateWith(stored)),
    );

    expect(plan.changes).toEqual([
      ...asChanges([STALE, DEPTH]),
      ...asChanges([PROVISIONAL]),
    ]);
    expect(applyCalls.count).toBe(2);
  });

  it("is refused for its own change, not for the stale one, when it adds a refusal", async () => {
    const stored = asChanges([STALE, DEPTH]);

    const plan = planChanges(
      oneOrMore([{ address: NAME_ADDRESS, value: "x" }]),
      stateWith(stored),
    );

    expect(await refusalOf(plan)).toEqual(invalid("UNKNOWN_ITEM"));
  });

  it("does not take a stale change after a re-put creation for the re-put's own refusal", () => {
    const stored = asChanges([CREATION, ...rateRequests(), STALE]);
    const revised: PutRequest = {
      address: CREATION_ADDRESS,
      value: { name: "GTV Plus", description: "Nou" },
    };

    const plan = planChanges(oneOrMore([revised]), stateWith(stored));

    expect(plan.kind).toBe("write");
  });
});

describe("what planChanges takes as an address", () => {
  it("writes the address as sent and not a copy keyed another way", () => {
    const address: RevertAddress = NAME_ADDRESS;

    const plan = written(
      planChanges(
        oneOrMore([{ address, value: "Alt nume" }]),
        stateWith(asChanges([CREATION, ...rateRequests()])),
      ),
    );

    expect(plan.changes.at(-1)?.address).toBe(address);
  });
});
