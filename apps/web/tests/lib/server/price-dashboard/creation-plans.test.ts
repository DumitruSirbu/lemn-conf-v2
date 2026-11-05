import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  hardwareRatesOf,
  readDashboardAuditEntry,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  planAccessoryCreation,
  planHardwareClassCreation,
} from "@/lib/server/price-dashboard/creation-plans";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import type * as DraftPlansModule from "@/lib/server/price-dashboard/draft-plans";
import {
  planChanges,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";

vi.mock("@/lib/server/price-dashboard/draft-plans", async (original) => {
  const real = await original<typeof DraftPlansModule>();
  return { ...real, planChanges: vi.fn(real.planChanges) };
});

beforeEach(() => {
  vi.mocked(planChanges).mockClear();
});

const WORDS = { name: "GTV Economic", description: "Mecanisme simple" };
const RATES = Object.fromEntries(
  HARDWARE_RATE_FIELDS.map((field, index) => [field, 1_000 + index]),
);
const ACCESSORY = {
  linkedBuildId: "base-3drawer",
  perUnitMinor: 1_000,
  name: "Soclu luminos",
};
const STALE_CHANGE: DraftChange = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.no-such-rule",
    field: "anchorMinor",
  },
  value: 1,
};

function stateWith(changes: readonly DraftChange[] = []): ActiveDashboardState {
  return {
    book: SAMPLE_PRICE_BOOK,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
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

describe("the plan of a hardware class", () => {
  it("judges the creation and every rate once, in one call, the creation first", () => {
    planHardwareClassCreation(
      { expectedDraftRevision: "1", value: WORDS, rates: RATES },
      stateWith(),
    );

    expect(planChanges).toHaveBeenCalledTimes(1);
    const [requests] = vi.mocked(planChanges).mock.calls[0] ?? [];
    expect(requests?.map(({ address }) => address.kind)).toEqual([
      "hardware-tier-created",
      ...hardwareRatesOf(SAMPLE_PRICE_BOOK).map(() => "hardware"),
    ]);
  });

  it("writes the creation, then a rate for each field of the active book, under the id it minted", () => {
    const plan = written(
      planHardwareClassCreation(
        { expectedDraftRevision: "1", value: WORDS, rates: RATES },
        stateWith(),
      ),
    );

    const [creation, ...rates] = plan.changes;
    const tierId =
      creation?.address.kind === "hardware-tier-created"
        ? creation.address.tierId
        : undefined;
    expect(creation?.value).toEqual(WORDS);
    expect(rates).toEqual(
      hardwareRatesOf(SAMPLE_PRICE_BOOK).map((field) => ({
        address: { kind: "hardware", tierId, field },
        value: RATES[field],
      })),
    );
  });

  it("names the audit row after the creation, and the row is one the closed reader accepts", () => {
    const plan = written(
      planHardwareClassCreation(
        { expectedDraftRevision: "1", value: WORDS, rates: RATES },
        stateWith(),
      ),
    );

    expect(plan.entry.detail).toMatchObject({
      changeKind: "hardware-tier-created",
      itemKind: "hardware",
    });
    expect(
      readDashboardAuditEntry(plan.entry.action, plan.entry.detail).ok,
    ).toBe(true);
  });

  it("answers the draft the plan makes and the class it created", async () => {
    const plan = written(
      planHardwareClassCreation(
        { expectedDraftRevision: "1", value: WORDS, rates: RATES },
        stateWith(),
      ),
    );

    const answer = plan.answer("2");

    const body = (await answer.json()) as {
      draft: unknown;
      created: { tierId: string };
    };
    expect(body.draft).toEqual({ draftRevision: "2", changes: plan.changes });
    expect(plan.changes[0]?.address).toEqual({
      kind: "hardware-tier-created",
      tierId: body.created.tierId,
    });
  });

  it("names the rate that was refused, not the creation that is left without it", async () => {
    const plan = planHardwareClassCreation(
      {
        expectedDraftRevision: "1",
        value: WORDS,
        rates: { ...RATES, perPushRunnerMinor: 0 },
      },
      stateWith(),
    );

    expect(await refusalOf(plan)).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "ZERO" }],
      },
    });
  });

  it("names the creation's own lack when no rate was refused, only left out", async () => {
    const { perDrawerMinor, ...others } = RATES;
    void perDrawerMinor;

    const plan = planHardwareClassCreation(
      { expectedDraftRevision: "1", value: WORDS, rates: others },
      stateWith(),
    );

    expect(await refusalOf(plan)).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "CREATED_TIER_RATES_MISSING" }],
      },
    });
  });

  it("is made on a draft that holds a change refused already, which a write that adds no refusal may stand beside", () => {
    const plan = planHardwareClassCreation(
      { expectedDraftRevision: "1", value: WORDS, rates: RATES },
      stateWith([STALE_CHANGE]),
    );

    expect(written(plan).changes[0]).toEqual(STALE_CHANGE);
  });
});

describe("the plan of an accessory", () => {
  it("writes the creation after what the draft holds, under the id it minted, and names the audit row after it", () => {
    const plan = written(
      planAccessoryCreation(
        { expectedDraftRevision: "1", value: ACCESSORY },
        stateWith(),
      ),
    );

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]?.address.kind).toBe("accessory-created");
    expect(plan.entry.detail).toMatchObject({
      changeKind: "accessory-created",
      itemKind: "accessory",
    });
    expect(
      readDashboardAuditEntry(plan.entry.action, plan.entry.detail).ok,
    ).toBe(true);
  });

  it("answers the accessory it created", async () => {
    const plan = written(
      planAccessoryCreation(
        { expectedDraftRevision: "1", value: ACCESSORY },
        stateWith(),
      ),
    );

    const body = (await plan.answer("2").json()) as {
      created: { kind: string; accessoryId: string };
    };

    expect(body.created.kind).toBe("accessory");
    expect(plan.changes[0]?.address).toEqual({
      kind: "accessory-created",
      accessoryId: body.created.accessoryId,
    });
  });

  it("is refused with the word alone when the draft beside it makes no book to judge the link in", async () => {
    const plan = planAccessoryCreation(
      { expectedDraftRevision: "1", value: ACCESSORY },
      stateWith([STALE_CHANGE]),
    );

    expect(await refusalOf(plan)).toEqual({
      status: 409,
      body: { status: "candidate-refused" },
    });
  });
});
