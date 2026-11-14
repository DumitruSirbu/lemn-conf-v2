import { randomBytes } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { FakeAccountKitchenStore } from "../src/fake-account-kitchen-store.js";
import { FakeDesignThumbnailStore } from "../src/fake-design-thumbnail-store.js";
import type {
  PlantedDesign,
  ThumbnailWorld,
} from "./support/design-thumbnail-store-contract.js";
import { describeThumbnailAdversarialExtras } from "./support/qa-m11-w4a-thumbnail-extras.js";
import { tagOf, taggedWebp } from "./support/valid-thumbnail-bytes.js";

/**
 * Adversarial QA of M11 wave W4a against the fakes: the same extras the Neon store is asked (see
 * `qa-m11-w4a-design-thumbnails.live.adversarial.test.ts`), and the composition of the two fakes a W4b route test will
 * wire together, which must answer as the two Neon stores over one `designs` table do.
 */

function newFakeWorld(): ThumbnailWorld {
  const fake = new FakeDesignThumbnailStore();
  return {
    store: fake,
    aDesign(spec = {}) {
      const design: PlantedDesign = {
        id: nanoid(),
        tokenHash: randomBytes(32).toString("hex"),
        accountId: spec.isClaimed === false ? undefined : nanoid(),
      };
      fake.seedDesign({
        id: design.id,
        revision: spec.revision,
        accountId: design.accountId,
        writeTokenHash: design.tokenHash,
        isHidden: spec.isHidden,
        isDeleted: spec.isDeletedByClient,
      });
      return Promise.resolve(design);
    },
    setRevision(designId, revision) {
      fake.setRevision(designId, revision);
      return Promise.resolve();
    },
    mark(designId, marks) {
      fake.mark(designId, {
        isHidden: marks.isHidden,
        isDeleted: marks.isDeletedByClient,
      });
      return Promise.resolve();
    },
    plantThumbnail(designId, revision) {
      fake.plant(designId, {
        revision,
        image: Uint8Array.of(0),
        type: "image/webp",
      });
      return Promise.resolve();
    },
    heldThumbnail(designId) {
      const held = fake.held(designId);
      return Promise.resolve(
        held === undefined
          ? undefined
          : {
              revision: held.revision,
              type: held.type,
              tagByte: tagOf(held.image),
            },
      );
    },
  };
}

describeThumbnailAdversarialExtras("FakeDesignThumbnailStore", () =>
  Promise.resolve(newFakeWorld()),
);

describe("the two fakes a route test composes, over one kitchen", () => {
  const OWNER = "O".repeat(21);

  function composedKitchen(options: { isSent: boolean }) {
    const thumbnails = new FakeDesignThumbnailStore();
    const kitchens = new FakeAccountKitchenStore({
      deleteThumbnailOf: (designId) => {
        thumbnails.deleteFor(designId);
      },
      hideThumbnailOf: (designId) => {
        thumbnails.mark(designId, { isHidden: true });
      },
    });
    const id = nanoid();
    const tokenHash = randomBytes(32).toString("hex");
    kitchens.seed({
      id,
      accountId: OWNER,
      design: KITCHEN_L_DESIGN,
      ...(options.isSent ? { sentAt: new Date() } : {}),
    });
    thumbnails.seedDesign({ id, accountId: OWNER, writeTokenHash: tokenHash });
    const write = {
      designId: id,
      credential: { kind: "write-token", hash: tokenHash },
      revision: "1",
      image: taggedWebp(1),
      type: "image/webp",
    } as const;
    return { thumbnails, kitchens, id, write };
  }

  it("answers none to a picture upload for a kitchen the client has deleted, as the database does once the design is marked", async () => {
    const { thumbnails, kitchens, id, write } = composedKitchen({
      isSent: false,
    });
    await thumbnails.storeThumbnail(write);

    await kitchens.markDeleted({ accountId: OWNER, designId: id });

    expect(thumbnails.held(id)).toBeUndefined();
    expect(await thumbnails.storeThumbnail(write)).toEqual({ kind: "none" });
    expect(
      thumbnails.held(id),
      "a deleted kitchen must not get its picture back",
    ).toBeUndefined();
  });

  it("answers none for the picture of a kitchen the client has hidden, though the row is kept", async () => {
    const { thumbnails, kitchens, id, write } = composedKitchen({
      isSent: true,
    });
    await thumbnails.storeThumbnail(write);

    await kitchens.hide({ accountId: OWNER, designId: id });

    expect(thumbnails.held(id)).toBeDefined();
    expect(
      await thumbnails.loadOwnThumbnail({ accountId: OWNER, designId: id }),
    ).toEqual({ kind: "none" });
    expect(await thumbnails.storeThumbnail(write)).toEqual({ kind: "none" });
  });
});
