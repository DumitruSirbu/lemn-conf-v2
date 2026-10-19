import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  migrateDesign,
} from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";
import type { DesignRevision } from "./design-revision.js";
import { generateDesignId } from "./generate-design-id.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";

/* Rows are stamped with the domain's `CURRENT_SCHEMA_VERSION`, never a local copy: it decides which normalisations
 * `migrateDesign` still owes. The read path passes `row.schema_version`, so older stored rows keep loading. */

interface DesignRow {
  schema_version: number;
  document: unknown;
  /** `revision::text`, never the driver's rendering of a `bigint` — see `DesignRevision`. */
  revision: DesignRevision;
}

/** What the gated read selects beyond a plain row: whether the accessor's account is the row's owner, from the same row
 *  the read matched. */
interface OwnedDesignRow extends DesignRow {
  is_owned_by_account: boolean;
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

/**
 * What authorises a save (ADR 0019 decision 1, ADR 0172 D9): the design's write token, as the hash the route read, or
 * the id of the account that owns the design. The account's id is the server's own session's and no request member can
 * name one. The two are alternatives, never both: each arm is its own statement, so a caller cannot widen one with the
 * other.
 */
export type SaveCredential =
  | { readonly kind: "write-token"; readonly hash: string }
  | { readonly kind: "account"; readonly accountId: string };

/** One authorised replacement of a stored design, grouped so the credential cannot be swapped with the id at a call site. */
export interface AuthorizedSave {
  readonly id: DesignId;
  readonly design: Design;
  readonly credential: SaveCredential;
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
  /** The signed-in, verified client account the design belongs to from its first moment (ADR 0172 D8). Absent for a
   *  visitor, and then the statement is exactly the one that came before claiming, so a database that has not yet
   *  applied `0015` still mints for a signed-out visitor. A mint that names an account inserts `account_id` and so
   *  fails on a database without `0015`: apply it in every environment that receives this code. */
  readonly accountId?: string;
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
 * Who is asking to read a design (ADR 0172 D9): the browser's visitor hash, the signed-in client account's id, or
 * both. At least one is present by construction, so a caller that has neither cannot reach the repository. Each value
 * is trusted to be what the server derived (a hash of the visitor cookie, the id of the session's account): a request
 * never names either. An absent member matches no row.
 */
export type DesignAccessor =
  | { readonly visitorHash: string; readonly accountId?: string }
  | { readonly visitorHash?: string; readonly accountId: string };

/**
 * A second, narrower port, not a fourth method on `AuthorizedConfigurationRepository`: it starts from who is asking
 * and learns an id, and folding it in would force every mint/save/load test double to fake a lookup.
 */
export interface VisitorResumeRepository {
  /** The most recently updated design the accessor's visitor or account owns, or none. A malformed value matches no
   *  row: `0005`'s and `0015`'s check constraints admit nothing else. */
  resume(accessor: DesignAccessor): Promise<VisitorResumeLookup>;
}

/** `loadOwned`'s argument, grouped so a caller cannot name the id and forget who is asking (ADR 0114 H2). */
export interface OwnedDesignLookup {
  readonly id: DesignId;
  readonly accessor: DesignAccessor;
}

/** `loadAuthorized`'s argument: the design's id and both credentials' hashes, grouped so none can be swapped for
 *  another at a call site (ADR 0114 decision G4). */
export interface AuthorizedDesignLookup {
  readonly id: DesignId;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/** Tagged like `VisitorResumeLookup`, so a caller cannot forget to check which case it got. A foreign row, a
 *  pre-`0005` row (`visitor_hash is null`, no account) and a missing row are all `"none"`: one outcome of one
 *  statement, so a non-owner cannot observe which it was. */
export type LoadOwnedOutcome =
  | {
      readonly kind: "found";
      readonly design: Design;
      readonly revision: DesignRevision;
      /** Whether the accessor's **account** is the row's owner, as against the row having matched through the visitor
       *  alone. Absent reads as `false`. The one fact a caller may use to say a session may write the design. */
      readonly isOwnedByAccount?: boolean;
    }
  | { readonly kind: "none" };

/**
 * The gated read (ADR 0114 Amendment H2, ADR 0172 D9): a design is readable by the browser whose visitor hash the row
 * carries, or by the account whose id the row carries. `migrateDesign` runs only on `found`, so `InvalidDesignError`
 * is reachable by the design's owner alone.
 */
export interface OwnedDesignRepository {
  loadOwned(lookup: OwnedDesignLookup): Promise<LoadOwnedOutcome>;
}

/** What one mint inserts, once the id is drawn and the optional account is settled to a value or its absence. */
interface MintedRow {
  readonly id: DesignId;
  readonly design: Design;
  readonly writeTokenHash: string;
  readonly visitor: MintVisitor;
  readonly accountId: string | undefined;
}

/** `claimVisitorDesigns`'s argument, grouped so the visitor hash and the account id cannot be swapped at a call site. */
export interface VisitorDesignsClaim {
  readonly visitorHash: string;
  /** From the server's own session and nowhere else: a claim never takes an account id from a request. */
  readonly accountId: string;
}

/**
 * The claim port (ADR 0172 D8), a narrow one of its own like `VisitorResumeRepository`: it starts from a visitor hash
 * and an account, and folding it into the mint/save port would make every test double for that port fake it.
 */
export interface DesignClaimRepository {
  /** How many designs the visitor holds that no account has claimed. Reads, changes nothing. */
  countClaimable(visitorHash: string): Promise<number>;
  /** Gives every unclaimed design of the visitor to the account in one statement and answers the ids it gave. A design
   *  that already has an account is never touched, so of two accounts claiming at once each design goes to one. */
  claimVisitorDesigns(claim: VisitorDesignsClaim): Promise<readonly DesignId[]>;
}

/**
 * A third, narrower read for a route that acts on a design as its author and must have proved both credentials
 * (the preset save): a port of its own for the reason `OwnedDesignRepository` is one, so no existing test double has
 * to fake it.
 */
export interface AuthorizedDesignRepository {
  loadAuthorized(lookup: AuthorizedDesignLookup): Promise<LoadOwnedOutcome>;
}

/** `AuthorizedConfigurationRepository` on Neon Postgres. Every query is a tagged-template `sql`, which parameterises
 *  values: nothing here concatenates a value into SQL text. */
export class NeonConfigurationRepository
  implements
    AuthorizedConfigurationRepository,
    VisitorResumeRepository,
    OwnedDesignRepository,
    DesignClaimRepository,
    AuthorizedDesignRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
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
    accountId,
  }: MintDesign): Promise<DesignVersion> {
    requireSha256Digest(writeTokenHash, "write-token hash", "mint a design");
    requireVisitorDigests(visitor);
    if (accountId !== undefined)
      requireAccountIdShape(accountId, "mint a design");
    // Generated outside the retried callback and must stay there: a fresh id per retry would insert a second row
    // when only an acknowledgement was lost.
    const id = generateDesignId();

    const results = (await retryOnTransientFailure(() =>
      this.sql.transaction(
        this.mintStatements({ id, design, writeTokenHash, visitor, accountId }),
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
  private mintStatements({
    id,
    design,
    writeTokenHash,
    visitor,
    accountId,
  }: MintedRow) {
    const insert = this.mintInsert({
      id,
      design,
      writeTokenHash,
      visitor,
      accountId,
    });
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

  /** The signed-out insert never names `account_id`, so it is byte for byte what it was before claiming existed. */
  private mintInsert({
    id,
    design,
    writeTokenHash,
    visitor,
    accountId,
  }: MintedRow) {
    if (accountId === undefined)
      return this.sql`
        insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
        values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash}, ${visitor.visitorHash})
        on conflict (id) do nothing
      `;
    return this.sql`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash, account_id)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash}, ${visitor.visitorHash}, ${accountId})
      on conflict (id) do nothing
    `;
  }

  /**
   * Replaces a stored design, with authorisation and the expected revision enforced in the update's own predicate,
   * not by a preceding read: read-then-write opens a time-of-check/time-of-use window, and Postgres compares the
   * hash, so there is no application-side comparison to make timing-safe.
   *
   * `returning revision` makes zero matched rows visible: a bare `update` matching nothing reports success. A row
   * with a NULL `write_token_hash` never matches, so it fails closed.
   *
   * Deliberately no `requireSha256Digest`, account-id shape check or `isDesignRevision`, unlike `mint`: a wrong-shaped
   * credential or revision is simply not the right one, and the answer is a refusal, not a crash. The predicate gives
   * that for every shape (`NULL = ''` is NULL), and the revision is compared as text so no caller string can raise a
   * cast error. The account arm's write needs the row's own `account_id`: a session never writes a design that is
   * unclaimed or another account's, and the two are the one refusal.
   *
   * A design the client hid or deleted (`hidden_by_client_at` / `deleted_by_client_at`, ADR 0172 D9, plan S4) is
   * refused on both arms by the same refusal, because the marks are in all three places the credential is. The marks
   * are checked in the `update` itself, so a hide that commits while a save waits on the row lock wins and the write
   * does not land (READ COMMITTED re-checks the predicate against the committed row). In that one race the `authorised`
   * CTE, which shares the statement's snapshot, still reads the pre-hide row, so the owner is told of a conflict
   * rather than a refusal; only a caller whose credential matched sees it, so it is no oracle.
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
   * The credential picks the statement (`updateByWriteToken`, `updateByAccount`); both return the same row.
   */
  private async updateIfCurrent(
    save: AuthorizedSave,
  ): Promise<ConditionalUpdateRow> {
    const { credential } = save;
    const rows =
      credential.kind === "write-token"
        ? await this.updateByWriteToken(save, credential.hash)
        : await this.updateByAccount(save, credential.accountId);

    const outcome = rows[0];
    if (!outcome)
      throw new Error(
        "The conditional update returned no row at all, which this statement cannot do — the " +
          "database did not run the query this repository sent.",
      );
    return outcome;
  }

  /**
   * The write-token arm: the statement every save made before accounts existed.
   *
   * On a retry only, a row already at `expectedRevision + 1` holding this very document is the first attempt's own
   * write, so it answers as success rather than a false conflict; a first attempt never takes that arm.
   *
   * `schema_version` is restamped with the document: the document was produced by this build, and a row left at its
   * minted version would keep asking for an older normalisation arm on every load, so that arm could never be removed.
   * Safe in both directions: a normalised document is a fixed point of every arm below the current version.
   */
  private async updateByWriteToken(
    { id, design, expectedRevision, requestVisitor }: AuthorizedSave,
    writeTokenHash: string,
  ): Promise<ConditionalUpdateRow[]> {
    // `null` for "absent" is safe only here: it reaches no stored column, just the right side of the `coalesce`
    // comparison below, where `= null` answers "no" for every row.
    const requestVisitorHash =
      requestVisitor.kind === "present" ? requestVisitor.visitorHash : null;
    return (await retryOnTransientFailure(
      ({ isRetry }) => this.sql`
      with authorised as (
        select 1 from designs
        where id = ${id} and write_token_hash = ${writeTokenHash}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ), updated as (
        update designs
        set document = ${design}, schema_version = ${CURRENT_SCHEMA_VERSION},
            updated_at = now(), revision = revision + 1
        where id = ${id}
          and write_token_hash = ${writeTokenHash}
          and hidden_by_client_at is null and deleted_by_client_at is null
          and revision::text = ${expectedRevision}
        returning revision, visitor_hash
      ), landed as (
        select revision, visitor_hash from designs
        where ${isRetry}
          and id = ${id}
          and write_token_hash = ${writeTokenHash}
          and hidden_by_client_at is null and deleted_by_client_at is null
          and (revision - 1)::text = ${expectedRevision}
          and document = ${design}
      )
      select
        exists (select 1 from authorised) as is_authorised,
        coalesce((select revision::text from updated), (select revision::text from landed)) as revision,
        coalesce(
          coalesce((select visitor_hash from updated), (select visitor_hash from landed)) = ${requestVisitorHash},
          false
        ) as owns_visitor
    `,
    )) as ConditionalUpdateRow[];
  }

  /**
   * The account arm (ADR 0172 D9): the same statement with `account_id = $a` where the token arm has the write-token
   * hash, in all three places, so the 409 is still reported only to a caller whose credential matched the row, and a
   * row no account has claimed (`account_id is null`) matches nobody. The retry rule is the token arm's. The visitor is
   * not this arm's concern: it does not ask who owns the visitor, and `owns_visitor` is always `false`, because a
   * session save refreshes no visitor cookie.
   */
  private async updateByAccount(
    { id, design, expectedRevision }: AuthorizedSave,
    accountId: string,
  ): Promise<ConditionalUpdateRow[]> {
    return (await retryOnTransientFailure(
      ({ isRetry }) => this.sql`
      with authorised as (
        select 1 from designs
        where id = ${id} and account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ), updated as (
        update designs
        set document = ${design}, schema_version = ${CURRENT_SCHEMA_VERSION},
            updated_at = now(), revision = revision + 1
        where id = ${id}
          and account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
          and revision::text = ${expectedRevision}
        returning revision
      ), landed as (
        select revision from designs
        where ${isRetry}
          and id = ${id}
          and account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
          and (revision - 1)::text = ${expectedRevision}
          and document = ${design}
      )
      select
        exists (select 1 from authorised) as is_authorised,
        coalesce((select revision::text from updated), (select revision::text from landed)) as revision,
        false as owns_visitor
    `,
    )) as ConditionalUpdateRow[];
  }

  /**
   * The **ungated** read: any id, no credential. No production caller reads through it since ADR 0114 Amendment H2;
   * it stays for the live suites, which need an unfiltered read of the raw row.
   */
  async load(id: DesignId): Promise<StoredDesign> {
    const rows = (await retryOnTransientFailure(
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
   * The gated read (ADR 0114 Amendment H2, ADR 0172 D9): `id` and either credential in one predicate, so a foreign
   * row, a pre-`0005` row and a missing row are one outcome. An absent member is bound as `null`, and `x = null` is
   * never true, so an accessor with only a visitor matches exactly what it did before accounts existed, and one with
   * only an account matches only that account's rows. A visitor-less, account-less row matches neither arm, and a row
   * the client hid or deleted (ADR 0172 D9, plan S4) matches neither arm either: it is the one `"none"`. The owner
   * flag comes from the same row. `migrateDesign` runs only on a match. No `requireSha256Digest`: a malformed value
   * matches no row, because `0005`'s and `0015`'s check constraints admit nothing else.
   */
  async loadOwned({
    id,
    accessor,
  }: OwnedDesignLookup): Promise<LoadOwnedOutcome> {
    const { visitorHash, accountId } = nullableCredentialsOf(accessor);
    const rows = (await retryOnTransientFailure(
      () => this.sql`
      select schema_version, document, revision::text as revision,
        coalesce(account_id = ${accountId}, false) as is_owned_by_account
      from designs
      where id = ${id} and (visitor_hash = ${visitorHash} or account_id = ${accountId})
        and hidden_by_client_at is null and deleted_by_client_at is null
    `,
    )) as OwnedDesignRow[];

    const row = rows[0];
    if (!row) return { kind: "none" };

    return {
      kind: "found",
      design: migrateDesign(row.schema_version, row.document),
      revision: row.revision,
      isOwnedByAccount: row.is_owned_by_account,
    };
  }

  /**
   * The read that proves authorship: the id, the write token's hash and the visitor's hash in one predicate, compared
   * in SQL as `saveAuthorized` and the share link do, so a wrong token, a foreign visitor, a pre-`0005` row and a
   * missing row are one outcome. A row with a NULL `write_token_hash` or `visitor_hash` never matches. `migrateDesign`
   * runs only on a match. No `requireSha256Digest`: a wrong-shaped credential is simply not the right one. A design
   * the client hid or deleted is `"none"` here as well (plan S4): the preset save is another way into a claimed design.
   */
  async loadAuthorized({
    id,
    writeTokenHash,
    visitorHash,
  }: AuthorizedDesignLookup): Promise<LoadOwnedOutcome> {
    const rows = (await retryOnTransientFailure(
      () => this.sql`
      select schema_version, document, revision::text as revision
      from designs
      where id = ${id}
        and write_token_hash = ${writeTokenHash}
        and visitor_hash = ${visitorHash}
        and hidden_by_client_at is null and deleted_by_client_at is null
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

  /**
   * Ordered by `updated_at desc, id desc` for a deterministic tie break. Each credential is its own indexed query with
   * its own `limit 1` (`designs_visitor_hash_updated_at_idx`, `0005`, and `designs_account_id_updated_at_idx`, `0015`),
   * and the two candidates are merged by the same order, so a plain `or` never takes the planner off either index. One
   * statement; an absent member is bound as `null` and contributes no candidate. Hidden and deleted designs are
   * excluded inside each candidate query, before its `limit 1`, so the newest *open* design is the one that is found
   * (ADR 0172 D9, plan S4); filtering after the limit would answer "none" for a browser whose newest design was hidden.
   */
  async resume(accessor: DesignAccessor): Promise<VisitorResumeLookup> {
    const { visitorHash, accountId } = nullableCredentialsOf(accessor);
    const rows = (await retryOnTransientFailure(
      () => this.sql`
      select id from (
        (select id, updated_at from designs
          where visitor_hash = ${visitorHash}
            and hidden_by_client_at is null and deleted_by_client_at is null
          order by updated_at desc, id desc limit 1)
        union all
        (select id, updated_at from designs
          where account_id = ${accountId}
            and hidden_by_client_at is null and deleted_by_client_at is null
          order by updated_at desc, id desc limit 1)
      ) as candidates
      order by updated_at desc, id desc
      limit 1
    `,
    )) as { id: DesignId }[];

    const row = rows[0];
    return row === undefined ? { kind: "none" } : { kind: "found", id: row.id };
  }

  /** Served by `designs_visitor_hash_updated_at_idx` (`0005`). A malformed `visitorHash` matches no row, so it counts
   *  none; it is still refused here, because the claim beside it must not guess what a malformed value means. */
  async countClaimable(visitorHash: string): Promise<number> {
    requireSha256Digest(visitorHash, "visitor hash", "count claimable designs");
    const rows = (await retryOnTransientFailure(
      () => this.sql`
      select count(*)::int as claimable from designs
      where visitor_hash = ${visitorHash} and account_id is null
    `,
    )) as { claimable: number }[];

    return rows[0]?.claimable ?? 0;
  }

  /**
   * One statement, and `account_id is null` is in its predicate: the claim is decided by the row at the instant it is
   * written, not by an earlier read, so a design some account already holds is never changed, and of two accounts
   * racing for one visitor's designs the second finds the first's rows no longer matching (READ COMMITTED re-checks
   * the predicate after waiting on the row lock). It sets `account_id` and nothing else: `visitor_hash`,
   * `write_token_hash`, `revision`, `updated_at` and `document` stay as they were, so the claiming browser works as
   * before (ADR 0172 D8).
   *
   * Not retried, unlike the reads here: a repeat after a lost acknowledgement would find its own rows claimed already
   * and answer none, which would tell the client nothing was claimed when everything was. The caller answers the
   * failure and the person confirms again, and that second claim takes whatever is left.
   */
  async claimVisitorDesigns({
    visitorHash,
    accountId,
  }: VisitorDesignsClaim): Promise<readonly DesignId[]> {
    requireSha256Digest(visitorHash, "visitor hash", "claim designs");
    requireAccountIdShape(accountId, "claim designs");
    const rows = (await this.sql`
      update designs set account_id = ${accountId}
      where visitor_hash = ${visitorHash} and account_id is null
      returning id
    `) as { id: DesignId }[];

    return rows.map((row) => row.id);
  }
}

/** The accessor's two credentials as statement parameters. `null` is safe only here: it reaches no stored column, just
 *  the right side of an `=` comparison, which answers "no" for every row. */
function nullableCredentialsOf(accessor: DesignAccessor): {
  readonly visitorHash: string | null;
  readonly accountId: string | null;
} {
  return {
    visitorHash: accessor.visitorHash ?? null,
    accountId: accessor.accountId ?? null,
  };
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
