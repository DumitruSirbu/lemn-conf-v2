// Who the resize moves: the bodies filed under one column key, each resolved to the §7 entry it will
// be rebuilt through, and split by ADR 0035 decision 6 into the members the column's width governs
// and the hoods it does not.
import {
  EXTRACTOR_HOOD_KIND,
  resolveCatalogEquivalent,
  toInsertableBody,
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

/** §9's `canWidth` read from the engine's end, for the body the customer actually selected: a
 *  `fixedWidth` entry is made at one size, and a body with no §7 equivalent (the corners, ADR 0011
 *  Gap A) has nothing to be rebuilt through.
 *
 *  **Both halves refuse, and the refusal says which one did** (`NotResizableCause`). The two
 *  conditions are not exclusive and the caller cannot tell them apart from the outside: a row that
 *  is `fixedWidth` and also unfinished satisfies both, and reading the flag back off the record
 *  would call it a cabinet made at one width. ADR 0049 puts this sentence on screen for `fixed`
 *  alone, so the one function that already knows which fact refused is the one that publishes it —
 *  the answer still has a single author, and now so does the reason.
 *
 *  `unresolvable` wins when both hold, because a row with no entry to be rebuilt through has no
 *  label of its own either and would name its `kind` at the customer.
 *
 *  **Identity is declared, never inferred.** The equivalent comes from `resolveCatalogEquivalent`,
 *  which reads the pointer the row declares (ADR 0022) and verifies it is `insertable`. §5.4's
 *  `buildIdOf` mesh-tree inspection is closed by name in ADR 0011 Gap A, §6.3 and §13.2. */
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

/** ADR 0031 rule 1 as ADR 0035 decision 6 amends it: the scope is the column, so **every** member
 *  has to be rebuildable — **except the hood, which the column's width does not govern at all**.
 *
 *  A corner, an appliance or a hob standing at any level stops the whole move, and the refusal names
 *  that body rather than the selected one, because the customer is looking at something else
 *  entirely and needs to be told what is in the way.
 *
 *  **The hood is the one member that is neither.** It is sized to the cooktop it extracts over, not
 *  to the run it hangs on (owner, 2026-08-28: *"the cabinets is resizable but the hood over it
 *  should remain same size"*), so it does not narrow the column's widths, it does not stop the move,
 *  and it does not take the new width. It still **moves**: it re-centres over the run beneath it
 *  (ADR 0039 decision 4), which is why it comes back in a list of its own rather than being dropped.
 *  A hood that cannot be rebuilt at all still refuses the move, because re-centring it is not
 *  optional.
 *
 *  It stays an ordinary placement in its column throughout — the exemption is from the width rule,
 *  not from the model. See `EXTRACTOR_HOOD_KIND` for why the test is a `kind` and not a new flag.
 *
 *  **The exemption is about the hood's siblings, not about the hood itself.** It answers what
 *  happens to a hood when *something else* is resized, which is the whole of what ADR 0035 decision
 *  6 and ADR 0039 decision 4 decide. A customer selecting the hood and choosing its own width is
 *  decision 5's control, and what should happen to the run underneath then — nothing, most likely —
 *  is **not decided by any record**. So the selected body is always a full member of its column,
 *  hood or not, and that path behaves exactly as it did before this wave. Flagged for the owner
 *  rather than answered here; the shipped `hood-600` is `fixedWidth`, so nothing reachable today
 *  depends on the answer. */
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

/** One **sibling** of the selected body, resolved the same way — the selected body itself comes in
 *  already resolved, because §9's `canWidth` is answered on it by the caller.
 *
 *  A hood is asked only whether it can be **rebuilt**, never whether it can be **resized**: it keeps
 *  the width it has, so `fixedWidth` is not a fact about it that this move can violate. That is what
 *  lets the seeded `hood-600` — `fixedWidth: true` — re-centre over a run that resized under it. */
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

/** ADR 0035 decision 6 as amended, and ADR 0039 decision 4: the exemption is keyed off the hood's
 *  declared catalogue identity and nothing else. Deliberately **not** a `PlacementRecord` flag —
 *  ADR 0038 deleted the standalone-accessory machinery and the owner asked for this "without
 *  separating it again from cabinets". */
export function isHood(record: PlacementRecord): boolean {
  return record.kind === EXTRACTOR_HOOD_KIND;
}

/** `resolveResizableBody`'s refusal already carries the member's own name; this reads it back out
 *  rather than resolving the label a second time and risking two answers. */
function memberLabelOf(detail: RejectionDetail, fallback: string): string {
  return detail.code === "NOT_RESIZABLE" ? detail.params.label : fallback;
}

/** §3.2's membership: the bodies filed under one column key, in placement order. */
function columnMembers(
  records: readonly PlacementRecord[],
  col: string,
): readonly PlacementRecord[] {
  return records.filter((record) => record.col === col);
}

/** The §7 entry a body would be rebuilt through, in its insertable shape. A resize rebuilds through
 *  the catalogue equivalent, so **a resized seeded body migrates its `buildId`**: after resizing a
 *  `base-drawer2-600` the stored placement carries `base-panbank`. It has to —
 *  `buildDecomposedBody` takes no width, and every seeded id is one fixed geometry. */
function resolveRebuildBody(
  catalog: BodyCatalog,
  record: PlacementRecord,
): InsertableBody | undefined {
  const equivalent = resolveCatalogEquivalent(catalog, record.buildId);
  if (!equivalent) return undefined;
  return toInsertableBody(equivalent.buildId, equivalent.definition);
}

/** A seeded row carries no `label`, so the refusal falls back to the entry's kind — the same
 *  fallback §9's header uses. */
export function describeRecordLabel(
  catalog: BodyCatalog,
  record: PlacementRecord,
): string {
  return catalog.get(record.buildId)?.label ?? record.kind;
}

export function findPlacement(
  design: Design,
  placementId: string,
): DesignPlacement | undefined {
  return design.placements.find((placement) => placement.id === placementId);
}
