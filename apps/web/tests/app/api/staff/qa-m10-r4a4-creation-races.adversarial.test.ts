import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  CLASS_WORDS,
  activeBookOf,
  ACCESSORY_VALUE,
  createAccessoryAs,
  createClassAs,
  mintedIdOf,
  putChangeAs,
  ratesOf,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import {
  createAccessoryInDraft,
  createHardwareClassInDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
  revertDraft,
} from "../../../support/price-dashboard-requests";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

// Requests that read the same draft revision and are sent together: the store lets one through, the others find the draft
// moved, and what remains is a draft the domain still accepts with an audit row for each write that happened.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const PROVISIONAL_OFF = {
  address: { kind: "provisional" },
  value: false,
} as const;

function statusesOf(answers: readonly Response[]): number[] {
  return answers.map(({ status }) => status).sort((a, b) => a - b);
}

function draftAudits(): number {
  return world.prices.ledger
    .heldEvents()
    .filter(
      ({ action }) =>
        action === "price-draft-changed" || action === "price-draft-reverted",
    ).length;
}

async function expectDraftStillMakesABook(): Promise<readonly DraftChange[]> {
  const changes = await storedChangesOf(world.prices);
  expect(applyChanges(SAMPLE_PRICE_BOOK, changes).ok).toBe(true);
  return changes;
}

describe("many creations that read one revision", () => {
  const RACERS = 12;

  it("lets exactly one of twelve classes through, with one creation, one set of rates and one audit row", async () => {
    const revision = await currentDraftRevision();
    const rowsBefore = draftAudits();

    const answers = await Promise.all(
      Array.from({ length: RACERS }, () =>
        createHardwareClassInDraft({
          cookie: world.cookie,
          json: {
            expectedDraftRevision: revision,
            value: CLASS_WORDS,
            rates: ratesOf(2_000),
          },
        }),
      ),
    );

    expect(statusesOf(answers)).toEqual([
      200,
      ...Array.from({ length: RACERS - 1 }, () => 409),
    ]);
    const changes = await expectDraftStillMakesABook();
    expect(
      changes.filter(({ address }) => address.kind === "hardware-tier-created"),
    ).toHaveLength(1);
    expect(draftAudits() - rowsBefore).toBe(1);
  });

  it("lets exactly one through when a class and an accessory race, whichever kind wins", async () => {
    const revision = await currentDraftRevision();

    const answers = await Promise.all([
      createHardwareClassInDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: revision,
          value: CLASS_WORDS,
          rates: ratesOf(2_000),
        },
      }),
      createAccessoryInDraft({
        cookie: world.cookie,
        json: { expectedDraftRevision: revision, value: ACCESSORY_VALUE },
      }),
    ]);

    expect(statusesOf(answers)).toEqual([200, 409]);
    const changes = await expectDraftStillMakesABook();
    const creations = changes.filter(({ address }) =>
      address.kind.endsWith("-created"),
    );
    expect(creations).toHaveLength(1);
  });

  it("makes a chain of creations one after another under distinct ids, each with its rates", async () => {
    const ids: string[] = [];
    for (let made = 0; made < 15; made += 1) {
      const answer =
        made % 3 === 0
          ? await createAccessoryAs(world.cookie)
          : await createClassAs(world.cookie);
      expect(answer.status).toBe(200);
      ids.push(await mintedIdOf(answer));
    }

    expect(new Set(ids).size).toBe(ids.length);
    const changes = await expectDraftStillMakesABook();
    const classes = ids.length - 5;
    expect(changes).toHaveLength(
      5 + classes * (1 + Object.keys(ratesOf(1)).length),
    );
  });
});

describe("a creation racing a revert of the same revision", () => {
  it("leaves either the held change beside the whole class, or neither, and never half a class", async () => {
    expect((await putChangeAs(world.cookie, PROVISIONAL_OFF)).status).toBe(200);
    const revision = await currentDraftRevision();

    const answers = await Promise.all([
      createHardwareClassInDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: revision,
          value: CLASS_WORDS,
          rates: ratesOf(2_000),
        },
      }),
      revertDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: revision,
          target: { kind: "change", address: PROVISIONAL_OFF.address },
        },
      }),
    ]);

    expect(statusesOf(answers)).toEqual([200, 409]);
    const changes = await expectDraftStillMakesABook();
    const holdsClass = changes.some(
      ({ address }) => address.kind === "hardware-tier-created",
    );
    const holdsProvisional = changes.some(
      ({ address }) => address.kind === "provisional",
    );
    expect(holdsClass).toBe(holdsProvisional);
    expect(changes.length).toBe(
      holdsClass ? 1 + 1 + Object.keys(ratesOf(1)).length : 0,
    );
  });

  it("leaves either the first class whole or a second class whole, or none, and never an orphaned rate", async () => {
    const tierId = await mintedIdOf(await createClassAs(world.cookie));
    const revision = await currentDraftRevision();

    const answers = await Promise.all([
      revertDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: revision,
          target: {
            kind: "change",
            address: { kind: "hardware-tier-created", tierId },
          },
        },
      }),
      createHardwareClassInDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: revision,
          value: CLASS_WORDS,
          rates: ratesOf(3_000),
        },
      }),
    ]);

    expect(statusesOf(answers)).toEqual([200, 409]);
    const changes = await expectDraftStillMakesABook();
    const rateCount = Object.keys(ratesOf(1)).length;
    const creations = changes.filter(
      ({ address }) => address.kind === "hardware-tier-created",
    );
    expect(creations.length).toBe(answers[0].status === 200 ? 0 : 2);
    expect(changes).toHaveLength(creations.length * (1 + rateCount));
  });
});

describe("a creation racing a publish of the same revision", () => {
  it("is either published without the new row, or kept in the draft with no version made", async () => {
    await createClassAs(world.cookie);
    const publishing = await publishBody();
    const versionsBefore = (
      await world.prices.stores.priceBook.listVersions({ page: 1 })
    ).total;

    const answers = await Promise.all([
      publishDraft({ cookie: world.cookie, json: publishing }),
      createAccessoryInDraft({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: publishing.expectedDraftRevision,
          value: ACCESSORY_VALUE,
        },
      }),
    ]);

    expect(statusesOf(answers)).toEqual([200, 409]);
    const versionsAfter = (
      await world.prices.stores.priceBook.listVersions({ page: 1 })
    ).total;
    const book = await activeBookOf(world.prices);
    const published = answers[0].status === 200;
    expect(versionsAfter).toBe(versionsBefore + (published ? 1 : 0));
    expect(book.linkedAccessories.length).toBe(0);
    const draft = await storedChangesOf(world.prices);
    expect(
      draft.some(({ address }) => address.kind === "accessory-created"),
    ).toBe(!published);
  });

  it("answers a creation sent after the publish with the revision it read before with 409, and the new version holds no new row", async () => {
    await createClassAs(world.cookie);
    const revisionBeforePublish = await currentDraftRevision();
    const published = await publishDraft({
      cookie: world.cookie,
      json: await publishBody(),
    });

    const answer = await createAccessoryAs(world.cookie, {
      expectedDraftRevision: revisionBeforePublish,
    });

    expect(published.status).toBe(200);
    expect(answer.status).toBe(409);
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });
});

describe("a revert of a creation that the same creation's replay follows", () => {
  it("lets the person create again at the new revision, and the first id is not issued again", async () => {
    const first = await mintedIdOf(await createClassAs(world.cookie));
    const reverted = await revertAs(world.cookie, {
      kind: "change",
      address: { kind: "hardware-tier-created", tierId: first },
    });

    const again = await createClassAs(world.cookie);

    expect(reverted.status).toBe(200);
    expect(await storedChangesOf(world.prices)).not.toEqual([]);
    expect(await mintedIdOf(again)).not.toBe(first);
  });
});
