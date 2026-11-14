import { isDesignThumbnailType } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { isDesignRevision } from "./design-revision.js";
import {
  DesignThumbnailStoreError,
  isWellFormedCredential,
  requireStorableThumbnail,
} from "./design-thumbnail-store.js";
import type {
  DesignThumbnailOperation,
  DesignThumbnailStore,
  OwnThumbnailLookup,
  OwnThumbnailRequest,
  ThumbnailStoreOutcome,
  ThumbnailToStore,
} from "./design-thumbnail-store.js";
import {
  loadOwnThumbnailStatement,
  storeThumbnailStatement,
} from "./design-thumbnail-statements.js";
import { isMintedId } from "./dashboard-store-shapes.js";
import { reducedCauseOf } from "./migration-errors.js";
import type { ReducedCause } from "./migration-errors.js";
import { isMissingGrantOrTable, isRecord } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const STORE: DesignThumbnailOperation = "store a design's thumbnail";
const LOAD: DesignThumbnailOperation = "load an owner's design thumbnail";

const EVEN_LENGTH_LOWERCASE_HEX = /^(?:[0-9a-f]{2})+$/;
const NONE = Object.freeze({ kind: "none" } as const);

/**
 * `DesignThumbnailStore` on Neon Postgres, in `design_thumbnails` (migration `0030`). Every write is one statement, which
 * is idempotent (a repeat of a held revision writes nothing), so a transient failure is retried; a failure is the store
 * error with a built cause and no driver text.
 */
export class NeonDesignThumbnailStore implements DesignThumbnailStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async storeThumbnail(
    thumbnail: ThumbnailToStore,
  ): Promise<ThumbnailStoreOutcome> {
    requireStorableThumbnail(thumbnail);
    const { designId, credential } = thumbnail;
    if (!isMintedId(designId) || !isWellFormedCredential(credential)) {
      return NONE;
    }
    const rows = await this.rowsOf(STORE, () =>
      storeThumbnailStatement(this.sql, {
        designId,
        credential,
        revision: thumbnail.revision,
        imageHex: Buffer.from(thumbnail.image).toString("hex"),
        imageType: thumbnail.type,
      }),
    );
    return outcomeOf(onlyRow(rows, STORE));
  }

  async loadOwnThumbnail({
    accountId,
    designId,
  }: OwnThumbnailRequest): Promise<OwnThumbnailLookup> {
    if (!isMintedId(accountId) || !isMintedId(designId)) return NONE;
    const rows = await this.rowsOf(LOAD, () =>
      loadOwnThumbnailStatement(this.sql, { accountId, designId }),
    );
    if (rows.length === 0) return NONE;
    return foundFrom(onlyRow(rows, LOAD));
  }

  private async rowsOf(
    operation: DesignThumbnailOperation,
    send: () => PromiseLike<unknown>,
  ): Promise<readonly Row[]> {
    let reply: unknown;
    try {
      reply = await retryOnTransientFailure(() => Promise.resolve(send()));
    } catch (failure) {
      throw failureFrom(operation, failure);
    }
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new DesignThumbnailStoreError(operation, "unexpected-answer");
    }
    return Array.from(reply, (row) => ({ ...row }));
  }
}

function failureFrom(
  operation: DesignThumbnailOperation,
  failure: unknown,
): DesignThumbnailStoreError {
  const options = reducedCauseOf(failure);
  const code = (options.cause as ReducedCause | undefined)?.code;
  const kind = isMissingGrantOrTable(code) ? "unavailable" : "database";
  return new DesignThumbnailStoreError(operation, kind, options);
}

function onlyRow(
  rows: readonly Row[],
  operation: DesignThumbnailOperation,
): Row {
  const [row, ...others] = rows;
  if (row === undefined || others.length > 0) {
    throw new DesignThumbnailStoreError(operation, "unexpected-answer");
  }
  return row;
}

/** Stale is told only when the credential matched, so a design's existence is never an answer to a caller without one. */
function outcomeOf(row: Row): ThumbnailStoreOutcome {
  const { is_matched: isMatched, is_current: isCurrent } = row;
  if (typeof isMatched !== "boolean" || typeof isCurrent !== "boolean") {
    throw new DesignThumbnailStoreError(STORE, "unexpected-answer");
  }
  if (!isMatched) return NONE;
  return isCurrent ? { kind: "stored" } : { kind: "stale" };
}

function foundFrom(row: Row): OwnThumbnailLookup {
  const { image_hex: imageHex, image_type: type, revision } = row;
  if (
    typeof imageHex !== "string" ||
    !EVEN_LENGTH_LOWERCASE_HEX.test(imageHex) ||
    !isDesignThumbnailType(type) ||
    typeof revision !== "string" ||
    !isDesignRevision(revision)
  ) {
    throw new DesignThumbnailStoreError(LOAD, "unexpected-answer");
  }
  return {
    kind: "found",
    image: new Uint8Array(Buffer.from(imageHex, "hex")),
    type,
    revision,
  };
}
