import { sqlFragment, statementFrom } from "./sql-fragment.js";
import type { SqlFragment } from "./sql-fragment.js";
import type { StatementTag } from "./preset-statements.js";
import type { SaveCredential } from "./neon-configuration-repository.js";

/**
 * `NeonDesignThumbnailStore`'s statements (ADR 0181 d5, d6; migration `0030`), written once so the statement the store
 * sends is the one the privilege test is shown able to plan. The image travels as hex text through `decode` and `encode`,
 * so nothing depends on how the driver maps `bytea`.
 */

export interface StoreThumbnailInput {
  readonly designId: string;
  readonly credential: SaveCredential;
  /** A digit string `isDesignRevision` accepted: compared in SQL as a `bigint`, never parsed. */
  readonly revision: string;
  readonly imageHex: string;
  readonly imageType: string;
}

/**
 * One statement answers whether the credential matched and whether the design is at the revision, from one snapshot, and
 * writes only when both hold. The design row is read `for share`, which queues behind a client's delete and a save in
 * flight and then re-reads the row, so a picture is never written for a kitchen deleted a moment ago. The lock can
 * delay a concurrent save of the same kitchen by this statement's duration; ADR 0181 d1 "never delays a save" is about
 * the client's trigger, not this lock. An existing row is replaced only by a greater revision: a repeat of a held
 * revision writes nothing. Each credential has its own predicate and no statement carries both, so a caller cannot
 * widen one with the other (`NeonConfigurationRepository`'s rule).
 */
export function storeThumbnailStatement<Statement>(
  sql: StatementTag<Statement>,
  input: StoreThumbnailInput,
): Statement {
  const { designId, credential, revision, imageHex, imageType } = input;
  return statementFrom(
    sql,
    sqlFragment`
      with matched as (
        select d.id, d.revision from designs d
        where d.id = ${designId}
          and d.account_id is not null
          and d.hidden_by_client_at is null and d.deleted_by_client_at is null
          and ${credentialPredicate(credential)}
        for share of d
      ), written as (
        insert into design_thumbnails as t (design_id, revision, image, image_type)
        select m.id, ${revision}::bigint, decode(${imageHex}::text, 'hex'), ${imageType}::text
        from matched m
        where m.revision = ${revision}::bigint
        on conflict (design_id) do update
        set revision = excluded.revision, image = excluded.image, image_type = excluded.image_type,
          captured_at = now()
        where t.revision < excluded.revision
        returning t.design_id
      )
      select
        exists (select 1 from matched) as is_matched,
        exists (select 1 from matched m where m.revision = ${revision}::bigint) as is_current
    `,
  );
}

function credentialPredicate(credential: SaveCredential): SqlFragment {
  switch (credential.kind) {
    case "write-token":
      return sqlFragment`d.write_token_hash = ${credential.hash}`;
    case "account":
      return sqlFragment`d.account_id = ${credential.accountId}`;
    default:
      return sqlFragment`false`;
  }
}

/**
 * The picture of one kitchen, for the account that owns it and only while the kitchen is neither hidden nor deleted. The
 * join is on the design's own `account_id`, so no picture is read by its id alone.
 */
export function loadOwnThumbnailStatement<Statement>(
  sql: StatementTag<Statement>,
  { accountId, designId }: { accountId: string; designId: string },
): Statement {
  return sql`
    select encode(t.image, 'hex') as image_hex, t.image_type, t.revision::text as revision
    from design_thumbnails t
    join designs d on d.id = t.design_id
    where d.id = ${designId} and d.account_id = ${accountId}
      and d.hidden_by_client_at is null and d.deleted_by_client_at is null
  `;
}
