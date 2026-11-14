import { fc } from "@fast-check/vitest";
import { MAX_DESIGN_THUMBNAIL_BYTES } from "@lemnaria/configurator-domain";
import type { DesignThumbnailType } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { DesignThumbnailStoreError } from "../../src/design-thumbnail-store.js";
import type {
  DesignThumbnailStore,
  ThumbnailToStore,
} from "../../src/design-thumbnail-store.js";
import { rejectionOf } from "./rejection-of.js";
import {
  animatedPngBytes,
  taggedWebp,
  thumbnailBytes,
  thumbnailBytesOfLength,
} from "./valid-thumbnail-bytes.js";

export interface PlantedDesign {
  readonly id: string;
  /** The hash the design's write token arm matches. */
  readonly tokenHash: string;
  /** Absent for a design no account has claimed. */
  readonly accountId: string | undefined;
}

export interface DesignSpec {
  /** Whether an account has claimed the design. Defaults to true. */
  readonly isClaimed?: boolean;
  readonly revision?: string;
  readonly isHidden?: boolean;
  readonly isDeletedByClient?: boolean;
}

export interface HeldRow {
  readonly revision: string;
  readonly type: DesignThumbnailType;
  /** The last byte of the image, which is what `taggedWebp` varies. */
  readonly tagByte: number;
}

/** What one arm (the fake, or the database) provides: a store, and the rows around it. */
export interface ThumbnailWorld {
  readonly store: DesignThumbnailStore;
  aDesign(spec?: DesignSpec): Promise<PlantedDesign>;
  /** A save moved the design to this revision, or, to a lower one, a statement that read it earlier lands late. */
  setRevision(designId: string, revision: string): Promise<void>;
  mark(
    designId: string,
    marks: { isHidden?: boolean; isDeletedByClient?: boolean },
  ): Promise<void>;
  /** A row as the owner credential could write it, around the store's own statement. */
  plantThumbnail(designId: string, revision: string): Promise<void>;
  /** The row as held, whatever the design's marks. */
  heldThumbnail(designId: string): Promise<HeldRow | undefined>;
}

export interface ThumbnailContractOptions {
  /** How many random write orders the property tries: the database arm pays a round trip per write. */
  readonly propertyRuns: number;
}

const LIVE_TEST_TIMEOUT_MS = 120_000;
const A_HASH_NOBODY_HOLDS = "f".repeat(64);
const HIGHEST_PROPERTY_REVISION = 20;
const LONGEST_WRITE_ORDER = 6;

function tokenWrite(
  design: PlantedDesign,
  revision: string,
  tag = 1,
): ThumbnailToStore {
  return {
    designId: design.id,
    credential: { kind: "write-token", hash: design.tokenHash },
    revision,
    image: taggedWebp(tag),
    type: "image/webp",
  };
}

function accountWrite(
  design: PlantedDesign,
  revision: string,
  tag = 1,
): ThumbnailToStore {
  return {
    ...tokenWrite(design, revision, tag),
    credential: { kind: "account", accountId: design.accountId ?? "" },
  };
}

/**
 * What `DesignThumbnailStore` promises, asked of the fake and of the Neon store alike, so the two cannot drift: a write
 * only for the current revision of a claimed, unmarked design to a credential that matches it, `stale` told to no
 * caller without a matching credential, a newer picture never replaced by an older one, and a read for the owner alone.
 */
export function describeDesignThumbnailStoreContract(
  arm: string,
  newWorld: () => Promise<ThumbnailWorld>,
  { propertyRuns }: ThumbnailContractOptions,
): void {
  describe(`${arm}: storeThumbnail`, () => {
    it("stores for the current revision under the write token, and reads back for the owner", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "3" });

      const outcome = await world.store.storeThumbnail(
        tokenWrite(design, "3", 9),
      );

      expect(outcome).toEqual({ kind: "stored" });
      expect(
        await world.store.loadOwnThumbnail({
          accountId: design.accountId ?? "",
          designId: design.id,
        }),
      ).toEqual({
        kind: "found",
        image: taggedWebp(9),
        type: "image/webp",
        revision: "3",
      });
    });

    it("stores under the account's session as well", async () => {
      const world = await newWorld();
      const design = await world.aDesign();

      expect(
        await world.store.storeThumbnail(accountWrite(design, "1")),
      ).toEqual({ kind: "stored" });
      expect((await world.heldThumbnail(design.id))?.revision).toBe("1");
    });

    it("answers none, and writes nothing, to a credential the design does not match", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const someoneElse = await world.aDesign();
      const refused: ThumbnailToStore[] = [
        {
          ...tokenWrite(design, "1"),
          credential: { kind: "write-token", hash: A_HASH_NOBODY_HOLDS },
        },
        {
          ...tokenWrite(design, "1"),
          credential: { kind: "write-token", hash: someoneElse.tokenHash },
        },
        {
          ...tokenWrite(design, "1"),
          credential: {
            kind: "account",
            accountId: someoneElse.accountId ?? "",
          },
        },
      ];

      for (const write of refused) {
        expect(await world.store.storeThumbnail(write)).toEqual({
          kind: "none",
        });
      }
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("answers none for a design no account has claimed, even to the right write token", async () => {
      const world = await newWorld();
      const unclaimed = await world.aDesign({ isClaimed: false });

      expect(
        await world.store.storeThumbnail(tokenWrite(unclaimed, "1")),
      ).toEqual({ kind: "none" });
      expect(await world.heldThumbnail(unclaimed.id)).toBeUndefined();
    });

    it("answers none for a hidden design and for a deleted one, to the right credential on either arm", async () => {
      const world = await newWorld();
      const hidden = await world.aDesign({ isHidden: true });
      const deleted = await world.aDesign({ isDeletedByClient: true });

      for (const design of [hidden, deleted]) {
        expect(
          await world.store.storeThumbnail(tokenWrite(design, "1")),
        ).toEqual({
          kind: "none",
        });
        expect(
          await world.store.storeThumbnail(accountWrite(design, "1")),
        ).toEqual({ kind: "none" });
        expect(await world.heldThumbnail(design.id)).toBeUndefined();
      }
    });

    it("answers none for an unknown design and for ids and credentials of no valid shape, without a crash", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const unknown = { ...tokenWrite(design, "1"), designId: nanoid() };
      const malformed = [
        { ...tokenWrite(design, "1"), designId: "short" },
        {
          ...tokenWrite(design, "1"),
          credential: { kind: "write-token" as const, hash: "not a digest" },
        },
        {
          ...tokenWrite(design, "1"),
          credential: { kind: "account" as const, accountId: "" },
        },
      ];

      for (const write of [unknown, ...malformed]) {
        expect(await world.store.storeThumbnail(write)).toEqual({
          kind: "none",
        });
      }
    });

    it("tells stale to a matching credential at another revision, above or below, and writes nothing", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "5" });

      for (const revision of ["4", "6", "1000"]) {
        expect(
          await world.store.storeThumbnail(tokenWrite(design, revision)),
        ).toEqual({ kind: "stale" });
        expect(
          await world.store.storeThumbnail(accountWrite(design, revision)),
        ).toEqual({ kind: "stale" });
      }
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("gives a caller without a matching credential the same answer at the wrong revision as at the right one", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "5" });
      const foreign: ThumbnailToStore["credential"] = {
        kind: "write-token",
        hash: A_HASH_NOBODY_HOLDS,
      };

      const atTheRightRevision = await world.store.storeThumbnail({
        ...tokenWrite(design, "5"),
        credential: foreign,
      });
      const atTheWrongRevision = await world.store.storeThumbnail({
        ...tokenWrite(design, "6"),
        credential: foreign,
      });

      expect(atTheRightRevision).toEqual({ kind: "none" });
      expect(atTheWrongRevision).toEqual(atTheRightRevision);
    });

    it("replaces the picture with one of a greater revision, image and type included", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "2" });
      await world.store.storeThumbnail(tokenWrite(design, "2", 10));
      await world.setRevision(design.id, "3");

      await world.store.storeThumbnail({
        ...tokenWrite(design, "3", 20),
        image: thumbnailBytes("image/png", [20]),
        type: "image/png",
      });

      expect(await world.heldThumbnail(design.id)).toEqual({
        revision: "3",
        type: "image/png",
        tagByte: 20,
      });
    });

    it("keeps the first picture of a revision when the same revision is stored again, and still answers stored", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "2" });
      await world.store.storeThumbnail(tokenWrite(design, "2", 10));

      const repeat = await world.store.storeThumbnail(
        tokenWrite(design, "2", 99),
      );

      expect(repeat).toEqual({ kind: "stored" });
      expect((await world.heldThumbnail(design.id))?.tagByte).toBe(10);
    });

    it("never replaces a newer picture with an older one, even when the design reads as the older revision", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "5" });
      await world.plantThumbnail(design.id, "9");

      await world.store.storeThumbnail(tokenWrite(design, "5", 77));

      expect((await world.heldThumbnail(design.id))?.revision).toBe("9");
    });

    it(
      "ends holding the greatest revision written, over any order of writes each current when issued",
      async () => {
        const orderOfWrites = fc
          .uniqueArray(fc.integer({ min: 1, max: HIGHEST_PROPERTY_REVISION }), {
            minLength: 2,
            maxLength: LONGEST_WRITE_ORDER,
          })
          .chain((revisions) =>
            fc.shuffledSubarray(revisions, {
              minLength: revisions.length,
              maxLength: revisions.length,
            }),
          );
        const world = await newWorld();

        await fc.assert(
          fc.asyncProperty(orderOfWrites, async (order) => {
            const design = await world.aDesign({ revision: "1" });
            for (const revision of order) {
              await world.setRevision(design.id, String(revision));
              const outcome = await world.store.storeThumbnail(
                tokenWrite(design, String(revision)),
              );
              expect(outcome).toEqual({ kind: "stored" });
            }
            const held = await world.heldThumbnail(design.id);
            expect(held?.revision).toBe(String(Math.max(...order)));
          }),
          { numRuns: propertyRuns },
        );
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it("refuses before any statement what the table would refuse, and any bytes that are no capture-size still picture of the type, as invalid-request", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const write = tokenWrite(design, "1");
      const refusable: ThumbnailToStore[] = [
        { ...write, image: new Uint8Array() },
        { ...write, image: new Uint8Array(MAX_DESIGN_THUMBNAIL_BYTES + 1) },
        { ...write, type: "image/gif" as DesignThumbnailType },
        { ...write, image: Uint8Array.of(1, 2, 3) },
        { ...write, image: thumbnailBytes("image/png"), type: "image/webp" },
        { ...write, image: thumbnailBytes("image/webp"), type: "image/jpeg" },
        {
          ...write,
          image: thumbnailBytes("image/webp", [], {
            widthPx: 641,
            heightPx: 480,
          }),
        },
        { ...write, image: animatedPngBytes(), type: "image/png" },
        { ...write, revision: "0" },
        { ...write, revision: "-1" },
        { ...write, revision: "01" },
        { ...write, revision: "1\n" },
        { ...write, revision: "9223372036854775808" },
      ];

      for (const refused of refusable) {
        const failure = await rejectionOf(world.store.storeThumbnail(refused));
        expect(failure).toBeInstanceOf(DesignThumbnailStoreError);
        expect((failure as DesignThumbnailStoreError).failure).toBe(
          "invalid-request",
        );
      }
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("accepts an image of exactly the cap", async () => {
      const world = await newWorld();
      const design = await world.aDesign();

      const outcome = await world.store.storeThumbnail({
        ...tokenWrite(design, "1"),
        image: thumbnailBytesOfLength("image/webp", MAX_DESIGN_THUMBNAIL_BYTES),
      });

      expect(outcome).toEqual({ kind: "stored" });
    });
  });

  describe(`${arm}: loadOwnThumbnail`, () => {
    it("answers for the owning account's kitchen only, and none for another account's", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const stranger = await world.aDesign();
      await world.store.storeThumbnail(tokenWrite(design, "1"));

      expect(
        await world.store.loadOwnThumbnail({
          accountId: stranger.accountId ?? "",
          designId: design.id,
        }),
      ).toEqual({ kind: "none" });
    });

    it("answers none for a kitchen with no picture, an unknown one and a malformed id", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const accountId = design.accountId ?? "";

      for (const designId of [design.id, nanoid(), "short"]) {
        expect(
          await world.store.loadOwnThumbnail({ accountId, designId }),
        ).toEqual({ kind: "none" });
      }
      expect(
        await world.store.loadOwnThumbnail({
          accountId: "short",
          designId: design.id,
        }),
      ).toEqual({ kind: "none" });
    });

    it("answers none once the kitchen is hidden or deleted, though the row is still held", async () => {
      const world = await newWorld();
      const hidden = await world.aDesign();
      const deleted = await world.aDesign();
      for (const design of [hidden, deleted]) {
        await world.store.storeThumbnail(tokenWrite(design, "1"));
      }
      await world.mark(hidden.id, { isHidden: true });
      await world.mark(deleted.id, { isDeletedByClient: true });

      for (const design of [hidden, deleted]) {
        expect(await world.heldThumbnail(design.id)).toBeDefined();
        expect(
          await world.store.loadOwnThumbnail({
            accountId: design.accountId ?? "",
            designId: design.id,
          }),
        ).toEqual({ kind: "none" });
      }
    });
  });
}
