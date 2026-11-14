import { DESIGN_THUMBNAIL_TYPES } from "@lemnaria/configurator-domain";
import type { DesignThumbnailType } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { ThumbnailToStore } from "../../src/design-thumbnail-store.js";
import type {
  PlantedDesign,
  ThumbnailWorld,
} from "./design-thumbnail-store-contract.js";
import { tagOf, taggedWebp, thumbnailBytes } from "./valid-thumbnail-bytes.js";

/**
 * Adversarial QA of M11 wave W4a, asked of the fake and of the Neon store alike: what the developer's contract leaves
 * unasked. A caller with a matching credential must learn nothing of a hidden, deleted or unclaimed design; revisions
 * are ordered as numbers and not as text; a picture is exactly the bytes and the type that were written, as one row;
 * and writes racing each other leave one whole picture.
 */

const MAX_BIGINT_REVISION = "9223372036854775807";

function tokenWrite(
  design: PlantedDesign,
  revision: string,
  overrides: Partial<ThumbnailToStore> = {},
): ThumbnailToStore {
  return {
    designId: design.id,
    credential: { kind: "write-token", hash: design.tokenHash },
    revision,
    image: taggedWebp(1),
    type: "image/webp",
    ...overrides,
  };
}

function ownersView(design: PlantedDesign) {
  return { accountId: design.accountId ?? "", designId: design.id };
}

export function describeThumbnailAdversarialExtras(
  arm: string,
  newWorld: () => Promise<ThumbnailWorld>,
): void {
  describe(`${arm}: what a matching credential is told`, () => {
    it("answers none, never stale, at the wrong revision for a hidden, a deleted and an unclaimed design", async () => {
      const world = await newWorld();
      const designs = [
        await world.aDesign({ revision: "5", isHidden: true }),
        await world.aDesign({ revision: "5", isDeletedByClient: true }),
        await world.aDesign({ revision: "5", isClaimed: false }),
        await world.aDesign({
          revision: "5",
          isHidden: true,
          isDeletedByClient: true,
        }),
      ];

      for (const design of designs) {
        for (const revision of ["4", "5", "6"]) {
          expect(
            await world.store.storeThumbnail(tokenWrite(design, revision)),
            `token arm, revision ${revision}`,
          ).toEqual({ kind: "none" });
          if (design.accountId !== undefined) {
            expect(
              await world.store.storeThumbnail({
                ...tokenWrite(design, revision),
                credential: { kind: "account", accountId: design.accountId },
              }),
              `account arm, revision ${revision}`,
            ).toEqual({ kind: "none" });
          }
        }
        expect(await world.heldThumbnail(design.id)).toBeUndefined();
      }
    });

    it("answers none to a design that is marked after its picture was stored, and leaves the picture as it was", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "2" });
      await world.store.storeThumbnail(
        tokenWrite(design, "2", { image: taggedWebp(7) }),
      );
      await world.setRevision(design.id, "3");
      await world.mark(design.id, { isHidden: true });

      const outcome = await world.store.storeThumbnail(
        tokenWrite(design, "3", { image: taggedWebp(8) }),
      );

      expect(outcome).toEqual({ kind: "none" });
      expect(await world.heldThumbnail(design.id)).toMatchObject({
        revision: "2",
        tagByte: 7,
      });
    });

    it("never lets one credential's member widen the other: a wrong hash with the right account, and a wrong account with the right hash", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const stranger = await world.aDesign();
      const widened = [
        {
          kind: "write-token",
          hash: stranger.tokenHash,
          accountId: design.accountId,
        },
        {
          kind: "account",
          accountId: stranger.accountId,
          hash: design.tokenHash,
        },
      ] as unknown as ThumbnailToStore["credential"][];

      for (const credential of widened) {
        expect(
          await world.store.storeThumbnail(
            tokenWrite(design, "1", { credential }),
          ),
        ).toEqual({ kind: "none" });
      }
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("answers none, and does not throw, for a credential of a kind the store does not know", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const unknownKind = {
        kind: "staff",
        accountId: design.accountId,
        hash: design.tokenHash,
      } as unknown as ThumbnailToStore["credential"];

      expect(
        await world.store.storeThumbnail(
          tokenWrite(design, "1", { credential: unknownKind }),
        ),
      ).toEqual({ kind: "none" });
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("answers none for a write token's hash in upper case, which is not the stored digest", async () => {
      const world = await newWorld();
      const design = await world.aDesign();

      const outcome = await world.store.storeThumbnail(
        tokenWrite(design, "1", {
          credential: {
            kind: "write-token",
            hash: design.tokenHash.toUpperCase(),
          },
        }),
      );

      expect(outcome).toEqual({ kind: "none" });
    });
  });

  describe(`${arm}: revisions are numbers`, () => {
    it.each([
      ["9", "10"],
      ["99", "100"],
      ["2", "10"],
      ["999999999", "1000000000"],
      ["9223372036854775806", MAX_BIGINT_REVISION],
    ])(
      "replaces the picture of revision %s with that of %s, which a text comparison would call smaller",
      async (held, incoming) => {
        const world = await newWorld();
        const design = await world.aDesign({ revision: incoming });
        await world.plantThumbnail(design.id, held);

        const outcome = await world.store.storeThumbnail(
          tokenWrite(design, incoming, { image: taggedWebp(42) }),
        );

        expect(outcome).toEqual({ kind: "stored" });
        expect(await world.heldThumbnail(design.id)).toMatchObject({
          revision: incoming,
          tagByte: 42,
        });
      },
    );

    it.each([
      ["10", "9"],
      ["100", "99"],
      ["1000000000", "999999999"],
      [MAX_BIGINT_REVISION, "9223372036854775806"],
    ])(
      "keeps the picture of revision %s against a write of %s, which a text comparison would call greater",
      async (held, incoming) => {
        const world = await newWorld();
        const design = await world.aDesign({ revision: incoming });
        await world.plantThumbnail(design.id, held);

        const outcome = await world.store.storeThumbnail(
          tokenWrite(design, incoming, { image: taggedWebp(42) }),
        );

        expect(outcome).toEqual({ kind: "stored" });
        expect(await world.heldThumbnail(design.id)).toMatchObject({
          revision: held,
          tagByte: 0,
        });
      },
    );

    it("stores and reads back the largest revision a bigint holds, as the same string", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: MAX_BIGINT_REVISION });

      expect(
        await world.store.storeThumbnail(
          tokenWrite(design, MAX_BIGINT_REVISION),
        ),
      ).toEqual({ kind: "stored" });
      expect(
        await world.store.loadOwnThumbnail(ownersView(design)),
      ).toMatchObject({ kind: "found", revision: MAX_BIGINT_REVISION });
    });

    it("tells stale to a write one below the largest revision, and writes nothing", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: MAX_BIGINT_REVISION });

      expect(
        await world.store.storeThumbnail(
          tokenWrite(design, "9223372036854775806"),
        ),
      ).toEqual({ kind: "stale" });
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });

    it("tells stale once the design has moved on, to a write that was current when it was issued, and keeps the older picture", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "4" });
      await world.store.storeThumbnail(
        tokenWrite(design, "4", { image: taggedWebp(44) }),
      );
      await world.setRevision(design.id, "5");

      const late = await world.store.storeThumbnail(
        tokenWrite(design, "4", { image: taggedWebp(99) }),
      );

      expect(late).toEqual({ kind: "stale" });
      expect(await world.heldThumbnail(design.id)).toMatchObject({
        revision: "4",
        tagByte: 44,
      });
    });

    it("keeps serving the picture of the revision it depicts after the design has moved past it", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "3" });
      await world.store.storeThumbnail(tokenWrite(design, "3"));
      await world.setRevision(design.id, "8");

      expect(
        await world.store.loadOwnThumbnail(ownersView(design)),
      ).toMatchObject({ kind: "found", revision: "3" });
    });
  });

  describe(`${arm}: the picture is exactly what was written`, () => {
    it("round-trips all 256 byte values, in every type of the closed list", async () => {
      const world = await newWorld();
      const everyByteValue = Array.from({ length: 256 }, (_, value) => value);

      for (const type of DESIGN_THUMBNAIL_TYPES) {
        const everyByte = thumbnailBytes(type, everyByteValue);
        const design = await world.aDesign();
        await world.store.storeThumbnail(
          tokenWrite(design, "1", { image: everyByte, type }),
        );

        expect(await world.store.loadOwnThumbnail(ownersView(design))).toEqual({
          kind: "found",
          image: everyByte,
          type,
          revision: "1",
        });
      }
    });

    it("stores only the bytes of a view that does not start at the top of its buffer, and of a pooled Buffer", async () => {
      const world = await newWorld();
      const picture = taggedWebp(5);
      const backing = Uint8Array.from(
        { length: picture.byteLength + 40 },
        (_, index) => index,
      );
      backing.set(picture, 5);
      const view = backing.subarray(5, 5 + picture.byteLength);
      const pooled = Buffer.from(taggedWebp(9));

      for (const image of [view, pooled]) {
        const design = await world.aDesign();
        await world.store.storeThumbnail(tokenWrite(design, "1", { image }));

        const lookup = await world.store.loadOwnThumbnail(ownersView(design));

        expect(lookup.kind).toBe("found");
        if (lookup.kind === "found") {
          expect(Array.from(lookup.image)).toEqual(Array.from(image));
        }
      }
    });

    it("is not changed by a caller who mutates the image after storing it, or the image it read back", async () => {
      const world = await newWorld();
      const design = await world.aDesign();
      const image = thumbnailBytes("image/webp", [1, 2, 3, 4]);
      const written = Array.from(image);
      await world.store.storeThumbnail(tokenWrite(design, "1", { image }));
      image.fill(0);

      const firstRead = await world.store.loadOwnThumbnail(ownersView(design));
      if (firstRead.kind === "found") firstRead.image.fill(255);
      const secondRead = await world.store.loadOwnThumbnail(ownersView(design));

      expect(secondRead).toMatchObject({ kind: "found" });
      if (secondRead.kind === "found") {
        expect(Array.from(secondRead.image)).toEqual(written);
      }
    });

    it("keeps the first picture's type with its image when the same revision is stored again as another type", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "2" });
      await world.store.storeThumbnail(
        tokenWrite(design, "2", {
          image: thumbnailBytes("image/png", [11]),
          type: "image/png",
        }),
      );

      await world.store.storeThumbnail(
        tokenWrite(design, "2", {
          image: thumbnailBytes("image/jpeg", [22]),
          type: "image/jpeg",
        }),
      );

      expect(await world.store.loadOwnThumbnail(ownersView(design))).toEqual({
        kind: "found",
        image: thumbnailBytes("image/png", [11]),
        type: "image/png",
        revision: "2",
      });
    });
  });

  describe(`${arm}: writes that race`, () => {
    it("leaves one whole picture, an image with its own type, when several write the same revision at once", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "1" });
      const types: DesignThumbnailType[] = [
        "image/webp",
        "image/png",
        "image/jpeg",
      ];
      const writes = Array.from({ length: 9 }, (_, index) => {
        const type = types[index % types.length] ?? "image/webp";
        const tag = 100 + index;
        return tokenWrite(design, "1", {
          image: thumbnailBytes(type, [tag, tag]),
          type,
        });
      });

      const outcomes = await Promise.all(
        writes.map((write) => world.store.storeThumbnail(write)),
      );

      expect(outcomes).toEqual(writes.map(() => ({ kind: "stored" })));
      const lookup = await world.store.loadOwnThumbnail(ownersView(design));
      expect(lookup.kind).toBe("found");
      if (lookup.kind === "found") {
        const winner = writes.find(
          (write) => tagOf(write.image) === tagOf(lookup.image),
        );
        expect(winner, "the held image is one that was written").toBeDefined();
        expect(Array.from(lookup.image)).toEqual(
          Array.from(winner?.image ?? []),
        );
        expect(lookup.type).toBe(winner?.type);
        expect(lookup.revision).toBe("1");
      }
    });

    it("answers stale to the older and stored to the current when both are issued at once to a design at the current one", async () => {
      const world = await newWorld();
      const design = await world.aDesign({ revision: "7" });

      const outcomes = await Promise.all([
        world.store.storeThumbnail(
          tokenWrite(design, "6", { image: taggedWebp(6) }),
        ),
        world.store.storeThumbnail(
          tokenWrite(design, "7", { image: taggedWebp(7) }),
        ),
        world.store.storeThumbnail(
          tokenWrite(design, "5", { image: taggedWebp(5) }),
        ),
      ]);

      expect(outcomes).toEqual([
        { kind: "stale" },
        { kind: "stored" },
        { kind: "stale" },
      ]);
      expect(await world.heldThumbnail(design.id)).toMatchObject({
        revision: "7",
        tagByte: 7,
      });
    });
  });
}
