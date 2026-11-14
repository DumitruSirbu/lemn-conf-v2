import { randomBytes } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { FakeAccountKitchenStore } from "../src/fake-account-kitchen-store.js";
import { FakeDesignThumbnailStore } from "../src/fake-design-thumbnail-store.js";
import { describeDesignThumbnailStoreContract } from "./support/design-thumbnail-store-contract.js";
import { tagOf, taggedWebp } from "./support/valid-thumbnail-bytes.js";
import type {
  PlantedDesign,
  ThumbnailWorld,
} from "./support/design-thumbnail-store-contract.js";

const PROPERTY_RUNS = 100;

function aTokenHash(): string {
  return randomBytes(32).toString("hex");
}

function newFakeWorld(): ThumbnailWorld {
  const fake = new FakeDesignThumbnailStore();
  return {
    store: fake,
    aDesign(spec = {}) {
      const design: PlantedDesign = {
        id: nanoid(),
        tokenHash: aTokenHash(),
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

describeDesignThumbnailStoreContract(
  "FakeDesignThumbnailStore",
  () => Promise.resolve(newFakeWorld()),
  { propertyRuns: PROPERTY_RUNS },
);

describe("FakeAccountKitchenStore deletes a kitchen's thumbnail with the kitchen, through the hook the Neon statement stands for", () => {
  const OWNER = "O".repeat(21);

  async function aKitchenWithAPicture(options: { isSent: boolean }) {
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
    const tokenHash = aTokenHash();
    kitchens.seed({
      id,
      accountId: OWNER,
      design: KITCHEN_L_DESIGN,
      ...(options.isSent ? { sentAt: new Date() } : {}),
    });
    thumbnails.seedDesign({ id, accountId: OWNER, writeTokenHash: tokenHash });
    await thumbnails.storeThumbnail({
      designId: id,
      credential: { kind: "write-token", hash: tokenHash },
      revision: "1",
      image: taggedWebp(1),
      type: "image/webp",
    });
    return { thumbnails, kitchens, id };
  }

  it("removes the picture of the kitchen it deleted", async () => {
    const { thumbnails, kitchens, id } = await aKitchenWithAPicture({
      isSent: false,
    });

    expect(
      await kitchens.markDeleted({ accountId: OWNER, designId: id }),
    ).toEqual({ kind: "deleted" });
    expect(thumbnails.held(id)).toBeUndefined();
  });

  it("keeps the picture when the delete marks nothing: a sent kitchen, another account's, an unknown one", async () => {
    const { thumbnails, kitchens, id } = await aKitchenWithAPicture({
      isSent: true,
    });

    await kitchens.markDeleted({ accountId: OWNER, designId: id });
    await kitchens.markDeleted({ accountId: "X".repeat(21), designId: id });
    await kitchens.markDeleted({ accountId: OWNER, designId: nanoid() });

    expect(thumbnails.held(id)).toBeDefined();
  });

  it("keeps the picture of a kitchen it hides", async () => {
    const { thumbnails, kitchens, id } = await aKitchenWithAPicture({
      isSent: true,
    });

    expect(await kitchens.hide({ accountId: OWNER, designId: id })).toEqual({
      kind: "hidden",
    });
    expect(thumbnails.held(id)).toBeDefined();
  });
});
