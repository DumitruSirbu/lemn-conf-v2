// ADR 0079 decision 10 part 2: the pairing invariant as a **state predicate**, in a shared helper the
// ordinary store suite calls.
//
// It lives here rather than inside one test file because of what both 6K-c defects had in common:
// each published a **correct** depth beside a **false** record. F1's `B|1.80` measured 699 mm with a
// 699 mm pantry standing in it, and recorded a body that declares 600 at every setting as the source.
// No assertion about the transition can see that — the number it produced was right — and the lie is
// only cashed one or two commands later, once the pantry is gone and the record is the only thing
// left to answer from. A test that drives the store should get this check without its author having
// read ADR 0079, which is what "shared helper" buys and what a private copy in the adversarial file
// does not.
//
// **Not a refusal in `toEmptyColumn`.** That is where a disagreeing pair enters the document and is
// the obvious place to fail closed, beside `refuseUnreproducibleKey`. ADR 0079 decision 10 refuses it:
// the check needs `occupiedDepthOfEntryM` at the design's declared depth, and the frozen-map writer
// holds neither a catalogue nor a setting.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  columnBuildDepthM,
  columnBuildDepthMm,
  deriveColumns,
  derivePlacementRecords,
  occupiedDepthOfEntryM,
  type Column,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { expect } from "vitest";

/** The narrowest thing this helper can be handed: whatever holds a design and the columns derived
 *  beside it. A zustand store satisfies it, and so does a hand-built pair, so a test does not have to
 *  own a store to be checked. */
export interface PublishedState {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
}

/** Float slack on a comparison of two declared depths, not manufacturing slack — the band
 *  `FROZEN_SURPLUS_EPSILON_M` and the void engine's own `DECLARED_DEPTH_EPSILON_M` occupy for the
 *  same reason (ADR 0015). Both sides are sums of declared millimetres divided by 1000.
 *
 *  Exported so a test comparing two declared depths states which band it is working in rather than
 *  writing `1e-9` and leaving the next reader to guess whether it meant a fit tolerance. */
export const DECLARED_DEPTH_EPSILON_M = 1e-9;

/** **Which declaration explains a column's depth: the entry's own, or its column's build depth.**
 *
 *  For all but one population it is the entry's, and that is ADR 0079 decision 10 point 2 as
 *  written. The exception is a **wall body standing in a column that lifts the head-clearance cap**:
 *  `resolveDepthM` builds it to `columnBuildDepthM`'s lifted arm — the cabinet-depth line — and
 *  never to the entry's `frameDepthMm`, so the placement's recorded seat is 561 at 600 and 661 at
 *  700 where its entry's fallback seat is 291 and 361. The column then carries 600 or 700 and the
 *  entry declares 330 or 400, and the pair disagrees while nothing is wrong.
 *
 *  **The premise this re-quantifies was retired by the product, not by a wave** (ADR 0091
 *  decision 1's third limb, as ADR 0093 applies it). Decision 10's predicate assumes an entry's
 *  `frameDepthMm` is the seat of every placement of that entry; wave 6I2's lifted arm made that
 *  false, and ADR 0101 is what brought the shipped kitchen into the population. **It was reachable
 *  before ADR 0101 and at 600 mm**: put an ordinary `wall-2door-600-top` over `tall-pantry-600` —
 *  the only wall-B column where a top wins §3.2's MAX — change the depth, and the column publishes
 *  600 from a `wall-cabinet` that declares 330. Measured 2026-09-07.
 *
 *  **It is a second authority, not a wider tolerance.** The alternative is exactly the number
 *  `resolveDepthM` would plan for a body rebuilt in this column, and it is offered only to a wall
 *  body in a lifted column. Everything else is held to decision 10's predicate unchanged. */
export function sourceExplainsTheDepth(input: {
  /** The depth the column carries, in metres. */
  readonly depthM: number;
  /** The column's own live answer — never the source entry's band. */
  readonly hasFullHeightUnder: boolean;
  /** The **source entry's** band, because §5.2's lift reaches a wall carcass and nothing else. */
  readonly band: string;
  readonly declaredM: number;
  readonly cabinetDepthMm: number;
}): boolean {
  if (Math.abs(input.declaredM - input.depthM) < DECLARED_DEPTH_EPSILON_M) {
    return true;
  }
  if (input.band !== "wall" && input.band !== "top") return false;
  if (!input.hasFullHeightUnder) return false;
  const builtM = columnBuildDepthM({
    cabinetDepthMm: input.cabinetDepthMm,
    hasFullHeightUnder: true,
  });
  return Math.abs(builtM - input.depthM) < DECLARED_DEPTH_EPSILON_M;
}

/** Every published column whose recorded source **fails to explain its own recorded depth**, as one
 *  readable line each.
 *
 *  A column passes when it records no source at all, or one the catalogue does not hold — both are
 *  legal states (ADR 0073 decision 3, ADR 0052) and both are why `assertSourcesExplainTheirDepths`
 *  asserts non-vacuity beside this. Otherwise the depth the column carries is explained by one of
 *  the two authorities `sourceExplainsTheDepth` names, read at **the design's own declared
 *  setting**. */
export function unexplainedColumns(state: PublishedState): readonly string[] {
  const cabinetDepthMm = cabinetDepthMmOf(state.design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  return [...state.columns].flatMap(([key, column]) => {
    const buildId = column.depthFromBuildId;
    if (buildId === undefined) return [];
    const definition = catalog.get(buildId);
    if (!definition) return [];
    const declaredM = occupiedDepthOfEntryM({ buildId, definition });
    if (
      sourceExplainsTheDepth({
        depthM: column.d,
        hasFullHeightUnder: column.hasFullHeightUnder,
        band: definition.band,
        declaredM,
        cabinetDepthMm,
      })
    ) {
      return [];
    }
    return [
      `${key} d=${(column.d * 1000).toFixed(1)} mm, source ${buildId} declares ` +
        `${(declaredM * 1000).toFixed(1)} mm at ${String(cabinetDepthMm)}`,
    ];
  });
}

/** How many published columns the predicate above actually **inspected** — the ones carrying a source
 *  the catalogue holds.
 *
 *  ADR 0079 decision 10 part 3: the predicate holds trivially over a map with no sources, or with only
 *  sources the catalogue has never heard of, and both are reachable states. A check that cannot fail
 *  is the failure mode this project has now shipped twice, so every caller asserts this is non-zero. */
export function columnsWithKnownSources(
  state: PublishedState,
): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(state.design));
  return [...state.columns]
    .filter(([, column]) => {
      const buildId = column.depthFromBuildId;
      return buildId !== undefined && catalog.has(buildId);
    })
    .map(([key]) => key);
}

/** **The invariant and its non-vacuity, as one call** — so a test that drives the store gets both or
 *  neither, and cannot accidentally assert the empty statement.
 *
 *  `label` names the command that produced the state, because the whole point of a state predicate is
 *  that it is checked after *every* command and a failure has to say which one. */
export function assertSourcesExplainTheirDepths(
  state: PublishedState,
  label: string,
): void {
  expect(unexplainedColumns(state), label).toStrictEqual([]);
  expect(
    columnsWithKnownSources(state).length,
    `${label}: the invariant inspected no column at all`,
  ).toBeGreaterThan(0);
}

/** The same invariant asked of the **document** rather than of the published map: every stored entry
 *  whose `depthFromBuildId` names a body the catalogue holds and whose declared depth at the
 *  document's own setting is not the `depthMm` the entry carries.
 *
 *  It is a separate function rather than a second caller of `unexplainedColumns` because the units
 *  differ where it matters. A published column carries metres and is compared inside a float band; a
 *  stored entry carries the **whole millimetre** `toEmptyColumn` persisted, so the comparison is an
 *  integer one and no epsilon belongs in it. Folding the two together would mean rounding one side
 *  to suit the other, which is how a comparison stops meaning what it says.
 *
 *  This is the half that makes the defect durable: `projectFrozenMap` writes the pair into
 *  `columnExtents`, so a disagreeing one is saved and reloaded rather than being a session slip. */
export function unexplainedStoredEntries(design: Design): readonly string[] {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const lifted = liftedAlongWallCentresMm(design);
  const liftedBuildDepthMm = columnBuildDepthMm({
    cabinetDepthMm,
    hasFullHeightUnder: true,
  });
  return storedEntriesOf(design).flatMap((entry) => {
    const buildId = entry.depthFromBuildId;
    if (buildId === undefined) return [];
    const definition = catalog.get(buildId);
    if (!definition) return [];
    const declaredMm = Math.round(
      occupiedDepthOfEntryM({ buildId, definition }) * 1000,
    );
    if (declaredMm === entry.depthMm) return [];
    // `sourceExplainsTheDepth`'s second authority, on the document. A stored entry carries no
    // `hasFullHeightUnder` of its own — it is the one field ADR 0011 Gap D deliberately does not
    // freeze — so it is re-answered off the design's own columns, which is where the live map reads
    // it too.
    if (
      (definition.band === "wall" || definition.band === "top") &&
      lifted.has(alongWallCentreKeyOf(entry)) &&
      liftedBuildDepthMm === entry.depthMm
    ) {
      return [];
    }
    return [
      `${entry.wall}|${String(entry.alongMm)} depthMm=${String(entry.depthMm)} ` +
        `src=${buildId} declares ${String(declaredMm)} mm at ${String(cabinetDepthMm)}`,
    ];
  });
}

/** How many stored entries the check above actually inspected — the non-vacuity half, for the reason
 *  `columnsWithKnownSources` exists: a document with no sources satisfies it trivially. */
export function storedEntriesWithKnownSources(
  design: Design,
): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return storedEntriesOf(design)
    .filter((entry) => {
      const buildId = entry.depthFromBuildId;
      return buildId !== undefined && catalog.has(buildId);
    })
    .map((entry) => `${entry.wall}|${String(entry.alongMm)}`);
}

/** The document half of `assertSourcesExplainTheirDepths`, with its own non-vacuity, so a test
 *  asserting about a saved design gets both or neither. */
export function assertStoredSourcesExplainTheirDepths(
  design: Design,
  label: string,
): void {
  expect(unexplainedStoredEntries(design), label).toStrictEqual([]);
  expect(
    storedEntriesWithKnownSources(design).length,
    `${label}: the invariant inspected no stored entry at all`,
  ).toBeGreaterThan(0);
}

/** Where a full-height member stands, keyed by wall and along-wall centre in whole millimetres.
 *
 *  Derived from the design rather than read off the entry, because `hasFullHeightUnder` is the one
 *  fact a frozen extent does not carry: ADR 0011's third correction makes it a fact about **now**,
 *  re-answered by every derivation.
 *
 *  Keyed on the along-wall **centre**, which is what `EmptyColumn.alongMm` records and what
 *  `deriveColumnKeyAt` renders — so a wall-B run that slid when the corner deepened (ADR 0089) is
 *  still matched to the column it became rather than to the coordinate it left. */
function liftedAlongWallCentresMm(design: Design): ReadonlySet<string> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
  return new Set(
    [...deriveColumns(records, {}, design.room).values()]
      .filter((column) => column.hasFullHeightUnder)
      .map(
        (column) =>
          `${column.wall}|${String(Math.round(1000 * (column.wall === "A" ? column.x : column.z)))}`,
      ),
  );
}

function alongWallCentreKeyOf(entry: EmptyColumn): string {
  return `${entry.wall}|${String(entry.alongMm)}`;
}

/** Both halves of the frozen map, as one list — they are one shape (ADR 0053) and this invariant
 *  makes no distinction between a space and an occupied column's extent. */
function storedEntriesOf(design: Design): readonly EmptyColumn[] {
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])];
}
