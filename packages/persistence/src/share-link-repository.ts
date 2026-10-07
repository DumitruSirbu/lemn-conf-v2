import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { migrateDesign } from "@lemnaria/configurator-domain";

import { openDatabase } from "./open-database.js";
import { readDatabaseUrl } from "./read-database-url.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";

/**
 * The credential trio every share-link operation but `loadShared` is authorised against: the design and the two hashes
 * the share route reads off the request's cookies. Grouped so the write-token hash and the visitor hash cannot be
 * swapped at a call site.
 */
export interface ShareLinkCredentials {
  readonly designId: DesignId;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/** `issue`'s argument: the credentials that authorise minting a link, plus the hash of the link's token. */
export interface IssueShareLink extends ShareLinkCredentials {
  readonly tokenHash: string;
}

export type ShareLinkIssueOutcome = "issued" | "refused";
export type ShareLinkRevokeOutcome = "revoked" | "refused";

/** Whether some link on the named design is open, never which one nor its token or hash. */
export interface ShareLinkStatus {
  readonly active: boolean;
}

export type ShareLinkStatusOutcome = ShareLinkStatus | "refused";

export type LoadSharedOutcome =
  | { readonly kind: "found"; readonly design: Design }
  | { readonly kind: "none" };

/**
 * A second, narrower port beside `AuthorizedConfigurationRepository`, for `VisitorResumeRepository`'s reason: folding
 * it in would force every existing test double to fake share-link behaviour.
 *
 * Every method compares both hashes inside SQL, never in application code, and none writes to `designs`: sharing never
 * moves `designs.updated_at`, so it never reorders resume or touches the retention clock.
 */
export interface ShareLinkRepository {
  issue(issue: IssueShareLink): Promise<ShareLinkIssueOutcome>;
  revoke(credentials: ShareLinkCredentials): Promise<ShareLinkRevokeOutcome>;
  status(credentials: ShareLinkCredentials): Promise<ShareLinkStatusOutcome>;
  /** Reads by token hash alone: a share link opens for anyone holding it (ADR 0114 Amendment B). It selects no id,
   *  so the caller learns only the migrated document. */
  loadShared(tokenHash: string): Promise<LoadSharedOutcome>;
}

/** The row `issue`'s final statement returns only when its token names a link of the credentialed design. */
interface IssuedRow {
  token_hash: string;
}

/** `revoke`'s one query answers both questions from one snapshot: whether the credential authorised anything, and
 *  whether a row was revoked. An `update … returning` alone cannot tell "authorised, nothing active" from "not
 *  authorised": both return zero rows. */
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

/** `ShareLinkRepository` on Neon Postgres. Every query is a tagged-template `sql`, which parameterises values. */
export class NeonShareLinkRepository implements ShareLinkRepository {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = openDatabase(connectionUrl, "DATABASE_URL");
  }

  /**
   * Mints a new active link for a design, revoking whatever was active first. One transaction of four statements, each
   * carrying the full credential predicate because the predicate is the security control: (1) `select … for update`
   * locks the design row; (2) every other active link is revoked; (3) the new row is inserted from a credentialed
   * `select`, so an unauthorised call inserts nothing; (4) the link under this token, active or not, is read back, and
   * its presence is what tells `issued` from `refused`.
   *
   * Repeating after a lost acknowledgement ends in the same rows and the same answer: `tokenHash` is fixed before the
   * retried callback, (2) revokes nothing once that token exists (a later issue or revoke by another tab stands), (3) is
   * `on conflict do nothing`, and (4) ignores `revoked_at`. A token owned by another design is refused untouched.
   * On a retry only, (4) also drops the visitor condition: a mint in another tab may have rotated the visitor since the
   * first attempt landed, and a link under this call's own token proves that attempt was authorised.
   *
   * READ COMMITTED is load-bearing: a second issue blocked on (1) takes a fresh snapshot per statement, so it sees the
   * first's committed insert and revokes it before inserting its own. Under a stricter level its insert would collide
   * with `0006`'s one-active-link index. See ADR 0145.
   */
  async issue({
    designId,
    writeTokenHash,
    visitorHash,
    tokenHash,
  }: IssueShareLink): Promise<ShareLinkIssueOutcome> {
    requireSha256Digest(tokenHash, "token hash", "issue a share link");
    // A tagged-template `sql` binds interpolations as parameters, so one `sql` query cannot be interpolated into
    // another and the credential predicate is repeated in each statement.
    const [, , , issued] = (await retryOnTransientFailure(({ isRetry }) =>
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
              and not exists (
                select 1 from design_share_links where token_hash = ${tokenHash}
              )
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
            on conflict (token_hash) do nothing
          `,
          this.sql`
            select s.token_hash from design_share_links s
            join designs d on d.id = s.design_id
            where s.token_hash = ${tokenHash}
              and d.id = ${designId}
              and d.write_token_hash = ${writeTokenHash}
              and (d.visitor_hash = ${visitorHash} or ${isRetry})
          `,
        ],
        // Pinned: Postgres's own default, explicit so a change to `neon()`'s default cannot silently pick the other.
        { isolationLevel: "ReadCommitted" },
      ),
    )) as [unknown[], unknown[], unknown[], IssuedRow[]];

    return issued.length > 0 ? "issued" : "refused";
  }

  /** One statement, one snapshot: the CTE asks whether the credential authorises anything, the update revokes the
   *  active row if so, and `revoked` covers both "revoked something" and "authorised, nothing active" (idempotent);
   *  `refused` covers only a credential naming no design. */
  async revoke(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkRevokeOutcome> {
    const { designId, writeTokenHash, visitorHash } = credentials;
    const rows = (await retryOnTransientFailure(
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

  /** One select, two independent `exists` checks: `active` is never reported without `is_authorised`, so a refused
   *  caller learns nothing about whether a link exists. */
  async status(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkStatusOutcome> {
    const { designId, writeTokenHash, visitorHash } = credentials;
    const rows = (await retryOnTransientFailure(
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

  /** No credential and no `requireSha256Digest`: a malformed token hash matches no row, because `0006`'s check
   *  constraint admits nothing else. It selects no id, so the caller learns only the migrated document. */
  async loadShared(tokenHash: string): Promise<LoadSharedOutcome> {
    const rows = (await retryOnTransientFailure(
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

/** Every query above raises or returns exactly one row; a missing row is an impossibility, not a refusal. */
function rowOrImpossible<Row>(rows: readonly Row[], operation: string): Row {
  const row = rows[0];
  if (!row)
    throw new Error(
      `Share-link ${operation} returned no row at all, which this statement cannot do — the ` +
        `database did not run the query this repository sent.`,
    );
  return row;
}
