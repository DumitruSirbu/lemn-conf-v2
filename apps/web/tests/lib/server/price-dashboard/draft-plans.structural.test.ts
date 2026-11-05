import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  hardwareRatesOf,
  readDashboardAuditEntry,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import {
  planChange,
  planRevert,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";
import type { RevertAddress } from "@/lib/server/price-dashboard/draft-requests";

const TIER_ID = "hardware.economic";
const TIER = { kind: "hardware", tierId: TIER_ID } as const;
const PLINTH = { kind: "accessory", accessoryId: "plinth-light" } as const;

const TIER_CREATION: DraftChange = {
  address: { kind: "hardware-tier-created", tierId: TIER_ID },
  value: { name: "GTV Economic", description: "" },
};
const RATES: readonly DraftChange[] = hardwareRatesOf(SAMPLE_PRICE_BOOK).map(
  (field) => ({
    address: { kind: "hardware", tierId: TIER_ID, field },
    value: 2_000,
  }),
);
const NAME_ADDRESS = {
  kind: "created-row-text",
  item: TIER,
  field: "name",
} as const;
const RENAME: DraftChange = { address: NAME_ADDRESS, value: "GTV Premium" };
const DESCRIPTION: DraftChange = {
  address: { kind: "created-row-text", item: TIER, field: "description" },
  value: "Mecanisme simple",
};
const CABINET_PRICE: DraftChange = {
  address: { kind: "depth-rule" },
  value: 5,
};
const PLINTH_CREATION: DraftChange = {
  address: { kind: "accessory-created", accessoryId: PLINTH.accessoryId },
  value: {
    linkedBuildId: "base-3drawer",
    perUnitMinor: 1_000,
    name: "Soclu luminos",
  },
};
const PLINTH_NAME: DraftChange = {
  address: { kind: "created-row-text", item: PLINTH, field: "name" },
  value: "Soclu cu LED",
};

const CREATED_CLASS: readonly DraftChange[] = [TIER_CREATION, ...RATES];

function stateWith(changes: readonly DraftChange[]): ActiveDashboardState {
  return {
    book: SAMPLE_PRICE_BOOK,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
}

function changeRequest(address: RevertAddress, value: unknown) {
  return { address, value };
}

function addressOf(change: DraftChange): RevertAddress {
  return change.address as RevertAddress;
}

function requestOf(change: DraftChange) {
  return changeRequest(addressOf(change), change.value);
}

function written(plan: DraftPlan) {
  if (plan.kind !== "write") throw new Error("the plan was refused");
  return plan;
}

async function refusalOf(plan: DraftPlan) {
  if (plan.kind !== "refused") throw new Error("the plan was a write");
  const body: unknown = await plan.response.json();
  return { status: plan.response.status, body };
}

function issueOf(code: string) {
  return {
    status: 400,
    body: { status: "invalid-input", issues: [{ field: "change", code }] },
  };
}

describe("a rename of a created row", () => {
  it("is written after the creation and its rates, with an audit row naming the row and the field and not the words", () => {
    const plan = planChange(
      changeRequest(NAME_ADDRESS, "GTV Premium"),
      stateWith(CREATED_CLASS),
    );

    expect(written(plan).changes).toEqual([...CREATED_CLASS, RENAME]);
    expect(written(plan).entry).toEqual({
      action: "price-draft-changed",
      detail: {
        changeKind: "created-row-text",
        itemKind: "hardware",
        itemId: TIER_ID,
        field: "name",
      },
    });
  });

  it("replaces the earlier rename of the same words and goes last", () => {
    const stored = [...CREATED_CLASS, RENAME, DESCRIPTION];

    const plan = planChange(
      changeRequest(NAME_ADDRESS, "GTV Max"),
      stateWith(stored),
    );

    expect(written(plan).changes).toEqual([
      ...CREATED_CLASS,
      DESCRIPTION,
      { address: NAME_ADDRESS, value: "GTV Max" },
    ]);
  });

  it("is judged by the domain's text rule: a name that states an amount is refused with the rule's own code", async () => {
    const plan = planChange(
      changeRequest(NAME_ADDRESS, "GTV 500 lei"),
      stateWith(CREATED_CLASS),
    );

    expect(await refusalOf(plan)).toEqual(issueOf("TEXT_STATES_AN_AMOUNT"));
  });

  it.each([
    ["an empty name", "   ", "TEXT_EMPTY"],
    ["a name past the bound", "x".repeat(500), "TEXT_TOO_LONG"],
    ["a name with a line break", "GTV\nPremium", "TEXT_FORBIDDEN_CHARACTER"],
    [
      "a name that is not in composed form",
      "Cafe\u0301",
      "TEXT_FORBIDDEN_CHARACTER",
    ],
    [
      "a name with a direction override",
      "GTV \u202Epremium",
      "TEXT_FORBIDDEN_CHARACTER",
    ],
    [
      "a name with a control character",
      "GTV\u0007",
      "TEXT_FORBIDDEN_CHARACTER",
    ],
    ["a name that is not text", 12, "MISSING_VALUE"],
  ])("refuses %s", async (_name, value, code) => {
    const plan = planChange(
      changeRequest(NAME_ADDRESS, value),
      stateWith(CREATED_CLASS),
    );

    expect(await refusalOf(plan)).toEqual(issueOf(code));
  });

  it("may leave a description empty, which a name may not", () => {
    const address = addressOf(DESCRIPTION);

    const plan = planChange(
      changeRequest(address, ""),
      stateWith(CREATED_CLASS),
    );

    expect(written(plan).changes.at(-1)?.value).toBe("");
  });

  it("is refused for a class the draft does not create", async () => {
    const plan = planChange(
      changeRequest(NAME_ADDRESS, "GTV Premium"),
      stateWith([]),
    );

    expect(await refusalOf(plan)).toEqual(issueOf("UNKNOWN_ITEM"));
  });

  it("is refused for a class the book states with catalogue words", async () => {
    const keyed = SAMPLE_PRICE_BOOK.hardware.tiers.find(
      (tier) => tier.nameKey !== undefined,
    );
    if (keyed === undefined)
      throw new Error("the sample states no keyed class");
    const address: RevertAddress = {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: keyed.tierId },
      field: "name",
    };

    const plan = planChange(changeRequest(address, "Another"), stateWith([]));

    expect(await refusalOf(plan)).toEqual(issueOf("NOT_EDITABLE"));
  });
});

describe("the audit rows of the structural writes", () => {
  it("are rows the audit log accepts: a rename, and the revert of a class that removes its rates and words too", () => {
    const rename = written(
      planChange(requestOf(RENAME), stateWith(CREATED_CLASS)),
    ).entry;
    const reverted = written(
      planRevert(
        {
          expectedDraftRevision: "1",
          target: { kind: "change", address: addressOf(TIER_CREATION) },
        },
        stateWith([...CREATED_CLASS, RENAME]),
      ),
    ).entry;

    expect(readDashboardAuditEntry(rename.action, rename.detail).ok).toBe(true);
    expect(readDashboardAuditEntry(reverted.action, reverted.detail).ok).toBe(
      true,
    );
  });
});

describe("a creation put again", () => {
  const REVISED: DraftChange = {
    address: TIER_CREATION.address,
    value: { name: "GTV Plus", description: "Nou" },
  };

  it("replaces the creation where it stands, so its rates and words keep standing after it", () => {
    const stored = [CABINET_PRICE, ...CREATED_CLASS, RENAME];

    const plan = planChange(requestOf(REVISED), stateWith(stored));

    expect(written(plan).changes).toEqual([
      CABINET_PRICE,
      REVISED,
      ...RATES,
      RENAME,
    ]);
  });

  it("never appends a second creation behind its dependants", () => {
    const stored = [...CREATED_CLASS, RENAME];

    const { changes } = written(
      planChange(requestOf(REVISED), stateWith(stored)),
    );

    const creations = changes.filter(
      ({ address }) => address.kind === "hardware-tier-created",
    );
    expect(creations).toEqual([REVISED]);
    expect(changes).toHaveLength(stored.length);
  });

  it("is appended, like a creation of an accessory, when the draft holds none at that address", () => {
    const plan = planChange(
      requestOf(PLINTH_CREATION),
      stateWith([CABINET_PRICE]),
    );

    expect(written(plan).changes).toEqual([CABINET_PRICE, PLINTH_CREATION]);
  });

  it("leaves every other change moving to the end when put again, as before", () => {
    const stored = [CABINET_PRICE, ...CREATED_CLASS];
    const again = { ...CABINET_PRICE, value: 6 };

    const plan = planChange(requestOf(again), stateWith(stored));

    expect(written(plan).changes).toEqual([...CREATED_CLASS, again]);
  });
});

describe("a revert of a created row", () => {
  function revertOf(address: RevertAddress, changes: readonly DraftChange[]) {
    return planRevert(
      { expectedDraftRevision: "1", target: { kind: "change", address } },
      stateWith(changes),
    );
  }

  it("takes the class with its rates and its words, and nothing else", () => {
    const stored = [CABINET_PRICE, ...CREATED_CLASS, RENAME, DESCRIPTION];

    const plan = revertOf(addressOf(TIER_CREATION), stored);

    expect(written(plan).changes).toEqual([CABINET_PRICE]);
  });

  it("takes an accessory with its words", () => {
    const stored = [CABINET_PRICE, PLINTH_CREATION, PLINTH_NAME];

    const plan = revertOf(addressOf(PLINTH_CREATION), stored);

    expect(written(plan).changes).toEqual([CABINET_PRICE]);
  });

  it("audits the creation reverted, naming the row and no words", () => {
    const plan = revertOf(addressOf(TIER_CREATION), CREATED_CLASS);

    expect(written(plan).entry).toEqual({
      action: "price-draft-reverted",
      detail: {
        changeKind: "hardware-tier-created",
        itemKind: "hardware",
        itemId: TIER_ID,
        revertedCount: 1,
      },
    });
  });

  it("takes the words alone, leaving the class created", () => {
    const stored = [...CREATED_CLASS, RENAME, DESCRIPTION];

    const plan = revertOf(NAME_ADDRESS, stored);

    expect(written(plan).changes).toEqual([...CREATED_CLASS, DESCRIPTION]);
  });

  it.each([
    ["words never reworded", { ...NAME_ADDRESS, field: "description" }],
    [
      "a rate field the class has no change for",
      {
        kind: "hardware",
        tierId: TIER_ID,
        field: "bogus",
      },
    ],
  ])(
    "refuses the revert of %s, so the class stands and no audit row is planned",
    async (_name, address) => {
      const plan = revertOf(address as unknown as RevertAddress, [
        ...CREATED_CLASS,
        RENAME,
      ]);

      expect(plan.kind).toBe("refused");
      expect(await refusalOf(plan)).toEqual({
        status: 400,
        body: {
          status: "invalid-input",
          issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
        },
      });
    },
  );

  it("answers a class the draft does not hold as an address it does not know", async () => {
    const plan = revertOf(addressOf(TIER_CREATION), [CABINET_PRICE]);

    expect(await refusalOf(plan)).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
      },
    });
  });
});
