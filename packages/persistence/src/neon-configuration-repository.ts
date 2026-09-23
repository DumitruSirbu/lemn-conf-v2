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

/* `CURRENT_SCHEMA_VERSION` is the version every row this adapter writes is stamped with, and it is
 * imported from the domain rather than restated here: it is the same number that decides which
 * normalisations `migrateDesign` still owes a row, and two copies of it that drifted apart would be
 * a migration that silently stopped running. The read path never assumes it — it passes
 * `row.schema_version`, which is what lets a stored older row go on loading. */

interface DesignRow {
  schema_version: number;
  document: unknown;
  /** `revision::text`, never the driver's rendering of a `bigint` — see `DesignRevision`. */
  revision: DesignRevision;
}

/** The single row the conditional update returns, whatever it decided. `revision` is the **new**
 *  one when this write is the one that landed, and null when it matched nothing. `owns_visitor` is
 *  Amendment H3's answer, from the same snapshot as the update. */
interface ConditionalUpdateRow {
  is_authorised: boolean;
  revision: DesignRevision | null;
  owns_visitor: boolean;
}

/** A write was refused: the supplied credential does not authorise the named design, or no such
 *  design exists. The two cases are **deliberately indistinguishable** — the conditional update
 *  cannot tell them apart, and a caller must not be able to either, or the write endpoint becomes
 *  an oracle for which design ids exist (ADR 0019 decision 1). */
export class DesignWriteForbiddenError extends Error {
  constructor(id: DesignId) {
    super(`No writable design matched the supplied credential for id "${id}"`);
    this.name = "DesignWriteForbiddenError";
  }
}

/**
 * A write was refused because the design has moved on: the credential is the right one, and the
 * revision it expected is not the revision the row now carries (WEB-003).
 *
 * **Separate from `DesignWriteForbiddenError`, and reachable only by a caller whose credential
 * already matched.** That is what keeps the pair from becoming an oracle: a caller holding the
 * wrong token — or naming a design that does not exist — gets the forbidden refusal for both, as it
 * always did, and can never tell which. Learning "this design exists and you are stale" therefore
 * requires already having proved you may write it, which discloses nothing to anyone else.
 */
export class DesignWriteConflictError extends Error {
  constructor(id: DesignId) {
    super(
      `The stored design "${id}" has moved past the revision this write expected`,
    );
    this.name = "DesignWriteConflictError";
  }
}

/** A design row's identity and the revision it now stands at — what a mint and a successful save
 *  each answer, so the next write knows what to expect. */
export interface DesignVersion {
  readonly id: DesignId;
  readonly revision: DesignRevision;
}

/** A stored design and the revision it was read at. The two travel together because a document
 *  without the revision it came from cannot be written back safely. */
export interface StoredDesign {
  readonly design: Design;
  readonly revision: DesignRevision;
}

/** One authorised replacement of a stored design. Grouped rather than passed as three positional
 *  arguments so the hash can never be swapped with the id at a call site. */
export interface AuthorizedSave {
  readonly id: DesignId;
  readonly design: Design;
  readonly writeTokenHash: string;
  /** The revision the caller read this design at. The write lands only if the row still carries
   *  it — see `saveAuthorized`. */
  readonly expectedRevision: DesignRevision;
  /** The requester's own visitor value, so `saveAuthorized` can answer whether the row it just
   *  wrote is still the one this browser owns (M7 wave 7E3b D3 / Amendment H3). */
  readonly requestVisitor: RequestVisitor;
}

/** The requester's visitor value for a save — a tagged union rather than a nullable field, so "no
 *  cookie" is a distinct case from "a value that happens not to match" instead of a `null` this
 *  file would have to accept and guard against (this package's own no-null convention; the same
 *  shape `VisitorResumeLookup` uses). */
export type RequestVisitor =
  | { readonly kind: "present"; readonly visitorHash: string }
  | { readonly kind: "absent" };

/** What a successful save answers beyond `DesignVersion` (Amendment H3): whether the request's own
 *  visitor value is the one now stored on the row. A caller refreshes the visitor cookie only when
 *  this is `true` — a value already rotated away by another tab's mint must never be re-emitted, or
 *  the browser would be locked out of every design it owns. Answered by the same statement as the
 *  update, never a second query. */
export interface SaveOutcome extends DesignVersion {
  readonly ownsVisitor: boolean;
}

/** What a mint stores: the design, the write-token hash that will authorise editing it, and the
 *  visitor value that will own it (ADR 0114 decision 5). Grouped rather than passed as three
 *  positional arguments so the write-token hash and the visitor value can never be swapped with
 *  each other at a call site (M7 wave 7E3a D2). */
export interface MintDesign {
  readonly design: Design;
  readonly writeTokenHash: string;
  readonly visitor: MintVisitor;
}

/**
 * The visitor value a mint stores, and whether the browser's existing rows move to it (ADR 0114
 * Amendment H1, the owner's ruling "Rotate on mint"). A tagged union rather than an optional
 * "old hash" field (Amendment H1's own port note): mint either knows there is nothing to move
 * — `"fresh"` — or knows exactly what to move it from — `"rotate"` — and a caller cannot supply a
 * malformed carried value and have it silently ignored, because there is no shape here for one to
 * occupy.
 */
export type MintVisitor =
  | { readonly kind: "fresh"; readonly visitorHash: string }
  | {
      readonly kind: "rotate";
      readonly visitorHash: string;
      readonly fromVisitorHash: string;
    };

/**
 * The server-side persistence port, split by ADR 0019 decision 1 into an open read and an
 * authorised write. **The open read is no longer what a production caller reaches** — since ADR
 * 0114 Amendment H2 (M7 wave 7E3b) a design opens only in its owning browser, and
 * `OwnedDesignRepository.loadOwned` below is the gate that enforces it; `load` stays on this
 * interface only for this package's own live tests, which need an unfiltered read to assert
 * against the raw row (see its own doc comment).
 *
 * Deliberately **not** the domain's `ConfigurationRepository`: that interface's `save(id, design)`
 * carries no credential and is what the browser client implements over `fetch`, where the cookie
 * supplies the credential instead. Server-side there is no ambient credential, so an unauthorised
 * update must be unrepresentable rather than merely unused.
 */
export interface AuthorizedConfigurationRepository {
  mint(mint: MintDesign): Promise<DesignVersion>;
  saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome>;
  load(id: DesignId): Promise<StoredDesign>;
}

/** What `resumeVisitor` answers — tagged rather than `DesignId | null`, so a caller cannot forget
 *  to check which one it got (the same reasoning `ReadDesignOutcome`-shaped types use elsewhere in
 *  this codebase). Never a driver error: a lookup that fails to run is a rejected promise, not a
 *  third member here. */
export type VisitorResumeLookup =
  | { readonly kind: "found"; readonly id: DesignId }
  | { readonly kind: "none" };

/**
 * A second, narrower port beside `AuthorizedConfigurationRepository` — deliberately not a fourth
 * method on it (M7 wave 7E3a D3). Resume is neither the open read nor the authorised write ADR 0019
 * decision 1 splits that interface into: it takes a visitor hash instead of a design id or a write
 * credential, and it is the only place with the shape "starting from a hash, learn an id". Folding
 * it into `AuthorizedConfigurationRepository` would force every existing test double for mint/save/
 * load — about 16 of them — to also fake a lookup their own tests never exercise.
 */
export interface VisitorResumeRepository {
  /** D3's query: the visitor's most recently updated design, or none. `visitorHash` is expected
   *  already hashed and well-formed — this method runs the query as given and trusts the caller's
   *  shape check, the same division of labour `saveAuthorized` draws with its own credential (no
   *  `requireSha256Digest` here): a malformed value simply matches no row, because the column's own
   *  check constraint (`0005`) admits nothing else, so there is no unsafe shape for this SELECT to
   *  guard against. */
  resumeVisitor(visitorHash: string): Promise<VisitorResumeLookup>;
}

/** `loadOwned`'s argument: the id and the visitor hash it must be read alongside (ADR 0114
 *  Amendment H2), grouped so a caller cannot name one and forget the other. */
export interface OwnedDesignLookup {
  readonly id: DesignId;
  readonly visitorHash: string;
}

/** What `loadOwned` answers — tagged for `VisitorResumeLookup`'s own reason: a caller cannot forget
 *  to check which case it got. A foreign row, a pre-`0005` row (`visitor_hash is null`) and a
 *  missing row are all `"none"` — one outcome of one statement, so nothing about which of the three
 *  it was is observable to a caller that does not already own the row. */
export type LoadOwnedOutcome =
  | {
      readonly kind: "found";
      readonly design: Design;
      readonly revision: DesignRevision;
    }
  | { readonly kind: "none" };

/**
 * The gated read (ADR 0114 Amendment H2): a design is readable only by the browser whose visitor
 * hash the row carries. Deliberately not a fourth method on `AuthorizedConfigurationRepository`,
 * for `VisitorResumeRepository`'s own reason (M7 wave 7E3a D3) — this asks a different question,
 * from a different starting shape, than the read every existing mint/save/load double already
 * fakes.
 *
 * `migrateDesign` runs only on `found`, so `InvalidDesignError` is reachable by the design's owner
 * alone: a foreign row holding an invalid document answers `none`, the same as a row that does not
 * exist, and is never migrated or validated on that caller's behalf.
 */
export interface OwnedDesignRepository {
  loadOwned(lookup: OwnedDesignLookup): Promise<LoadOwnedOutcome>;
}

/** `AuthorizedConfigurationRepository` backed by Neon Postgres. Every query uses
 *  `@neondatabase/serverless`'s tagged-template `sql`, which parameterises interpolated values by
 *  construction — no query in this file concatenates a value into SQL text. */
export class NeonConfigurationRepository
  implements
    AuthorizedConfigurationRepository,
    VisitorResumeRepository,
    OwnedDesignRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`. It is passed explicitly only by the live tests,
   *  which must target their own database rather than the application's. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  /**
   * Mints a new design row holding the SHA-256 hash of its write token and of the visitor that
   * owns it (ADR 0114 decision 5). Neither raw value is ever stored, so a database leak yields
   * read access and nothing more.
   *
   * **Rotation (Amendment H1, the owner's ruling "Rotate on mint").** When `visitor` carries a
   * well-formed value the browser already held, every row under that value's hash moves to the
   * fresh one in the same transaction as the insert — a planted value therefore owns nothing after
   * the next mint, and it is `HttpOnly`, so no script ever learns the new one. `mintStatements`
   * lays out the one to three statements this runs; see it for the retry argument.
   */
  async mint({
    design,
    writeTokenHash,
    visitor,
  }: MintDesign): Promise<DesignVersion> {
    requireSha256Digest(writeTokenHash, "write-token hash", "mint a design");
    requireVisitorDigests(visitor);
    // **The id is generated here, outside the retried callback, and must stay there.** A retry that
    // minted a fresh id each attempt would insert a second row for a write the customer made once,
    // whenever an acknowledgement is lost rather than the query refused.
    const id = generateDesignId();

    const results = (await retryOnComputeRestart(() =>
      this.sql.transaction(
        this.mintStatements(id, design, writeTokenHash, visitor),
        // Pinned per `NeonShareLinkRepository.issue`'s own doc comment (SEC-7E3c.4): Postgres's own
        // default, made explicit so it cannot drift under this method without a reviewer seeing the
        // line change. READ COMMITTED is what lets a rotation racing another mint see the first
        // one's committed move rather than a snapshot fixed before it.
        { isolationLevel: "ReadCommitted" },
      ),
    )) as unknown[][];

    // The revision comes back from the final `select`, never asserted here, so the one place that
    // decides what a first revision is remains the migration.
    const selected = results.at(-1) as { revision: DesignRevision }[];
    return { id, revision: revisionOfMintedRow(selected, id) };
  }

  /**
   * The statements `mint` submits as one transaction, in order.
   *
   * **Why this shape is retry-safe under identical arguments (G6), for both branches.** The insert
   * takes `on conflict (id) do nothing` rather than the plain insert a first version of this method
   * used, and the final `select` reads the row back by id **and** by the value this attempt is
   * minting — so a retry after a lost acknowledgement moves nothing a first attempt already moved,
   * inserts nothing a first attempt already inserted, and the `select` still finds the row either
   * way. `revisionOfMintedRow` then reports the same revision on every attempt.
   *
   * **The rotate branch's `update` moves the browser's existing rows first, and touches no column
   * but `visitor_hash`** — `updated_at` and every other column are exactly what D3's resume order
   * and retention accounting already assume. **The fresh branch issues no `UPDATE` at all**
   * (Amendment H1): there is nothing to move for an absent, empty or malformed carried value.
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
   * Replaces a stored design, with authorisation **and** the caller's expected revision enforced
   * inside the same statement as the update.
   *
   * The predicate — not a preceding `verify()` — is the security control. A separate read-then-write
   * opens a time-of-check/time-of-use window in which the row's token can change between the two
   * statements. It also means the hash is compared by Postgres rather than in application code, so
   * there is no comparison here to make timing-safe. Since WEB-003 the same argument covers the
   * revision: a read to decide whether the caller is current, followed by a write, is precisely the
   * window that let two tabs both believe they had saved.
   *
   * `returning revision` is what makes zero matched rows visible: a bare `update` matching no row
   * reports success, so an unauthorised, unknown or stale write would silently persist nothing while
   * the caller believed the design was saved. A row whose `write_token_hash` is NULL — minted before
   * ADR 0019 — never satisfies the predicate, and so fails closed.
   *
   * Deliberately **no** `requireSha256Digest` here, unlike `mint`, and for the same reason no
   * `isDesignRevision` either. The two methods are asked different questions. `mint` decides what may
   * be *stored*, and a degenerate value stored is a row anyone can write, so it is a programmer error
   * and throws. `saveAuthorized` is handed a credential and an expectation by a caller, and either
   * one being the wrong shape is simply not the right one — the honest answer is a refusal, not a
   * crash. The predicate already gives that answer for every shape, including `''`, because `mint`'s
   * guard means no stored hash is empty and `NULL = ''` is NULL; the revision is compared as text
   * for the same reason, so no caller-supplied string can raise a cast error out of this statement.
   */
  async saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome> {
    const outcome = await this.updateIfCurrent(save);
    if (outcome.revision !== null)
      return {
        id: save.id,
        revision: outcome.revision,
        ownsVisitor: outcome.owns_visitor,
      };
    // Order matters: a conflict is only ever reported to a caller whose credential matched, so the
    // 409 this becomes cannot tell anyone else that a design exists.
    if (outcome.is_authorised) throw new DesignWriteConflictError(save.id);
    throw new DesignWriteForbiddenError(save.id);
  }

  /**
   * One statement that answers both questions from one snapshot: may this caller write the design
   * at all, and did the write land.
   *
   * Two statements would be wrong here rather than merely slower. Asking "was the token valid?"
   * after a failed update reads the row a second time, so a design deleted or re-credentialed in
   * between would turn a genuine conflict into a refusal or the reverse. The CTEs share one
   * snapshot, so the pair of answers is always about one state of the row.
   *
   * `schema_version` is restamped with the document, and that is what retires a version. The
   * document written here was produced by this build, so a row left stamped with the version it was
   * minted under would say a document was written under a rule it was not — and an older arm could
   * never be removed, because a row it had already normalised would ask for it again on every load.
   * Safe in both directions: a normalised document is a fixed point of every arm below the current
   * version, so a row half-way through such a change loads identically whichever stamp it carries.
   */
  private async updateIfCurrent({
    id,
    design,
    writeTokenHash,
    expectedRevision,
    requestVisitor,
  }: AuthorizedSave): Promise<ConditionalUpdateRow> {
    // `null` for "absent" is safe here and nowhere else in this file: it never reaches a stored
    // column, only the right-hand side of the `coalesce(... , false)` comparison below, where
    // Postgres's `= null` already answers "no" for every row — including one whose own
    // `visitor_hash` is null (D4's untouched-column case would otherwise be ambiguous).
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
   * The **ungated** read: any id, no credential. Since ADR 0114 Amendment H2 (M7 wave 7E3b) no
   * production caller reads through this method any more — `GET /api/designs/{id}` and
   * `/[locale]/d/{id}` both read through `loadOwned`, and `/s/{token}` reads through
   * `ShareLinkRepository.loadShared`, neither of which names an id to the caller. `load` stays on
   * this class only because the persistence package's own live suites need an unfiltered read to
   * assert against the raw row.
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
   * The gated read (ADR 0114 Amendment H2): `id` **and** `visitorHash` in one predicate, so a
   * foreign row, a pre-`0005` row (`visitor_hash is null`) and a missing row are one outcome —
   * `"none"` — of one statement. `migrateDesign` runs only when a row actually matched, which is
   * what keeps a stranger from ever triggering `InvalidDesignError` for a document they cannot
   * read.
   *
   * No `requireSha256Digest` here, for `resumeVisitor`'s own reason: a malformed `visitorHash`
   * simply matches no row, because `0005`'s check constraint admits nothing else, so there is no
   * unsafe shape for this SELECT to guard against.
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

  /** D3's resume query, unchanged from the plan: ordered by `updated_at desc, id desc` so the tie
   *  break is deterministic, and answered by `designs_visitor_hash_updated_at_idx` (`0005`) rather
   *  than a scan — the index carries exactly these three columns in this order, in a partial index
   *  that already excludes the rows this query could never match (`visitor_hash is not null`). */
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

/** `mintStatements`'s guard: `requireSha256Digest` covers every hash a mint is about to store,
 *  whichever branch of `MintVisitor` supplied it (ADR 0114 Amendment H1's port note). */
function requireVisitorDigests(visitor: MintVisitor): void {
  requireSha256Digest(visitor.visitorHash, "visitor hash", "mint a design");
  if (visitor.kind === "rotate")
    requireSha256Digest(
      visitor.fromVisitorHash,
      "visitor hash",
      "mint a design",
    );
}

/** The revision `mintStatements`'s final `select` must have found. A missing row here is not a
 *  domain failure a caller can act on — the insert this attempt or an earlier retried one made
 *  either raised or produced exactly one row the select can see — so it is reported as the
 *  impossibility it is rather than defaulted to a first revision this file would then be the second
 *  place to decide. */
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
