import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  type ItemRef,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NEVER_RECORDED,
  type AcknowledgedPrices,
} from "@lemnaria/persistence";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import type { PriceStores } from "@/lib/server/price-stores";

import { aDesignId, freshAccountWorld } from "../../support/account-world";
import { signedInAs } from "../../support/staff-world";

// Adversarial QA for M10 wave R5a (R5a-b, R5a-c): the seeded world's notice store judges an acknowledgement against the
// versions and the availability head the editor prices under, and those move. A fake made over a second price book or a
// second availability log agrees with the seed on the first day and disagrees as soon as either moves.

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);

const FIRST_ACKNOWLEDGE = "record a design's acknowledged prices";
const FIRST_OPEN = "record a design's first-open prices";
const READ_MARKER = "read a design's acknowledged prices";
const WIDEST_REVISION = "9223372036854775807";

let stores: PriceStores;
let staffSession: {
  sessionTokenHash: string;
  idleLifetimeSeconds: typeof IDLE_LIFETIME_SECONDS_BY_ROLE;
};

beforeEach(async () => {
  freshAccountWorld();
  stores = await seedFakePriceStores();
  const administrator = await signedInAs({ role: "administrator" });
  staffSession = {
    sessionTokenHash: administrator.session.tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  };
});

async function headRevision(): Promise<string> {
  return (await stores.availability.readCurrent()).revision;
}

async function activeVersionId(): Promise<string> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the seed holds no version");
  return active.version.versionId;
}

async function currentPair(): Promise<AcknowledgedPrices> {
  return {
    versionId: await activeVersionId(),
    availabilityRevision: await headRevision(),
  };
}

async function switchAnItem(label: string): Promise<string> {
  const item: ItemRef = { kind: "accessory", accessoryId: `qa-${label}` };
  const switched = await stores.availability.setActive({
    item,
    active: false,
    expectedRevision: await headRevision(),
    audit: {
      session: staffSession,
      entry: {
        action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
        detail: { itemKind: "accessory", itemId: `qa-${label}`, active: false },
      },
    },
  });
  if (switched.kind !== "ok") throw new Error("seed: the switch was refused");
  return switched.revision;
}

async function publishNextVersion(): Promise<string> {
  const draft = await stores.priceBook.readDraft();
  const published = await stores.priceBook.publish({
    expectedDraftRevision: draft.draftRevision,
    expectedActiveSequence: await activeSequence(),
    expectedAvailabilityRevision: await headRevision(),
    createdItems: [],
    deletedItems: [],
    label: "Next version",
    note: "",
    book: SAMPLE_PRICE_BOOK,
    changeSummary: [],
    audit: {
      session: staffSession,
      entry: {
        action: "price-published",
        detail: { provisional: SAMPLE_PRICE_BOOK.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") throw new Error("seed: publish refused");
  return published.versionId;
}

async function activeSequence(): Promise<number> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the seed holds no version");
  return active.version.sequenceNumber;
}

function oneAhead(revision: string): string {
  return String(BigInt(revision) + 1n);
}

async function failureOf(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("an acknowledgement follows the head the editor prices under", () => {
  it("is revision-ahead for the head plus one until an item is switched, then ok, and the old head stays ok", async () => {
    const designId = aDesignId();
    const { versionId } = await currentPair();
    const before = await headRevision();
    const next = oneAhead(before);
    expect(
      await stores.notices.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: next,
      }),
    ).toEqual({ kind: "revision-ahead" });

    const switchedTo = await switchAnItem("first");

    expect(switchedTo).toBe(next);
    for (const availabilityRevision of [next, before]) {
      expect(
        await stores.notices.recordAcknowledged(designId, {
          versionId,
          availabilityRevision,
        }),
      ).toEqual({ kind: "ok" });
    }
    expect(
      await stores.notices.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: oneAhead(next),
      }),
    ).toEqual({ kind: "revision-ahead" });
  });

  it("tracks every step of a run of switches across the nine-to-ten digit transition", async () => {
    const designId = aDesignId();
    const { versionId } = await currentPair();

    for (let step = 1; step <= 12; step += 1) {
      const head = await switchAnItem(`step-${String(step)}`);
      const answers = await Promise.all(
        [head, oneAhead(head), "1", "9", "10"].map((availabilityRevision) =>
          stores.notices.recordAcknowledged(designId, {
            versionId,
            availabilityRevision,
          }),
        ),
      );

      expect(answers.map(({ kind }) => kind)).toEqual([
        "ok",
        "revision-ahead",
        "ok",
        BigInt(head) >= 9n ? "ok" : "revision-ahead",
        BigInt(head) >= 10n ? "ok" : "revision-ahead",
      ]);
    }
  });

  it("judges any revision against the head by value, for every revision a bigint holds", async () => {
    await switchAnItem("a");
    await switchAnItem("b");
    await switchAnItem("c");
    const { versionId } = await currentPair();
    const head = BigInt(await headRevision());
    const widest = BigInt(WIDEST_REVISION);

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.bigInt({ min: 0n, max: 12n }),
          fc.bigInt({ min: 0n, max: widest }),
          fc.constantFrom(widest, widest - 1n, head - 1n, head, head + 1n),
        ),
        async (revision) => {
          const answer = await stores.notices.recordAcknowledged(aDesignId(), {
            versionId,
            availabilityRevision: String(revision),
          });

          expect(answer.kind).toBe(revision <= head ? "ok" : "revision-ahead");
        },
      ),
    );
  });
});

describe("an acknowledgement follows the versions the editor prices under", () => {
  it("keeps the first version acknowledgeable after a second is published, and knows the second", async () => {
    const firstVersionId = await activeVersionId();
    const designId = aDesignId();

    const secondVersionId = await publishNextVersion();

    expect(secondVersionId).not.toBe(firstVersionId);
    for (const versionId of [firstVersionId, secondVersionId]) {
      expect(
        await stores.notices.recordAcknowledged(designId, {
          versionId,
          availabilityRevision: await headRevision(),
        }),
      ).toEqual({ kind: "ok" });
    }
  });

  it("knows a version published by the same stores a second and a third time over", async () => {
    const designId = aDesignId();

    const published = [await publishNextVersion(), await publishNextVersion()];

    for (const versionId of published) {
      expect(
        await stores.notices.recordAcknowledged(designId, {
          versionId,
          availabilityRevision: await headRevision(),
        }),
      ).toEqual({ kind: "ok" });
    }
  });

  it("judges the version before the revision, so a pair wrong in both is unknown-version", async () => {
    const answer = await stores.notices.recordAcknowledged(aDesignId(), {
      versionId: "N".repeat(21),
      availabilityRevision: WIDEST_REVISION,
    });

    expect(answer).toEqual({ kind: "unknown-version" });
  });

  it("does not know a version that names the active one's id in other letters", async () => {
    const versionId = await activeVersionId();
    const lowered =
      versionId === versionId.toLowerCase()
        ? versionId.toUpperCase()
        : versionId.toLowerCase();

    const answer = await stores.notices.recordAcknowledged(aDesignId(), {
      versionId: lowered,
      availabilityRevision: await headRevision(),
    });

    expect(answer).toEqual({ kind: "unknown-version" });
  });
});

describe("a refusal writes nothing", () => {
  it.each([
    ["unknown-version", { versionId: "N".repeat(21) }],
    ["revision-ahead", { availabilityRevision: "100" }],
  ])(
    "of %s leaves the marker the design held, and none where it held none",
    async (_refusal, replacement) => {
      const designId = aDesignId();
      const pair = await currentPair();

      await stores.notices.recordAcknowledged(designId, {
        ...pair,
        ...replacement,
      });
      expect(await stores.notices.readAcknowledged(designId)).toBe(
        NEVER_RECORDED,
      );
      await stores.notices.recordIfAbsent(designId, pair);
      await stores.notices.recordAcknowledged(designId, {
        ...pair,
        ...replacement,
      });

      expect(await stores.notices.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    },
  );

  it("of a first open that is malformed leaves the design with none", async () => {
    const designId = aDesignId();
    const pair = await currentPair();

    await failureOf(
      stores.notices.recordIfAbsent(designId, { ...pair, versionId: "x" }),
    );

    expect(await stores.notices.readAcknowledged(designId)).toBe(
      NEVER_RECORDED,
    );
  });

  it("of an acknowledgement that is stale does not move a later first open either way", async () => {
    const designId = aDesignId();
    const pair = await currentPair();
    await stores.notices.recordAcknowledged(designId, pair);
    await switchAnItem("later");

    await stores.notices.recordIfAbsent(designId, {
      versionId: pair.versionId,
      availabilityRevision: await headRevision(),
    });

    expect(await stores.notices.readAcknowledged(designId)).toEqual({
      kind: "recorded",
      acknowledged: pair,
    });
  });
});

describe("the shapes the store refuses before it judges anything", () => {
  const A_20_CHARACTER_ID = "A".repeat(20);
  const A_22_CHARACTER_ID = "A".repeat(22);

  it.each([
    [
      "twenty characters, which the dashboard's own id shape would admit",
      A_20_CHARACTER_ID,
    ],
    ["twenty-two characters", A_22_CHARACTER_ID],
    ["empty", ""],
    ["a dot", `${"V".repeat(20)}.`],
    ["a slash", `${"V".repeat(20)}/`],
    ["a space", `${"V".repeat(20)} `],
    ["a trailing line feed", `${"V".repeat(20)}\n`],
    ["a non-ASCII letter", `${"V".repeat(20)}é`],
    ["a full-width letter", `${"V".repeat(20)}Ａ`],
    ["a NUL", `${"V".repeat(20)}\u0000`],
  ])(
    "refuses a version id of %s as an invalid request, not as unknown-version",
    async (_description, versionId) => {
      const designId = aDesignId();
      const availabilityRevision = await headRevision();

      const failure = await failureOf(
        stores.notices.recordAcknowledged(designId, {
          versionId,
          availabilityRevision,
        }),
      );

      expect(failure).toBeInstanceOf(DashboardStoreError);
      expect(failure).toMatchObject({
        failure: "invalid-request",
        operation: FIRST_ACKNOWLEDGE,
      });
      expect(await stores.notices.readAcknowledged(designId)).toBe(
        NEVER_RECORDED,
      );
    },
  );

  it.each([
    ["empty", ""],
    ["a leading zero", "01"],
    ["negative", "-1"],
    ["a plus sign", "+1"],
    ["a decimal", "1.0"],
    ["a trailing line feed", "1\n"],
    ["a leading space", " 1"],
    ["hexadecimal", "0x1"],
    ["a full-width digit", "１"],
    ["one past the widest bigint", "9223372036854775808"],
    ["twenty digits", "10000000000000000000"],
  ])(
    "refuses a revision of %s as an invalid request, and records nothing",
    async (_description, availabilityRevision) => {
      const designId = aDesignId();
      const versionId = await activeVersionId();

      const acknowledgement = await failureOf(
        stores.notices.recordAcknowledged(designId, {
          versionId,
          availabilityRevision,
        }),
      );
      const firstOpen = await failureOf(
        stores.notices.recordIfAbsent(designId, {
          versionId,
          availabilityRevision,
        }),
      );

      expect(acknowledgement).toMatchObject({
        failure: "invalid-request",
        operation: FIRST_ACKNOWLEDGE,
      });
      expect(firstOpen).toMatchObject({
        failure: "invalid-request",
        operation: FIRST_OPEN,
      });
      expect(await stores.notices.readAcknowledged(designId)).toBe(
        NEVER_RECORDED,
      );
    },
  );

  it("takes the widest bigint as a well-formed revision, which is ahead of any head", async () => {
    const answer = await stores.notices.recordAcknowledged(aDesignId(), {
      versionId: await activeVersionId(),
      availabilityRevision: WIDEST_REVISION,
    });

    expect(answer).toEqual({ kind: "revision-ahead" });
  });

  it.each([
    ["twenty characters", A_20_CHARACTER_ID],
    ["twenty-two characters", A_22_CHARACTER_ID],
    ["empty", ""],
    ["a slash", `${"D".repeat(20)}/`],
    ["a trailing line feed", `${"D".repeat(20)}\n`],
  ])(
    "refuses a design id of %s on all three methods as an invalid request",
    async (_description, designId) => {
      const pair = await currentPair();

      const failures = await Promise.all([
        failureOf(stores.notices.readAcknowledged(designId)),
        failureOf(stores.notices.recordIfAbsent(designId, pair)),
        failureOf(stores.notices.recordAcknowledged(designId, pair)),
      ]);

      expect(failures).toMatchObject([
        { failure: "invalid-request", operation: READ_MARKER },
        { failure: "invalid-request", operation: FIRST_OPEN },
        { failure: "invalid-request", operation: FIRST_ACKNOWLEDGE },
      ]);
    },
  );

  it.each([undefined, null, 21, {}, ["x"]])(
    "refuses %j for a version id, a revision and a design id as an invalid request, never a crash",
    async (value) => {
      const pair = await currentPair();
      const unchecked = value as unknown as string;

      const failures = await Promise.all([
        failureOf(
          stores.notices.recordAcknowledged(aDesignId(), {
            ...pair,
            versionId: unchecked,
          }),
        ),
        failureOf(
          stores.notices.recordAcknowledged(aDesignId(), {
            ...pair,
            availabilityRevision: unchecked,
          }),
        ),
        failureOf(stores.notices.recordAcknowledged(unchecked, pair)),
      ]);

      for (const failure of failures) {
        expect(failure).toBeInstanceOf(DashboardStoreError);
        expect(failure).toMatchObject({ failure: "invalid-request" });
      }
    },
  );

  it("refuses exactly the pairs an independent statement of the shapes refuses, over arbitrary text", async () => {
    const MINTED_ID = /^[A-Za-z0-9_-]{21}$/;
    const REVISION = /^(0|[1-9][0-9]{0,18})$/;
    const isWellFormed = (candidate: string, revision: string): boolean =>
      MINTED_ID.test(candidate) &&
      REVISION.test(revision) &&
      BigInt(revision) <= BigInt(WIDEST_REVISION);
    const versionId = await activeVersionId();
    const text = fc.oneof(
      fc.string({ maxLength: 30 }),
      fc.string({ unit: "binary", maxLength: 30 }),
      fc.stringMatching(/^[A-Za-z0-9_-]{19,23}$/),
      fc.stringMatching(/^[0-9]{1,21}$/),
    );

    await fc.assert(
      fc.asyncProperty(text, text, async (candidateVersion, revision) => {
        const designId = aDesignId();

        const failure = await failureOf(
          stores.notices.recordAcknowledged(designId, {
            versionId: candidateVersion,
            availabilityRevision: revision,
          }),
        );

        const isRefusedAsShape =
          failure instanceof DashboardStoreError &&
          failure.failure === "invalid-request";
        expect(isRefusedAsShape).toBe(
          !isWellFormed(candidateVersion, revision),
        );
        if (isRefusedAsShape) {
          expect(await stores.notices.readAcknowledged(designId)).toBe(
            NEVER_RECORDED,
          );
        } else {
          expect(failure).toBeUndefined();
        }
      }),
    );
    expect(versionId).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });
});
