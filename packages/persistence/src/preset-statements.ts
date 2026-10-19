import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";

import type {
  PresetNeighbourhood,
  PresetToRecord,
} from "./preset-repository.js";

/**
 * A tagged template that turns a statement and its values into whatever the caller runs: the Neon driver's `sql`
 * (which sends it), or a recorder (which the privilege test hands to the server's `explain`). The statements below are
 * written once, here, so the statement the repository sends is the one the role is shown able to plan.
 */
export type StatementTag<Statement> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Statement;

/**
 * One statement. The insert's own rows are invisible to the statement's read of the table, so `inserted` answers for a
 * row stored now and the read for one stored by an earlier attempt. The image travels as hex text through `decode`, so
 * nothing depends on how the driver maps `bytea`.
 */
export function insertUnlessHeldStatement<Statement>(
  sql: StatementTag<Statement>,
  id: string,
  preset: PresetToRecord,
  documentJson: string,
): Statement {
  const { shape, walls, heightMm, typedName, thumbnail, thumbnailType } =
    preset;
  const thumbnailHex = Buffer.from(thumbnail).toString("hex");
  return sql`
    with inserted as (
      insert into presets (
        id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
        typed_name, thumbnail, thumbnail_type
      )
      values (
        ${id}, ${shape}, ${walls.aMm}::integer, ${walls.bMm ?? null}::integer, ${walls.cMm ?? null}::integer,
        ${heightMm}::integer, ${CURRENT_SCHEMA_VERSION}::integer, ${documentJson}::jsonb,
        ${typedName ?? null}::text, decode(${thumbnailHex}::text, 'hex'), ${thumbnailType}
      )
      on conflict (id) do nothing
      returning id
    )
    select (
      exists (select 1 from inserted)
      or exists (
        select 1 from presets
        where id = ${id} and shape = ${shape} and design_document = ${documentJson}::jsonb
      )
    ) as is_recorded
  `;
}

/**
 * The window is read over the columns, so the snapshots of rooms far from this one are never loaded. A wall the room
 * lacks matches only a wall the row lacks (`is null` against `is null`). A row written by a newer build
 * (`schema_version` above this build's) is not selected. Newest first; `id` breaks a tie so the order is a total one.
 */
export function selectPublishedNearStatement<Statement>(
  sql: StatementTag<Statement>,
  { shape, walls, windowMm, limit }: PresetNeighbourhood,
): Statement {
  return sql`
    select id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
      typed_name, thumbnail_type
    from presets
    where status = 'published'
      and schema_version <= ${CURRENT_SCHEMA_VERSION}::integer
      and shape = ${shape}
      and abs(wall_a_mm - ${walls.aMm}::integer) <= ${windowMm}::integer
      and (
        (wall_b_mm is null and ${walls.bMm ?? null}::integer is null)
        or abs(wall_b_mm - ${walls.bMm ?? null}::integer) <= ${windowMm}::integer
      )
      and (
        (wall_c_mm is null and ${walls.cMm ?? null}::integer is null)
        or abs(wall_c_mm - ${walls.cMm ?? null}::integer) <= ${windowMm}::integer
      )
    order by created_at desc, id
    limit ${limit}::integer
  `;
}

export function selectPublishedStatement<Statement>(
  sql: StatementTag<Statement>,
  id: string,
): Statement {
  return sql`
    select id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
      typed_name, thumbnail_type
    from presets
    where id = ${id} and status = 'published' and schema_version <= ${CURRENT_SCHEMA_VERSION}::integer
  `;
}

export function selectPublishedImageStatement<Statement>(
  sql: StatementTag<Statement>,
  id: string,
): Statement {
  return sql`
    select encode(thumbnail, 'hex') as thumbnail_hex, thumbnail_type
    from presets
    where id = ${id} and status = 'published' and schema_version <= ${CURRENT_SCHEMA_VERSION}::integer
  `;
}
