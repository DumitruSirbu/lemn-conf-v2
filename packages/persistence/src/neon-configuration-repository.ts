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

/** `G` (ADR 0114 Amendment H4): a second mint from the same carried value, sent this soon after the
 *  first one's response, converges on the first one's rotated hash instead of drawing a fresh,
 *  unrelated identity. Chosen at roughly 30 times a slow round trip [S5-R2, inference]; QA's own
 *  measurement of the spread is the evidence, not this comment. */
const CONVERGENCE_WINDOW_SECONDS = 10;

/** `2G`: the window `mintStatements`'s own condition (b) searches for the *earliest* row under a
 *  converged hash, so a later joiner's own insert can never push that earliest row's timestamp
 *  forward and re-open a window that has already closed. */
const CONVERGENCE_LOOKBACK_SECONDS = CONVERGENCE_WINDOW_SECONDS * 2;

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
 * The visitor value(s) a mint may store (ADR 0114 Amendment H1, refined by **Amendment H4, the
 * owner's ruling "Conditional HMAC"**). A tagged union rather than an optional "old hash" field
 * (Amendment H1's own port note): mint either knows there is nothing to converge — `"fresh"` — or
 * offers **two** candidates for `"rotate"`, never one.
 *
 * **Why two candidates.** A carried value `O` resolves to `N_det = HMAC(secret, O)` so that
 * concurrent mints from the same browser converge on one value — but only when the repository's own
 * statement finds a genuine convergence (condition (a)/(b) below), never merely because a caller
 * *presented* `O`. Presenting `O` is something anyone who read it off a planted cookie can do, so
 * the choice between `N_det` and the random `N_rand` has to be made **inside** the statement that
 * already holds the database's own snapshot — a caller-side choice would let a planted value's
 * presenter claim its owner's rows (backlog 81, reopened). `mintStatements` is where that choice is
 * made; see it for the (a)/(b) condition and for how `fromVisitorHash` is used to move rows only
 * when the condition holds.
 */
export type MintVisitor =
  | { readonly kind: "fresh"; readonly visitorHash: string }
  | {
      readonly kind: "rotate";
      readonly detVisitorHash: string;
      readonly randVisitorHash: string;
      readonly fromVisitorHash: string;
    };

/** What a mint answers beyond {@link DesignVersion}: the visitor hash the statement actually
 *  stored (ADR 0114 Amendment H4). For `"fresh"` this is always the one hash offered; for
 *  `"rotate"` it is whichever of `detVisitorHash`/`randVisitorHash` the repository's own
 *  convergence condition chose — the caller cannot know which in advance, and must look up the
 *  matching preimage by this hash to emit the right `Set-Cookie` value. */
export interface MintOutcome extends DesignVersion {
  readonly visitorHash: string;
}

/**
 * The server-side persistence port, split by ADR 0019 decision 1 into an open read and an
 * authorised write.
 *
 * Deliberately **not** the domain's `ConfigurationRepository`: that interface's `save(id, design)`
 * carries no credential and is what the browser client implements over `fetch`, where the cookie
 * supplies the credential instead. Server-side there is no ambient credential, so an unauthorised
 * update must be unrepresentable rather than merely unused.
 */
export interface AuthorizedConfigurationRepository {
  mint(mint: MintDesign): Promise<MintOutcome>;
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
   * **Rotation (Amendment H1, refined by Amendment H4's "Conditional HMAC").** When `visitor`
   * offers two candidates, `mintStatements`'s own statement decides — from its own snapshot,
   * never from anything this method or its caller assumes — whether this mint converges with the
   * browser's earlier one or gets a fresh, unrelated identity; see `mintStatements` for the
   * condition. Either way the browser's rows it *does* move stay reachable under whichever value
   * won, and a planted value that owns nothing never converges, so it owns nothing after the next
   * mint either.
   *
   * **The caller cannot know which candidate was stored until this method returns** — that is what
   * `MintOutcome.visitorHash` is for.
   */
  async mint({
    design,
    writeTokenHash,
    visitor,
  }: MintDesign): Promise<MintOutcome> {
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
        // one's committed move (or insert) rather than a snapshot fixed before it — the same
        // property H4's convergence condition depends on.
        { isolationLevel: "ReadCommitted" },
      ),
    )) as unknown[][];

    // The revision and the stored hash both come back from the final `select`, never asserted
    // here, so the one place that decides what a first revision is remains the migration, and the
    // one place that decides which candidate converged remains `mintStatements`'s own statement.
    const selected = results.at(-1) as {
      revision: DesignRevision;
      visitor_hash: string;
    }[];
    const row = mintedRow(selected, id);
    return { id, revision: row.revision, visitorHash: row.visitor_hash };
  }

  /**
   * The statements `mint` submits as one transaction, in order.
   *
   * **The `"fresh"` branch is unchanged since Amendment H1:** insert, then select back by id and
   * the one hash offered. **Why this shape is retry-safe under identical arguments (G6):** the
   * insert takes `on conflict (id) do nothing`, and the select reads the row back by id **and** by
   * the value this attempt is minting — so a retry after a lost acknowledgement inserts nothing a
   * first attempt already inserted, and the select still finds the row either way.
   *
   * **The `"rotate"` branch is two statements (Amendment H4), not the three-statement transaction
   * H1 shipped with.** The first is one `with` block holding the whole convergence decision, the
   * move and the insert — it has to be one statement, or a second mint's own decision could read a
   * snapshot the first mint's move has already changed underneath it. The second reads the result
   * back. **They cannot be merged into one statement:** every part of a single query — CTEs and
   * primary statement alike — shares the one snapshot taken when that query starts, so a plain
   * `select` against `designs` inside the *same* statement as the insert cannot see that insert's
   * own row (Postgres makes a data-modifying CTE's output visible only by name, e.g. `returning`,
   * never by re-scanning the table it wrote to, from within that one statement). A second statement
   * does not have that problem: under READ COMMITTED each statement in a transaction takes a fresh
   * snapshot, and that snapshot sees every write the transaction's own earlier statements already
   * made, committed or not.
   * - `decision` answers whether `fromVisitorHash` **(a)** owns a row right now, or **(b)** the
   *   earliest row under `detVisitorHash` created in the last {@link CONVERGENCE_LOOKBACK_SECONDS}
   *   was created no more than {@link CONVERGENCE_WINDOW_SECONDS} ago — `G`, measured from the
   *   *first* rotation, which a later join cannot extend because `min()` over the window stays
   *   pinned at that first row.
   * - `moved` runs the same `update` H1's rotate branch always ran, gated on the decision: when
   *   neither (a) nor (b) holds there is nothing under `fromVisitorHash` worth moving anyway,
   *   because (a) is exactly "it owns a row".
   * - `inserted` stores the new design under `detVisitorHash` when the decision holds, or under
   *   `randVisitorHash` otherwise — `on conflict (id) do nothing`, for the same retry argument as
   *   the fresh branch.
   * - The second statement does **not** re-read the decision. It finds the row by id and **either**
   *   candidate hash, so a retry that would recompute a different decision (because the first
   *   attempt's own `moved` already changed what (a) sees) still finds the row the first attempt
   *   actually landed on, and reports its true hash rather than this attempt's guess.
   */
  private mintStatements(
    id: DesignId,
    design: Design,
    writeTokenHash: string,
    visitor: MintVisitor,
  ) {
    if (visitor.kind === "fresh") {
      return [
        this.sql`
          insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
          values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash}, ${visitor.visitorHash})
          on conflict (id) do nothing
        `,
        this.sql`
          select revision::text as revision, visitor_hash from designs
          where id = ${id} and visitor_hash = ${visitor.visitorHash}
        `,
      ];
    }

    const { detVisitorHash, randVisitorHash, fromVisitorHash } = visitor;
    return [
      this.sql`
        with decision as (
          select
            exists (
              select 1 from designs where visitor_hash = ${fromVisitorHash}
            ) as from_owns,
            exists (
              select 1 from (
                select min(created_at) as earliest from designs
                where visitor_hash = ${detVisitorHash}
                  and created_at > now() - (${CONVERGENCE_LOOKBACK_SECONDS} * interval '1 second')
              ) recent_rows
              where recent_rows.earliest > now() - (${CONVERGENCE_WINDOW_SECONDS} * interval '1 second')
            ) as recent_join
        ), moved as (
          update designs set visitor_hash = ${detVisitorHash}
          where visitor_hash = ${fromVisitorHash}
            and exists (select 1 from decision where from_owns or recent_join)
        ), inserted as (
          insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
          select ${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash},
            case when (select from_owns or recent_join from decision)
              then ${detVisitorHash} else ${randVisitorHash} end
          on conflict (id) do nothing
        )
        select 1 as decided
      `,
      this.sql`
        select revision::text as revision, visitor_hash from designs
        where id = ${id} and visitor_hash in (${detVisitorHash}, ${randVisitorHash})
      `,
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

/** `mintStatements`'s guard: `requireSha256Digest` covers every hash a mint is about to store or
 *  compare against, whichever branch of `MintVisitor` supplied it (ADR 0114 Amendment H1's port
 *  note, extended by Amendment H4's second candidate). */
function requireVisitorDigests(visitor: MintVisitor): void {
  if (visitor.kind === "fresh") {
    requireSha256Digest(visitor.visitorHash, "visitor hash", "mint a design");
    return;
  }
  requireSha256Digest(visitor.detVisitorHash, "visitor hash", "mint a design");
  requireSha256Digest(visitor.randVisitorHash, "visitor hash", "mint a design");
  requireSha256Digest(visitor.fromVisitorHash, "visitor hash", "mint a design");
}

/** The row `mintStatements`'s final `select` must have found — the revision, and (since Amendment
 *  H4) which candidate hash actually landed. A missing row here is not a domain failure a caller
 *  can act on — the insert this attempt or an earlier retried one made either raised or produced
 *  exactly one row the select can see — so it is reported as the impossibility it is rather than
 *  defaulted to a first revision this file would then be the second place to decide. */
function mintedRow(
  rows: readonly { revision: DesignRevision; visitor_hash: string }[],
  id: DesignId,
): { revision: DesignRevision; visitor_hash: string } {
  const row = rows[0];
  if (row === undefined)
    throw new Error(
      `Minting design "${id}" found no row for it at the value it was minted under.`,
    );
  return row;
}
