import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { migrateDesign } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

import { readDatabaseUrl } from "./read-database-url.js";
import { retryOnComputeRestart } from "./retry-on-compute-restart.js";
import { requireSha256Digest } from "./sha256-digest.js";

/**
 * The credential trio every share-link operation but `loadShared` is authorised against: the design
 * the caller claims, and the two hashes `api/designs/[id]/share/route.ts` already reads off the
 * request's cookies (M7 wave 7E3c D4). Grouped, as `MintDesign` groups its own pair, so a caller
 * cannot swap the write-token hash and the visitor hash at a call site.
 */
export interface ShareLinkCredentials {
  readonly designId: DesignId;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/** `issue`'s full argument: the credentials that authorise minting a link, plus the hash of the
 *  token the link will open with. */
export interface IssueShareLink extends ShareLinkCredentials {
  readonly tokenHash: string;
}

export type ShareLinkIssueOutcome = "issued" | "refused";
export type ShareLinkRevokeOutcome = "revoked" | "refused";

/** Whether *some* link on the named design is currently open — never which one, and never its
 *  token or hash (D3: `status` answers a question about the design, not about a token). */
export interface ShareLinkStatus {
  readonly active: boolean;
}

export type ShareLinkStatusOutcome = ShareLinkStatus | "refused";

export type LoadSharedOutcome =
  | { readonly kind: "found"; readonly design: Design }
  | { readonly kind: "none" };

/**
 * A second, narrower port beside `AuthorizedConfigurationRepository` — deliberately a separate
 * interface and a separate implementation, for `VisitorResumeRepository`'s own reason (M7 wave 7E3a
 * D3): folding a shape this different into the existing port would force every one of its ~16
 * existing test doubles to also fake share-link behaviour their own tests never exercise.
 *
 * **Every method compares both hashes inside SQL, never in application code, and none of them ever
 * writes to `designs`** (D3, D8): a share link is issued, revoked or read without moving
 * `designs.updated_at`, so sharing a design never reorders resume and never touches the retention
 * clock the backup and restore runbook reason about.
 */
export interface ShareLinkRepository {
  issue(issue: IssueShareLink): Promise<ShareLinkIssueOutcome>;
  revoke(credentials: ShareLinkCredentials): Promise<ShareLinkRevokeOutcome>;
  status(credentials: ShareLinkCredentials): Promise<ShareLinkStatusOutcome>;
  /** Reads by token hash alone, with no credential — a share link is meant to open for anyone
   *  holding it (ADR 0114 B). It selects no id: the caller never learns the design's identity from
   *  this call, only its (migrated) document. */
  loadShared(tokenHash: string): Promise<LoadSharedOutcome>;
}

/** The row `issue`'s final statement returns only when its own predicate matched. */
interface IssuedRow {
  token_hash: string;
}

/** `revoke`'s one query answers both questions from a single snapshot, the same reason
 *  `NeonConfigurationRepository.updateIfCurrent` does: whether the credential authorised anything at
 *  all, and separately, whether a row was actually revoked. An `update … returning` alone cannot
 *  tell "authorised, nothing was active" apart from "not authorised" — both return zero rows — so
 *  the authorisation question is asked again, in the same statement, over the same snapshot. */
interface RevokeRow {
  is_authorised: boolean;
}

interface StatusRow {
  is_authorised: boolean;
  active: boolean;
}

interface SharedDesignRow {
  schema_version: number;
  document: unknown;
}

/** `ShareLinkRepository` backed by Neon Postgres. Every query uses `@neondatabase/serverless`'s
 *  tagged-template `sql`, which parameterises interpolated values by construction. */
export class NeonShareLinkRepository implements ShareLinkRepository {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`. It is passed explicitly only by the live tests,
   *  which must target their own database rather than the application's. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  /**
   * Mints a new active link for a design, revoking whatever was active first — D3's "one active
   * link per design" is also enforced at the database by the partial unique index `0006` adds; this
   * transaction is what keeps a legitimate re-issue from ever colliding with it.
   *
   * Three statements, serialised by the row lock; relies on READ COMMITTED. Each carries the full
   * credential predicate on its own, because the predicate is the security control (the same
   * reasoning `NeonConfigurationRepository.saveAuthorized` states): (1) `select … for update` locks
   * the design row, serialising two concurrent issues for the same design; (2) the previously active
   * row, if any, is revoked; (3) the new row is inserted only from a `select` that itself re-checks
   * the credential, so an unauthorised call inserts nothing at all. Reading `token_hash` back off
   * that insert is what tells `issued` from `refused` apart — not the lock, which a caller cannot
   * observe.
   *
   * **Why READ COMMITTED, stated rather than assumed (SEC-7E3c.4).** The lock in (1) is what makes
   * two concurrent `issue()` calls for the same design safe, but the lock alone is not what keeps
   * them correct: under READ COMMITTED, every statement takes a fresh snapshot as of its own start,
   * so a second `issue()` — call it T2 — that blocks on (1)'s `for update` sees, once the first
   * commits and releases the lock, that first call's *committed* insert when T2's own statements (2)
   * and (3) run. T2's revoke then correctly deactivates the row T1 just created before T2 inserts its
   * own, which is what leaves exactly one active row after any number of concurrent issues
   * (criterion 5). Under `RepeatableRead` or `Serializable`, T2's snapshot is fixed at its own
   * `BEGIN` — before T1 committed — so T2 would neither see nor revoke T1's row, and its own insert
   * would collide with `0006`'s partial unique index instead of resolving cleanly. `isolationLevel`
   * is stated explicitly so a future change to `neon()`'s own default cannot silently change which of
   * those two outcomes this method gets.
   */
  async issue({
    designId,
    writeTokenHash,
    visitorHash,
    tokenHash,
  }: IssueShareLink): Promise<ShareLinkIssueOutcome> {
    requireSha256Digest(tokenHash, "token hash", "issue a share link");
    // **Generated outside the retried callback, as the mint's id is.** A retry that hashed a fresh
    // token each attempt would leave an earlier, unacknowledged attempt's link live under a token
    // the customer never saw, alongside a second one they did — recorded as R8 (ADR 0118): a lost
    // acknowledgement here retries into a primary-key collision, surfaced as an error, not silently
    // as two links.
    //
    // The credential predicate is repeated in full in each of the three statements rather than built
    // once and reused: the driver's tagged-template `sql` treats an interpolated value as a bound
    // *parameter*, never as spliced-in SQL text, so a `NeonQueryPromise` built by one `sql` call
    // cannot be interpolated into another — there is no fragment-composition feature to reuse here.
    const [, , inserted] = (await retryOnComputeRestart(() =>
      this.sql.transaction(
        [
          this.sql`
            select 1 from designs
            where id = ${designId}
              and write_token_hash = ${writeTokenHash}
              and visitor_hash = ${visitorHash}
            for update
          `,
          this.sql`
            update design_share_links
            set revoked_at = now()
            where revoked_at is null
              and design_id = (
                select id from designs
                where id = ${designId}
                  and write_token_hash = ${writeTokenHash}
                  and visitor_hash = ${visitorHash}
              )
          `,
          this.sql`
            insert into design_share_links (token_hash, design_id)
            select ${tokenHash}, id from designs
            where id = ${designId}
              and write_token_hash = ${writeTokenHash}
              and visitor_hash = ${visitorHash}
            returning token_hash
          `,
        ],
        // Pinned per the doc comment above (SEC-7E3c.4) — this is Postgres's own default, made
        // explicit so it cannot drift under this method without a reviewer seeing the line change.
        { isolationLevel: "ReadCommitted" },
      ),
    )) as [unknown[], unknown[], IssuedRow[]];

    return inserted.length > 0 ? "issued" : "refused";
  }

  /** One statement, one snapshot: the CTE answers whether the credential authorises anything at
   *  all, the update revokes the active row if the credential authorised it and one exists, and the
   *  final `select` reports which of those the caller gets — `revoked` covers both "something was
   *  revoked" and "authorised, nothing was active" (D3: idempotent), `refused` covers only a
   *  credential that named no design at all. */
  async revoke(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkRevokeOutcome> {
    const { designId, writeTokenHash, visitorHash } = credentials;
    const rows = (await retryOnComputeRestart(
      () => this.sql`
        with authorised as (
          select 1 from designs
          where id = ${designId}
            and write_token_hash = ${writeTokenHash}
            and visitor_hash = ${visitorHash}
        ), revoked as (
          update design_share_links
          set revoked_at = now()
          where design_id = ${designId}
            and revoked_at is null
            and exists (select 1 from authorised)
          returning token_hash
        )
        select exists (select 1 from authorised) as is_authorised
      `,
    )) as RevokeRow[];

    return rowOrImpossible(rows, "revoke").is_authorised
      ? "revoked"
      : "refused";
  }

  /** One select, two independent `exists` checks over the same credential — `active` never runs
   *  without `is_authorised` already having been asked, so a refused caller learns nothing about
   *  whether a link exists. */
  async status(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkStatusOutcome> {
    const { designId, writeTokenHash, visitorHash } = credentials;
    const rows = (await retryOnComputeRestart(
      () => this.sql`
        select
          exists (
            select 1 from designs
            where id = ${designId}
              and write_token_hash = ${writeTokenHash}
              and visitor_hash = ${visitorHash}
          ) as is_authorised,
          exists (
            select 1 from design_share_links s
            join designs d on d.id = s.design_id
            where d.id = ${designId}
              and d.write_token_hash = ${writeTokenHash}
              and d.visitor_hash = ${visitorHash}
              and s.revoked_at is null
          ) as active
      `,
    )) as StatusRow[];

    const row = rowOrImpossible(rows, "status");
    return row.is_authorised ? { active: row.active } : "refused";
  }

  /** No credential and no `requireSha256Digest` guard, for `resumeVisitor`'s own reason: a
   *  malformed token hash simply matches no row, because the column's own check constraint (`0006`)
   *  admits nothing else, so there is no unsafe shape for this `select` to guard against. It selects
   *  no id — the caller learns only the (migrated) document, never which design it was. */
  async loadShared(tokenHash: string): Promise<LoadSharedOutcome> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
        select d.schema_version, d.document
        from design_share_links s
        join designs d on d.id = s.design_id
        where s.token_hash = ${tokenHash} and s.revoked_at is null
      `,
    )) as SharedDesignRow[];

    const row = rows[0];
    if (!row) return { kind: "none" };
    return {
      kind: "found",
      design: migrateDesign(row.schema_version, row.document),
    };
  }
}

/** Every query above either raises or returns exactly one row; a missing row here is not a domain
 *  outcome a caller can act on, so it is reported as the impossibility it is rather than treated as
 *  a refusal — the same division `NeonConfigurationRepository.updateIfCurrent` draws. */
function rowOrImpossible<Row>(rows: readonly Row[], operation: string): Row {
  const row = rows[0];
  if (!row)
    throw new Error(
      `Share-link ${operation} returned no row at all, which this statement cannot do — the ` +
        `database did not run the query this repository sent.`,
    );
  return row;
}
