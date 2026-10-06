import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

import type { DesignRevision } from "./design-revision.js";
import { generateDesignId } from "./generate-design-id.js";
import { retryOnComputeRestart } from "./retry-on-compute-restart.js";
import { readDatabaseUrl } from "./read-database-url.js";
import { requireSha256Digest } from "./sha256-digest.js";

/* Rows are stamped with the domain's `CURRENT_SCHEMA_VERSION`, never a local copy: it decides which normalisations
 * `migrateDesign` still owes. The read path passes `row.schema_version`, so older stored rows keep loading. */

interface DesignRow {
  schema_version: number;
  document: unknown;
  /** `revision::text`, never the driver's rendering of a `bigint` — see `DesignRevision`. */
  revision: DesignRevision;
}

/** The one row the conditional update returns: `revision` is the new one if this write landed, null if it matched
 *  nothing; `owns_visitor` comes from the same snapshot as the update. */
interface ConditionalUpdateRow {
  is_authorised: boolean;
  revision: DesignRevision | null;
  owns_visitor: boolean;
}

/** A write was refused: the credential does not authorise the design, or no such design exists. The two are
 *  deliberately indistinguishable, or the write endpoint becomes an oracle for which design ids exist. */
export class DesignWriteForbiddenError extends Error {
  constructor(id: DesignId) {
    super(`No writable design matched the supplied credential for id "${id}"`);
    this.name = "DesignWriteForbiddenError";
  }
}

/**
 * The credential matched but the expected revision is stale. Reachable only by a caller already authorised, so it
 * is no oracle: a wrong token or a missing design gets `DesignWriteForbiddenError`, whichever it was.
 */
export class DesignWriteConflictError extends Error {
  constructor(id: DesignId) {
    super(
      `The stored design "${id}" has moved past the revision this write expected`,
    );
    this.name = "DesignWriteConflictError";
  }
}

/** A design row's identity and the revision it now stands at, so the next write knows what to expect. */
export interface DesignVersion {
  readonly id: DesignId;
  readonly revision: DesignRevision;
}

/** A stored design and the revision it was read at: a document without its revision cannot be written back safely. */
export interface StoredDesign {
  readonly design: Design;
  readonly revision: DesignRevision;
}

/** One authorised replacement of a stored design, grouped so the hash cannot be swapped with the id at a call site. */
export interface AuthorizedSave {
  readonly id: DesignId;
  readonly design: Design;
  readonly writeTokenHash: string;
  /** The revision the caller read; the write lands only if the row still carries it. */
  readonly expectedRevision: DesignRevision;
  /** The requester's own visitor value, so `saveAuthorized` can say whether the row it wrote is still theirs. */
  readonly requestVisitor: RequestVisitor;
}

/** The requester's visitor value, tagged so "no cookie" differs from "a value that does not match", without a null. */
export type RequestVisitor =
  | { readonly kind: "present"; readonly visitorHash: string }
  | { readonly kind: "absent" };

/** Whether the request's visitor value is the one now stored on the row, answered by the update's own statement.
 *  A caller refreshes the visitor cookie only when `true`: re-emitting a value another tab's mint rotated away
 *  would lock the browser out of its own designs. */
export interface SaveOutcome extends DesignVersion {
  readonly ownsVisitor: boolean;
}

/** What a mint stores. Grouped so the write-token hash and the visitor value cannot be swapped at a call site
 *  (ADR 0114 decision 5). */
export interface MintDesign {
  readonly design: Design;
  readonly writeTokenHash: string;
  readonly visitor: MintVisitor;
}

/**
 * The visitor value a mint stores, and whether the browser's existing rows move to it (ADR 0114 Amendment H1).
 * A tagged union, so no malformed carried value can be supplied and silently ignored.
 */
export type MintVisitor =
  | { readonly kind: "fresh"; readonly visitorHash: string }
  | {
      readonly kind: "rotate";
      readonly visitorHash: string;
      readonly fromVisitorHash: string;
    };

/**
 * The server-side persistence port: an open read and an authorised write (ADR 0019 decision 1). Production reads go
 * through `OwnedDesignRepository.loadOwned`; `load` stays only for this package's live tests. Not the domain's
 * `ConfigurationRepository`: server-side there is no ambient credential, so an unauthorised update must be
 * unrepresentable rather than merely unused.
 */
export interface AuthorizedConfigurationRepository {
  mint(mint: MintDesign): Promise<DesignVersion>;
  saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome>;
  load(id: DesignId): Promise<StoredDesign>;
}

/** Tagged, not `DesignId | null`, so a caller cannot forget to check. A lookup that fails to run is a rejected
 *  promise, never a third member. */
export type VisitorResumeLookup =
  | { readonly kind: "found"; readonly id: DesignId }
  | { readonly kind: "none" };

/**
 * A second, narrower port, not a fourth method on `AuthorizedConfigurationRepository`: it starts from a visitor hash
 * and learns an id, and folding it in would force every mint/save/load test double to fake a lookup.
 */
export interface VisitorResumeRepository {
  /** The visitor's most recently updated design, or none. `visitorHash` is trusted to be already hashed: a malformed
   *  value matches no row, because `0005`'s check constraint admits nothing else. */
  resumeVisitor(visitorHash: string): Promise<VisitorResumeLookup>;
}

/** `loadOwned`'s argument, grouped so a caller cannot name the id and forget the visitor hash (ADR 0114 H2). */
export interface OwnedDesignLookup {
  readonly id: DesignId;
  readonly visitorHash: string;
}

/** Tagged like `VisitorResumeLookup`, so a caller cannot forget to check which case it got. A foreign row, a
 *  pre-`0005` row (`visitor_hash is null`) and a missing row are all `"none"`: one outcome of one statement, so a
 *  non-owner cannot observe which it was. */
export type LoadOwnedOutcome =
  | {
      readonly kind: "found";
      readonly design: Design;
      readonly revision: DesignRevision;
    }
  | { readonly kind: "none" };

/**
 * The gated read (ADR 0114 Amendment H2): a design is readable only by the browser whose visitor hash the row carries.
 * `migrateDesign` runs only on `found`, so `InvalidDesignError` is reachable by the design's owner alone.
 */
export interface OwnedDesignRepository {
  loadOwned(lookup: OwnedDesignLookup): Promise<LoadOwnedOutcome>;
}

/** `AuthorizedConfigurationRepository` on Neon Postgres. Every query is a tagged-template `sql`, which parameterises
 *  values: nothing here concatenates a value into SQL text. */
export class NeonConfigurationRepository
  implements
    AuthorizedConfigurationRepository,
    VisitorResumeRepository,
    OwnedDesignRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  /**
   * Mints a design row holding the SHA-256 hashes of its write token and owning visitor; neither raw value is stored.
   * When `visitor` carries a value the browser already held, its existing rows move to the fresh one in the same
   * transaction as the insert (ADR 0114 Amendment H1), so a planted value owns nothing after the next mint.
   */
  async mint({
    design,
    writeTokenHash,
    visitor,
  }: MintDesign): Promise<DesignVersion> {
    requireSha256Digest(writeTokenHash, "write-token hash", "mint a design");
    requireVisitorDigests(visitor);
    // Generated outside the retried callback and must stay there: a fresh id per retry would insert a second row
    // when only an acknowledgement was lost.
    const id = generateDesignId();

    const results = (await retryOnComputeRestart(() =>
      this.sql.transaction(
        this.mintStatements(id, design, writeTokenHash, visitor),
        // Pinned (see `NeonShareLinkRepository.issue`): READ COMMITTED lets a rotation racing another mint see the
        // first one's committed move.
        { isolationLevel: "ReadCommitted" },
      ),
    )) as unknown[][];

    // The revision comes from the final `select`, so the migration stays the one place that decides a first revision.
    const selected = results.at(-1) as { revision: DesignRevision }[];
    return { id, revision: revisionOfMintedRow(selected, id) };
  }

  /**
   * The statements `mint` submits as one transaction, in order. Retry-safe under identical arguments: the insert is
   * `on conflict (id) do nothing` and the final `select` reads by id and by the value being minted, so a retry after
   * a lost acknowledgement moves and inserts nothing twice. The rotate branch's `update` touches only `visitor_hash`,
   * leaving `updated_at` for resume order; the fresh branch issues no `UPDATE`.
   */
  private mintStatements(
    id: DesignId,
    design: Design,
    writeTokenHash: string,
    visitor: MintVisitor,
  ) {
    const insert = this.sql`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash}, ${visitor.visitorHash})
      on conflict (id) do nothing
    `;
    const select = this.sql`
      select revision::text as revision from designs
      where id = ${id} and visitor_hash = ${visitor.visitorHash}
    `;
    if (visitor.kind === "fresh") return [insert, select];
    return [
      this.sql`
        update designs set visitor_hash = ${visitor.visitorHash}
        where visitor_hash = ${visitor.fromVisitorHash}
      `,
      insert,
      select,
    ];
  }

  /**
   * Replaces a stored design, with authorisation and the expected revision enforced in the update's own predicate,
   * not by a preceding read: read-then-write opens a time-of-check/time-of-use window, and Postgres compares the
   * hash, so there is no application-side comparison to make timing-safe.
   *
   * `returning revision` makes zero matched rows visible: a bare `update` matching nothing reports success. A row
   * with a NULL `write_token_hash` never matches, so it fails closed.
   *
   * Deliberately no `requireSha256Digest` or `isDesignRevision`, unlike `mint`: a wrong-shaped credential or revision
   * is simply not the right one, and the answer is a refusal, not a crash. The predicate gives that for every shape
   * (`NULL = ''` is NULL), and the revision is compared as text so no caller string can raise a cast error.
   */
  async saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome> {
    const outcome = await this.updateIfCurrent(save);
    if (outcome.revision !== null)
      return {
        id: save.id,
        revision: outcome.revision,
        ownsVisitor: outcome.owns_visitor,
      };
    // Order matters: a conflict is reported only to a caller whose credential matched, so the 409 tells no one else
    // that a design exists.
    if (outcome.is_authorised) throw new DesignWriteConflictError(save.id);
    throw new DesignWriteForbiddenError(save.id);
  }

  /**
   * One statement answers both questions from one snapshot: may this caller write the design, and did the write
   * land. Two statements could turn a genuine conflict into a refusal, or the reverse, if the row changed between.
   *
   * `schema_version` is restamped with the document: the document was produced by this build, and a row left at its
   * minted version would keep asking for an older normalisation arm on every load, so that arm could never be removed.
   * Safe in both directions: a normalised document is a fixed point of every arm below the current version.
   */
  private async updateIfCurrent({
    id,
    design,
    writeTokenHash,
    expectedRevision,
    requestVisitor,
  }: AuthorizedSave): Promise<ConditionalUpdateRow> {
    // `null` for "absent" is safe only here: it reaches no stored column, just the right side of the `coalesce`
    // comparison below, where `= null` answers "no" for every row.
    const requestVisitorHash =
      requestVisitor.kind === "present" ? requestVisitor.visitorHash : null;
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      with authorised as (
        select 1 from designs
        where id = ${id} and write_token_hash = ${writeTokenHash}
      ), updated as (
        update designs
        set document = ${design}, schema_version = ${CURRENT_SCHEMA_VERSION},
            updated_at = now(), revision = revision + 1
        where id = ${id}
          and write_token_hash = ${writeTokenHash}
          and revision::text = ${expectedRevision}
        returning revision, visitor_hash
      )
      select
        exists (select 1 from authorised) as is_authorised,
        (select revision::text from updated) as revision,
        coalesce((select visitor_hash from updated) = ${requestVisitorHash}, false) as owns_visitor
    `,
    )) as ConditionalUpdateRow[];

    const outcome = rows[0];
    if (!outcome)
      throw new Error(
        "The conditional update returned no row at all, which this statement cannot do — the " +
          "database did not run the query this repository sent.",
      );
    return outcome;
  }

  /**
   * The **ungated** read: any id, no credential. No production caller reads through it since ADR 0114 Amendment H2;
   * it stays for the live suites, which need an unfiltered read of the raw row.
   */
  async load(id: DesignId): Promise<StoredDesign> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      select schema_version, document, revision::text as revision
      from designs where id = ${id}
    `,
    )) as DesignRow[];

    const row = rows[0];
    if (!row) throw new DesignNotFoundError(id);

    return {
      design: migrateDesign(row.schema_version, row.document),
      revision: row.revision,
    };
  }

  /**
   * The gated read (ADR 0114 Amendment H2): `id` and `visitorHash` in one predicate, so a foreign row, a pre-`0005`
   * row and a missing row are one outcome. `migrateDesign` runs only on a match. No `requireSha256Digest`: a
   * malformed `visitorHash` matches no row, because `0005`'s check constraint admits nothing else.
   */
  async loadOwned({
    id,
    visitorHash,
  }: OwnedDesignLookup): Promise<LoadOwnedOutcome> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      select schema_version, document, revision::text as revision
      from designs where id = ${id} and visitor_hash = ${visitorHash}
    `,
    )) as DesignRow[];

    const row = rows[0];
    if (!row) return { kind: "none" };

    return {
      kind: "found",
      design: migrateDesign(row.schema_version, row.document),
      revision: row.revision,
    };
  }

  /** Ordered by `updated_at desc, id desc` for a deterministic tie break; served by the partial index
   *  `designs_visitor_hash_updated_at_idx` (`0005`). */
  async resumeVisitor(visitorHash: string): Promise<VisitorResumeLookup> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      select id from designs
      where visitor_hash = ${visitorHash}
      order by updated_at desc, id desc
      limit 1
    `,
    )) as { id: DesignId }[];

    const row = rows[0];
    return row === undefined ? { kind: "none" } : { kind: "found", id: row.id };
  }
}

/** Covers every hash a mint is about to store, whichever `MintVisitor` branch supplied it. */
function requireVisitorDigests(visitor: MintVisitor): void {
  requireSha256Digest(visitor.visitorHash, "visitor hash", "mint a design");
  if (visitor.kind === "rotate")
    requireSha256Digest(
      visitor.fromVisitorHash,
      "visitor hash",
      "mint a design",
    );
}

/** A missing row here is an impossibility, not a domain failure (the insert raised or made exactly one row), so it
 *  throws rather than defaulting to a first revision that this file would then also decide. */
function revisionOfMintedRow(
  rows: readonly { revision: DesignRevision }[],
  id: DesignId,
): DesignRevision {
  const revision = rows[0]?.revision;
  if (revision === undefined)
    throw new Error(
      `Minting design "${id}" found no row for it at the value it was minted under.`,
    );
  return revision;
}
