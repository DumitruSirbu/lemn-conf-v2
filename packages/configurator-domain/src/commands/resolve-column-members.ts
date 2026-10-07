// Who the resize moves: the bodies filed under one column key, each resolved to the §7 entry it will
// be rebuilt through, and split by ADR 0035 decision 6 into the members the column's width governs
// and the hoods it does not.
import {
  describeBodyName,
  kindLabel,
  EXTRACTOR_HOOD_KIND,
  resolveCatalogEquivalent,
  toInsertableBody,
  type BodyLabel,
  type InsertableBody,
} from "../catalog.js";
import type { Design, DesignPlacement } from "../design.js";
import type { BodyCatalog, PlacementRecord } from "../void-engine.js";
import type { RejectionDetail } from "./rejection.js";
import type {
  ColumnContext,
  ColumnMember,
  ColumnUnit,
  Resolved,
} from "./width-resize-model.js";

/** §9's `canWidth` read from the engine's end, for the body the customer selected: a `fixedWidth` entry
 *  is made at one size, and a body with no §7 equivalent (the corners, ADR 0011 Gap A) has nothing to
 *  be rebuilt through.
 *
 *  Both halves refuse and the refusal says which one did (`NotResizableCause`): they are not exclusive,
 *  and a row that is `fixedWidth` and also unfinished satisfies both. `unresolvable` wins when both
 *  hold, because a row with no entry has no label of its own and is named by its `kind`. Identity is
 *  declared, never inferred: `resolveCatalogEquivalent` reads the declared pointer (ADR 0022) and
 *  verifies it is `insertable`. */
export function resolveResizableBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): Resolved<InsertableBody> {
  const body = resolveRebuildBody(catalog, record);
  if (body && !record.fixedWidth) {
    return { ok: true, value: body };
  }
  return {
    ok: false,
    detail: {
      code: "NOT_RESIZABLE",
      params: {
        label: body?.label ?? describeRecordLabel(catalog, record),
        cause: body ? "fixed" : "unresolvable",
      },
    },
  };
}

/** ADR 0031 rule 1 as ADR 0035 decision 6 amends it: the scope is the column, so every member has to be
 *  rebuildable, except the hood, which the column's width does not govern.
 *
 *  A corner, an appliance or a hob at any level stops the whole move, and the refusal names that body
 *  rather than the selected one, because the customer is looking at something else.
 *
 *  The hood is sized to the cooktop it extracts over, not the run it hangs on: it does not narrow the
 *  column's widths, stop the move, or take the new width. It still **moves**, re-centring over the run
 *  beneath it (ADR 0039 decision 4), so it comes back in a list of its own; one that cannot be rebuilt
 *  still refuses the move. It stays an ordinary placement; see `EXTRACTOR_HOOD_KIND` for why the test
 *  is a `kind`.
 *
 *  The exemption is about the hood's siblings. A customer resizing the hood itself is a different
 *  control whose effect on the run beneath is decided by no record, so the selected body is always a
 *  full member of its column. Nothing reachable depends on it: the shipped `hood-600` is `fixedWidth`. */
export function splitColumnMembers(
  context: ColumnContext,
  selected: ColumnMember,
): Resolved<ColumnUnit> {
  const members: [ColumnMember, ...ColumnMember[]] = [selected];
  const hoods: ColumnMember[] = [];
  for (const sibling of columnMembers(context.records, selected.record.col)) {
    if (sibling.id === selected.record.id) continue;
    const member = resolveMember(context, sibling);
    if (!member.ok) return member;
    (isHood(sibling) ? hoods : members).push(member.value);
  }
  return { ok: true, value: { members, hoods } };
}

/** A record and its resolved entry, joined to the two integers the extent is read from. `undefined`
 *  only where a derived record has no placement behind it, which the derivation makes impossible —
 *  every caller turns it into `COLUMN_MISMATCH` rather than assuming it away. */
export function toColumnMember(
  design: Design,
  record: PlacementRecord,
  body: InsertableBody,
): ColumnMember | undefined {
  const placement = findPlacement(design, record.id);
  if (!placement) return undefined;
  return {
    record,
    body,
    alongMm: placement.alongMm,
    widthMm: placement.body.widthMm,
  };
}

/** One **sibling** of the selected body, resolved the same way (the selected body arrives resolved,
 *  because the caller answers §9's `canWidth` on it). A hood is asked only whether it can be
 *  **rebuilt**, never resized: it keeps its width, so `fixedWidth` cannot be violated, which lets the
 *  seeded `hood-600` re-centre over a run that resized under it. */
function resolveMember(
  context: ColumnContext,
  record: PlacementRecord,
): Resolved<ColumnMember> {
  const { catalog, label } = context;
  const body = isHood(record)
    ? resolveRebuildableHood(catalog, record)
    : resolveResizableBody(catalog, record);
  if (!body.ok) {
    return {
      ok: false,
      detail: {
        code: "COLUMN_MEMBER_NOT_RESIZABLE",
        params: { label, memberLabel: memberLabelOf(body.detail, label) },
      },
    };
  }
  const member = toColumnMember(context.design, record, body.value);
  if (!member) {
    return {
      ok: false,
      detail: { code: "COLUMN_MISMATCH", params: { label } },
    };
  }
  return { ok: true, value: member };
}

function resolveRebuildableHood(
  catalog: BodyCatalog,
  record: PlacementRecord,
): Resolved<InsertableBody> {
  const body = resolveRebuildBody(catalog, record);
  if (body) return { ok: true, value: body };
  return {
    ok: false,
    detail: {
      code: "NOT_RESIZABLE",
      // A hood that cannot be rebuilt is the second half of the same fact: there is no §7 entry to
      // re-centre it through, which is missing data and never a width the catalogue declares.
      params: {
        label: describeRecordLabel(catalog, record),
        cause: "unresolvable",
      },
    },
  };
}

/** The exemption is keyed off the hood's declared catalogue identity and nothing else (ADR 0035
 *  decision 6, ADR 0039 decision 4): deliberately not a `PlacementRecord` flag, so the hood is not
 *  separated again from cabinets. */
export function isHood(record: PlacementRecord): boolean {
  return record.kind === EXTRACTOR_HOOD_KIND;
}

/** `resolveResizableBody`'s refusal already carries the member's own name; this reads it back out
 *  rather than resolving the label a second time and risking two answers. */
function memberLabelOf(
  detail: RejectionDetail,
  fallback: BodyLabel,
): BodyLabel {
  return detail.code === "NOT_RESIZABLE" ? detail.params.label : fallback;
}

/** §3.2's membership: the bodies filed under one column key, in placement order. */
function columnMembers(
  records: readonly PlacementRecord[],
  col: string,
): readonly PlacementRecord[] {
  return records.filter((record) => record.col === col);
}

/** The §7 entry a body would be rebuilt through, in its insertable shape. A resize rebuilds through the
 *  catalogue equivalent, so **a resized seeded body migrates its `buildId`** (`base-drawer2-600`
 *  becomes `base-panbank`): `buildDecomposedBody` takes no width and every seeded id is one fixed
 *  geometry. */
export function resolveRebuildBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): InsertableBody | undefined {
  const equivalent = resolveCatalogEquivalent(catalog, record.buildId);
  if (!equivalent) return undefined;
  return toInsertableBody(equivalent.buildId, equivalent.definition);
}

/** The descriptor a refusal names this placement by (§9's header rule), resolved through
 *  `describeBodyName` so a body and the sentence refusing it never disagree. It publishes a descriptor,
 *  not the raw `kind`, because the customer reads it: the six corner rows have no catalogue equivalent
 *  to inherit a name from (ADR 0022). A `buildId` the catalogue does not hold is named by the
 *  record's own kind. */
export function describeRecordLabel(
  catalog: BodyCatalog,
  record: PlacementRecord,
): BodyLabel {
  const definition = catalog.get(record.buildId);
  if (definition === undefined) return kindLabel(record.kind);
  return describeBodyName({ buildId: record.buildId, definition });
}

export function findPlacement(
  design: Design,
  placementId: string,
): DesignPlacement | undefined {
  return design.placements.find((placement) => placement.id === placementId);
}
