import type { DesignThumbnailType } from "@lemnaria/configurator-domain";

import { isMintedId } from "./dashboard-store-shapes.js";
import type { DesignRevision } from "./design-revision.js";
import {
  isWellFormedCredential,
  requireStorableThumbnail,
} from "./design-thumbnail-store.js";
import type {
  DesignThumbnailStore,
  OwnThumbnailLookup,
  OwnThumbnailRequest,
  ThumbnailStoreOutcome,
  ThumbnailToStore,
} from "./design-thumbnail-store.js";

/** A `designs` row as far as a picture's write and read see it. */
export interface SeededThumbnailDesign {
  readonly id: string;
  /** The design's current revision. Defaults to `"1"`, as a minted design starts. */
  readonly revision?: DesignRevision | undefined;
  /** Absent for a design no account has claimed. */
  readonly accountId?: string | undefined;
  /** The hash the write-token arm compares. Absent for a row with no token. */
  readonly writeTokenHash?: string | undefined;
  readonly isHidden?: boolean | undefined;
  readonly isDeleted?: boolean | undefined;
}

export interface HeldThumbnail {
  readonly revision: DesignRevision;
  readonly image: Uint8Array;
  readonly type: DesignThumbnailType;
}

interface HeldDesign {
  revision: DesignRevision;
  readonly accountId: string | undefined;
  readonly writeTokenHash: string | undefined;
  isHidden: boolean;
  isDeleted: boolean;
}

/**
 * In-memory `DesignThumbnailStore` with `NeonDesignThumbnailStore`'s contract: one row per design; a write only for a
 * design that has an account and is neither hidden nor deleted, to a credential that matches it, at the revision the
 * design is at; `stale` told only to a matched credential; an existing row replaced only by a greater revision. The
 * Neon statement is one atomic statement and each method here finishes before the next starts. It cannot stand for a
 * write racing a delete. `deleteFor` is what the client's delete statement does to the row in the same statement.
 */
export class FakeDesignThumbnailStore implements DesignThumbnailStore {
  private readonly designs = new Map<string, HeldDesign>();
  private readonly thumbnails = new Map<string, HeldThumbnail>();

  /** Test setup: plants a design, replacing any with the same id. */
  seedDesign(design: SeededThumbnailDesign): void {
    this.designs.set(design.id, {
      revision: design.revision ?? "1",
      accountId: design.accountId,
      writeTokenHash: design.writeTokenHash,
      isHidden: design.isHidden ?? false,
      isDeleted: design.isDeleted ?? false,
    });
  }

  /** Test setup: a save moved the design to this revision. */
  setRevision(designId: string, revision: DesignRevision): void {
    this.designOf(designId).revision = revision;
  }

  /** Test setup: the client hid or deleted the design. */
  mark(
    designId: string,
    marks: { isHidden?: boolean | undefined; isDeleted?: boolean | undefined },
  ) {
    const design = this.designOf(designId);
    design.isHidden = marks.isHidden ?? design.isHidden;
    design.isDeleted = marks.isDeleted ?? design.isDeleted;
  }

  /** Test setup: a row written around the store, as the owner credential could. */
  plant(designId: string, thumbnail: HeldThumbnail): void {
    this.thumbnails.set(designId, copyOf(thumbnail));
  }

  /** Test reading: the row as held, whatever the design's marks. */
  held(designId: string): HeldThumbnail | undefined {
    const thumbnail = this.thumbnails.get(designId);
    return thumbnail === undefined ? undefined : copyOf(thumbnail);
  }

  /**
   * What the client's delete statement does to the design it marks, in the same step: the design is marked deleted and
   * its picture removed. For `FakeAccountKitchenStore`'s `deleteThumbnailOf`; `hideThumbnailOf` is `mark(id, { isHidden:
   * true })`, which keeps the picture.
   */
  deleteFor(designId: string): void {
    const design = this.designs.get(designId);
    // markDeleted may run on a kitchen this fake was never seeded with, so an unknown id is not an error here.
    if (design !== undefined) design.isDeleted = true;
    this.thumbnails.delete(designId);
  }

  storeThumbnail(thumbnail: ThumbnailToStore): Promise<ThumbnailStoreOutcome> {
    return settle(() => this.store(thumbnail));
  }

  loadOwnThumbnail(request: OwnThumbnailRequest): Promise<OwnThumbnailLookup> {
    return settle(() => this.loadOwn(request));
  }

  private store(thumbnail: ThumbnailToStore): ThumbnailStoreOutcome {
    requireStorableThumbnail(thumbnail);
    const { designId, credential } = thumbnail;
    if (!isMintedId(designId) || !isWellFormedCredential(credential)) {
      return NONE;
    }
    const design = this.authorisedDesign(designId, credential);
    if (design === undefined) return NONE;
    if (design.revision !== thumbnail.revision) return { kind: "stale" };
    this.replaceIfNewer(designId, thumbnail);
    return { kind: "stored" };
  }

  private authorisedDesign(
    designId: string,
    credential: ThumbnailToStore["credential"],
  ): HeldDesign | undefined {
    const design = this.designs.get(designId);
    if (design?.accountId === undefined) return undefined;
    if (isMarkedAway(design)) return undefined;
    return matchesCredential(design, credential) ? design : undefined;
  }

  private replaceIfNewer(designId: string, thumbnail: ThumbnailToStore): void {
    const held = this.thumbnails.get(designId);
    const isNewer =
      held === undefined ||
      isGreaterRevision(thumbnail.revision, held.revision);
    if (!isNewer) return;
    this.thumbnails.set(
      designId,
      copyOf({
        revision: thumbnail.revision,
        image: thumbnail.image,
        type: thumbnail.type,
      }),
    );
  }

  private loadOwn({
    accountId,
    designId,
  }: OwnThumbnailRequest): OwnThumbnailLookup {
    if (!isMintedId(accountId) || !isMintedId(designId)) return NONE;
    const design = this.designs.get(designId);
    const thumbnail = this.thumbnails.get(designId);
    const isOwnAndListed =
      design?.accountId === accountId && !isMarkedAway(design);
    if (thumbnail === undefined || !isOwnAndListed) return NONE;
    return { kind: "found", ...copyOf(thumbnail) };
  }

  private designOf(designId: string): HeldDesign {
    const design = this.designs.get(designId);
    if (design === undefined) {
      throw new Error("The test seeded no design under that id.");
    }
    return design;
  }
}

const NONE = Object.freeze({ kind: "none" } as const);

function isMarkedAway(design: HeldDesign): boolean {
  return design.isHidden || design.isDeleted;
}

function matchesCredential(
  design: HeldDesign,
  credential: ThumbnailToStore["credential"],
): boolean {
  switch (credential.kind) {
    case "write-token":
      return design.writeTokenHash === credential.hash;
    case "account":
      return design.accountId === credential.accountId;
    default:
      return false;
  }
}

function copyOf(thumbnail: HeldThumbnail): HeldThumbnail {
  return { ...thumbnail, image: Uint8Array.from(thumbnail.image) };
}

function settle<Outcome>(compute: () => Outcome): Promise<Outcome> {
  try {
    return Promise.resolve(compute());
  } catch (failure) {
    return Promise.reject(
      failure instanceof Error ? failure : new Error("Unknown failure"),
    );
  }
}

/** A revision is a digit run with no leading zero, so the longer one is greater and equal lengths compare as text. */
function isGreaterRevision(
  revision: DesignRevision,
  than: DesignRevision,
): boolean {
  if (revision.length !== than.length) return revision.length > than.length;
  return revision > than;
}
