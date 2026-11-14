import { checkDesignThumbnail } from "@lemnaria/configurator-domain";
import type { DesignThumbnailType } from "@lemnaria/configurator-domain";

import { isMintedId } from "./dashboard-store-shapes.js";
import { isDesignRevision } from "./design-revision.js";
import type { DesignRevision } from "./design-revision.js";
import type { SaveCredential } from "./neon-configuration-repository.js";
import { isSha256Digest } from "./sha256-digest.js";

export type DesignThumbnailOperation =
  | "store a design's thumbnail"
  | "load an owner's design thumbnail";

/** One picture to keep, for the design it depicts at the revision it depicts. `credential` is the save's own. */
export interface ThumbnailToStore {
  readonly designId: string;
  readonly credential: SaveCredential;
  readonly revision: DesignRevision;
  readonly image: Uint8Array;
  readonly type: DesignThumbnailType;
}

/**
 * `stored`: the table holds a picture of this revision or a later one (a repeat of a revision already held changes
 * nothing). `stale`: the credential matched and the design is at another revision; nothing was written. `none`: anything
 * else, the same answer for an unknown design, a foreign credential, a design with no account and a deleted or hidden one,
 * so no answer tells a caller that a design exists.
 */
export type ThumbnailStoreOutcome =
  | { readonly kind: "stored" }
  | { readonly kind: "stale" }
  | { readonly kind: "none" };

/** The owner's own design: the account is the server's own session's, and no request member names one. */
export interface OwnThumbnailRequest {
  readonly accountId: string;
  readonly designId: string;
}

export type OwnThumbnailLookup =
  | {
      readonly kind: "found";
      readonly image: Uint8Array;
      readonly type: DesignThumbnailType;
      readonly revision: DesignRevision;
    }
  | { readonly kind: "none" };

/**
 * The pictures on kitchen cards, in `design_thumbnails` (migration `0030`). The grant is `SELECT`, `INSERT`, `DELETE` and
 * `UPDATE` of four named columns, and the client's delete of a kitchen removes its picture in the delete statement itself
 * (`AccountKitchenStore.markDeleted`).
 */
export interface DesignThumbnailStore {
  /** Rejects with `invalid-request` before any statement for a revision, image or type the table would refuse. */
  storeThumbnail(thumbnail: ThumbnailToStore): Promise<ThumbnailStoreOutcome>;
  /** The picture of a kitchen its account owns, neither hidden nor deleted. A malformed id matches nothing. */
  loadOwnThumbnail(request: OwnThumbnailRequest): Promise<OwnThumbnailLookup>;
}

/**
 * `unavailable`: the table or the grant is missing (42P01, 42501), which a route answers 503. `invalid-request`: the
 * store refused before any statement. `unexpected-answer`: the reply is not what the statement names. `database`: any
 * other failure.
 */
export type DesignThumbnailStoreFailure =
  | "unavailable"
  | "invalid-request"
  | "unexpected-answer"
  | "database";

/** Its message is fixed text and holds no id, image or driver text; its `cause`, when present, is a `ReducedCause`. */
export class DesignThumbnailStoreError extends Error {
  readonly operation: DesignThumbnailOperation;
  readonly failure: DesignThumbnailStoreFailure;

  constructor(
    operation: DesignThumbnailOperation,
    failure: DesignThumbnailStoreFailure,
    options?: ErrorOptions,
  ) {
    super(
      `The design thumbnail store could not ${operation}: ${failure}.`,
      options,
    );
    this.name = "DesignThumbnailStoreError";
    this.operation = operation;
    this.failure = failure;
  }
}

/**
 * Whether the credential is of a shape that can match a row at all. A wrong-shaped credential, or one of a kind this
 * store does not know, is simply not the right one: the answer is `none`, never a crash (the save's rule).
 */
export function isWellFormedCredential(credential: SaveCredential): boolean {
  switch (credential.kind) {
    case "write-token":
      return isSha256Digest(credential.hash);
    case "account":
      return isMintedId(credential.accountId);
    default:
      return false;
  }
}

/**
 * Refuses, with `invalid-request` and before any statement, what the table would refuse and any picture the domain's
 * `checkDesignThumbnail` refuses (type, size cap, magic number, capture size, not animated): a second guard behind the
 * route's own check.
 */
export function requireStorableThumbnail(
  thumbnail: Pick<ThumbnailToStore, "revision" | "image" | "type">,
): void {
  if (!isStorableThumbnail(thumbnail)) {
    throw new DesignThumbnailStoreError(
      "store a design's thumbnail",
      "invalid-request",
    );
  }
}

function isStorableThumbnail(
  thumbnail: Pick<ThumbnailToStore, "revision" | "image" | "type">,
): boolean {
  return (
    isDesignRevision(thumbnail.revision) &&
    checkDesignThumbnail(thumbnail.type, thumbnail.image).kind === "accepted"
  );
}
