import type { StatementTag } from "./preset-statements.js";
import { sqlFragment, statementFrom } from "./sql-fragment.js";
import type { SqlFragment } from "./sql-fragment.js";

/**
 * `NeonKitchenUsageReader`'s statements (ADR 0178 A-17 and A-18). Each counts the saved designs a client has not deleted
 * (`designs.deleted_by_client_at`, `0016`), one design once. The two that count in SQL read the stored document as it was
 * written, which is exact only where migration rewrites neither the path nor what it holds: a tier id in `settings` and a
 * body's build id are neither rewritten. A colour, a handle and a built-in accessory are not counted here, because what
 * counts as using them depends on what migration rewrites (`readDesignPageStatement` serves those).
 */

/** The `settings` key that names the tier of each kind of whole-kitchen choice. */
export type TierSettingKey = "materialTierId" | "hardwareTierId";

export function tierSettingKeyOf(
  kind: "material" | "hardware",
): TierSettingKey {
  return kind === "material" ? "materialTierId" : "hardwareTierId";
}

export interface TierUsageInput {
  readonly settingKey: TierSettingKey;
  readonly tierId: string;
  /** Whether a design that names no tier is priced at this one, as the book's fallback. */
  readonly isFallback: boolean;
}

/**
 * What a tier predicate reads of the tier, each as a SQL expression: bound values where one tier is counted, columns of a
 * relation where a statement asks it of many (the publish's guard). The predicate adds the casts, so a count's text is the
 * same whichever way its operands are given.
 */
export interface TierUsageOperands {
  readonly settingKey: SqlFragment;
  readonly tierId: SqlFragment;
  readonly isFallback: SqlFragment;
}

/**
 * The one definition of a counted design that chose a tier, over `designs d`: one its client has not deleted whose
 * settings name the tier, and, for the fallback tier, one whose settings name none (no `settings`, or none of this key). A
 * design that names another tier is not counted, whatever the fallback is. Both the count below and the publish's guard
 * (`price-book-statements.ts`) splice this text, so they cannot disagree about who uses a tier.
 */
export function designChoosesTier(operands: TierUsageOperands): SqlFragment {
  const { settingKey, tierId, isFallback } = operands;
  return sqlFragment`
    d.deleted_by_client_at is null
      and coalesce(
        d.document #>> array['settings', ${settingKey}::text],
        case when ${isFallback}::boolean then ${tierId}::text end
      ) = ${tierId}::text
  `;
}

/**
 * The one definition of a counted design that places at least one of the bodies, over `designs d`: one its client has not
 * deleted. `buildIds` is the set the domain computed for a linked accessory (`buildIdsPricedAs`), never a list kept here,
 * as a `text[]` expression. A `placements` that is not an array counts as none. Shared as `designChoosesTier` is.
 */
export function designPlacesBodies(buildIds: SqlFragment): SqlFragment {
  return sqlFragment`
    d.deleted_by_client_at is null
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(d.document -> 'placements') = 'array' then d.document -> 'placements' else '[]'::jsonb end
        ) as placement
        where placement #>> '{body,buildId}' = any(${buildIds}::text[])
      )
  `;
}

export function countDesignsChoosingTierStatement<Statement>(
  sql: StatementTag<Statement>,
  input: TierUsageInput,
): Statement {
  const predicate = designChoosesTier({
    settingKey: sqlFragment`${input.settingKey}`,
    tierId: sqlFragment`${input.tierId}`,
    isFallback: sqlFragment`${input.isFallback}`,
  });
  return statementFrom(
    sql,
    sqlFragment`
    select count(*)::int as designs
    from designs d
    where ${predicate}
  `,
  );
}

export function countDesignsPlacingBodiesStatement<Statement>(
  sql: StatementTag<Statement>,
  buildIds: readonly string[],
): Statement {
  const predicate = designPlacesBodies(sqlFragment`${buildIds}`);
  return statementFrom(
    sql,
    sqlFragment`
    select count(*)::int as designs
    from designs d
    where ${predicate}
  `,
  );
}

/**
 * One page of the designs a client has not deleted, in `id` order, as the stored rows: the reader migrates each as the
 * product does and asks the domain's own predicate of it. Keyset, not `offset` (`design-row-source.ts`): a design saved
 * during the walk cannot shift a later page. `afterId` is exclusive; the empty text sorts before every id.
 */
export function readDesignPageStatement<Statement>(
  sql: StatementTag<Statement>,
  page: { readonly afterId: string; readonly pageSize: number },
): Statement {
  return sql`
    select d.id, d.schema_version, d.document
    from designs d
    where d.deleted_by_client_at is null
      and d.id > ${page.afterId}::text
    order by d.id
    limit ${page.pageSize}::int
  `;
}
