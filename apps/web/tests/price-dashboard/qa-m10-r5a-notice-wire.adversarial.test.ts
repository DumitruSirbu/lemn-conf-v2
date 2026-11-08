import { describe, expect, it } from "vitest";

import type {
  PriceNoticeAcknowledgeRequestWire,
  PriceNoticeAcknowledgedWire,
  PriceNoticeWire,
  PriceStampWire,
  RemovedAccessoryWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// Adds: `@ts-expect-error` pins of the price notice union, checked by `pnpm typecheck` and not by `vitest run`.

const THE_PAIR: PriceStampWire = {
  versionId: "V".repeat(21),
  availabilityRevision: "0",
};

const ACTIVE_ARM: Extract<PriceNoticeWire, { kind: "active-version" }> = {
  kind: "active-version",
  isSent: false,
  current: THE_PAIR,
  pricesChanged: false,
  replacementsRequired: [],
  removedAccessories: [],
};

describe("every arm of the price notice carries isSent and nothing outside its own keys", () => {
  it("rejects an active-version arm without isSent", () => {
    // @ts-expect-error isSent is required on the active-version arm
    const withoutIsSent: PriceNoticeWire = {
      kind: "active-version",
      current: THE_PAIR,
      pricesChanged: false,
      replacementsRequired: [],
      removedAccessories: [],
    };

    expect(withoutIsSent.kind).toBe("active-version");
  });

  it("rejects a no-active-version arm without isSent", () => {
    // @ts-expect-error isSent is required on the no-active-version arm
    const withoutIsSent: PriceNoticeWire = { kind: "no-active-version" };

    expect(withoutIsSent.kind).toBe("no-active-version");
  });

  it("rejects a no-active-version arm that names a pair, a judgement or accessories", () => {
    const withPair: PriceNoticeWire = {
      kind: "no-active-version",
      isSent: false,
      // @ts-expect-error a book-less answer has no pair to acknowledge
      current: THE_PAIR,
    };
    const withJudgement: PriceNoticeWire = {
      kind: "no-active-version",
      isSent: false,
      // @ts-expect-error a book-less answer judges nothing
      pricesChanged: false,
    };
    const withAccessories: PriceNoticeWire = {
      kind: "no-active-version",
      isSent: false,
      // @ts-expect-error a book-less answer names no accessory
      removedAccessories: [],
    };

    expect([withPair, withJudgement, withAccessories]).toHaveLength(3);
  });

  it("rejects an active-version arm with a member beyond its own, or without its kind", () => {
    const withExtra: PriceNoticeWire = {
      ...ACTIVE_ARM,
      // @ts-expect-error the arm's keys are closed
      reason: "no-book",
    };
    // @ts-expect-error a bare object without a kind is neither arm
    const withoutKind: PriceNoticeWire = {
      isSent: true,
      current: THE_PAIR,
      pricesChanged: false,
      replacementsRequired: [],
      removedAccessories: [],
    };
    const withUnknownKind: PriceNoticeWire = {
      // @ts-expect-error only two kinds exist
      kind: "unavailable",
      isSent: true,
    };

    expect([withExtra, withoutKind, withUnknownKind]).toHaveLength(3);
  });

  it("rejects an isSent that is not a boolean", () => {
    const asText: PriceNoticeWire = {
      kind: "no-active-version",
      // @ts-expect-error isSent is a boolean on the wire, never "yes"
      isSent: "yes",
    };
    const absent: PriceNoticeWire = {
      kind: "no-active-version",
      // @ts-expect-error isSent is never undefined
      isSent: undefined,
    };

    expect([asText, absent]).toHaveLength(2);
  });

  it("makes a reader name both arms before it reaches the pair, so a third arm cannot be added unseen", () => {
    const describeNotice = (notice: PriceNoticeWire): string => {
      switch (notice.kind) {
        case "active-version":
          return notice.pricesChanged ? "changed" : notice.current.versionId;
        case "no-active-version":
          return notice.isSent ? "sent, no book" : "unsent, no book";
        default: {
          const unreachable: never = notice;
          return unreachable;
        }
      }
    };

    expect(describeNotice({ kind: "no-active-version", isSent: true })).toBe(
      "sent, no book",
    );
    expect(describeNotice(ACTIVE_ARM)).toBe("V".repeat(21));
  });
});

describe("a removed accessory is the closed pair accessoryId and, for a linked row only, authoredName", () => {
  it("rejects a member beyond the two, and an accessory without an id", () => {
    const withExtra: RemovedAccessoryWire = {
      accessoryId: "dishDryingRack",
      // @ts-expect-error the keys are closed
      label: "Dish rack",
    };
    // @ts-expect-error the id is required
    const withoutId: RemovedAccessoryWire = { authoredName: "Linked shelf" };

    expect([withExtra, withoutId]).toHaveLength(2);
  });

  it("rejects an authoredName that is present and undefined, so a built-in carries no key at all", () => {
    // @ts-expect-error exactOptionalPropertyTypes: absent, never undefined (JSON drops it, a reader must not rely on it)
    const builtIn: RemovedAccessoryWire = {
      accessoryId: "dishDryingRack",
      authoredName: undefined,
    };

    expect(Object.keys(JSON.parse(JSON.stringify(builtIn)) as object)).toEqual([
      "accessoryId",
    ]);
  });

  it("is the item an active-version arm lists, not a bare id", () => {
    const listed: RemovedAccessoryWire[] = [
      { accessoryId: "dishDryingRack" },
      { accessoryId: "A".repeat(21), authoredName: "Linked shelf" },
    ];
    const notice: PriceNoticeWire = {
      ...ACTIVE_ARM,
      removedAccessories: listed,
    };
    const bareIds: PriceNoticeWire = {
      ...ACTIVE_ARM,
      // @ts-expect-error an ItemRef-shaped or bare-string entry is not a RemovedAccessoryWire
      removedAccessories: ["dishDryingRack"],
    };

    expect(notice.kind).toBe("active-version");
    expect(bareIds.kind).toBe("active-version");
  });
});

describe("the acknowledgement keeps the pair the page displayed", () => {
  it("has a request that is the stamp and an answer that holds the stamp, unchanged by the amendment", () => {
    const request: PriceNoticeAcknowledgeRequestWire = THE_PAIR;
    const answer: PriceNoticeAcknowledgedWire = { acknowledged: THE_PAIR };
    const withIsSent: PriceNoticeAcknowledgeRequestWire = {
      ...THE_PAIR,
      // @ts-expect-error the request is the two members of the pair and nothing else
      isSent: true,
    };

    expect(request).toEqual(answer.acknowledged);
    expect(withIsSent.versionId).toBe(THE_PAIR.versionId);
  });
});
