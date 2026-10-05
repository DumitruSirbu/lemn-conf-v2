// The pairing invariant of ADR 0079 decision 10 part 2 as a state predicate in a shared helper, so a test that drives
// the store gets the check without having read the ADR. It is not a refusal in `toEmptyColumn`: the check needs
// `occupiedDepthOfEntryM` at the design's declared depth, and the frozen-map writer holds neither a catalogue nor a
// setting. The invariant is unnarrowed (ADR 0102 decision 1); `isExplainedOrIsTheKnownLiftedColumnDefect` adds a
// temporary measured exemption for one production defect, pinned by `qa-6y-lifted-column-source.witness.test.ts`.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  columnBuildDepthMm,
  type BodyCatalog,
  deriveColumns,
  derivePlacementRecords,
  occupiedDepthM,
  occupiedDepthOfEntryM,
  toMetres,
  type CatalogEntryDepthQuery,
  type Column,
  type Design,
  type EmptyColumn,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { expect } from "vitest";

/** The narrowest thing this helper can be handed: whatever holds a design and the columns derived beside it, so a
 *  test need not own a store. */
export interface PublishedState {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  /** The catalogue this state was produced against, where it is not the shipped one: a source this helper cannot
   *  look up is skipped as a legal state, so a suite's own declared body would otherwise be invisible to the check.
   *  Absent means the shipped catalogue. */
  readonly catalogAt?: (cabinetDepthMm: number) => BodyCatalog;
}

/** Float slack on a comparison of two declared depths (sums of declared millimetres over 1000): the band
 *  `FROZEN_SURPLUS_EPSILON_M` and `DECLARED_DEPTH_EPSILON_M` occupy (ADR 0015). Exported so a test states which band
 *  it works in rather than writing `1e-9`. */
export const DECLARED_DEPTH_EPSILON_M = 1e-9;

/** One published column as the pairing invariant reads it: the depth it carries, the source it
 *  records, and **the bodies actually standing in it**. */
export interface RecordedSourceQuery {
  /** The depth the column carries, in metres. */
  readonly depthM: number;
  /** The column's own live answer, never the source entry's band: a fact about now, re-answered by every
   *  derivation. */
  readonly hasFullHeightUnder: boolean;
  /** The recorded `depthFromBuildId`, and the catalogue row it names at the design's own setting. */
  readonly source: CatalogEntryDepthQuery;
  /** The members standing in this column now. The exemption is keyed on one of them; an empty list leaves the
   *  invariant unexempted, which is the safe direction. */
  readonly members: readonly PlacementRecord[];
  readonly cabinetDepthMm: number;
}

/** ADR 0079 decision 10 point 2, exactly as written and with nothing carved out of it: the recorded
 *  entry's own declaration at the design's own setting **is** the depth the column carries. */
export function declarationIsTheDepth(query: RecordedSourceQuery): boolean {
  const declaredM = occupiedDepthOfEntryM(query.source);
  return Math.abs(declaredM - query.depthM) < DECLARED_DEPTH_EPSILON_M;
}

/** The invariant, or the one production defect this tree carries (ADR 0102 decision 3): an exemption under
 *  supervision, not a second authority, and no reader may cite its second half as a rule.
 *
 *  The defect: `resolveDepthM` (`commands/insert-fit.ts`) builds a wall body over a full-height column to
 *  `columnBuildDepthMm`'s lifted arm, never to the entry's `frameDepthMm`; `restoredColumns` (`void-engine.ts`) then
 *  records that member's `buildId` as the source of a depth its entry does not declare. The fix is wave 6Y, against
 *  `restoredColumns`; this exemption dies with it.
 *
 *  It is keyed on the body standing there, never on a coincidence of numbers (ADR 0102 decision 3a); all four must
 *  hold: the column lifts §5.2's head-clearance cap; the recorded entry is a wall carcass (a `wall-plane` entry
 *  declares a finished depth outright); a member standing in this column carries the recorded id; and that member's
 *  seat is the lifted arm's and what it occupies is the depth the column publishes.
 *
 *  Metres and the declared-depth band throughout; the integer discipline of `unexplainedStoredEntries` belongs to
 *  the invariant's own arm. */
export function isExplainedOrIsTheKnownLiftedColumnDefect(
  query: RecordedSourceQuery,
): boolean {
  return declarationIsTheDepth(query) || isTheKnownLiftedColumnDefect(query);
}

function isTheKnownLiftedColumnDefect(query: RecordedSourceQuery): boolean {
  if (!query.hasFullHeightUnder) return false;
  const { band, occupiedDepth } = query.source.definition;
  if (band !== "wall" && band !== "top") return false;
  if (occupiedDepth.measuredFrom !== "recorded-shell") return false;
  const liftedSeatM = toMetres(
    columnBuildDepthMm({
      cabinetDepthMm: query.cabinetDepthMm,
      hasFullHeightUnder: true,
    }) - occupiedDepth.frontAssemblyMm,
  );
  return query.members.some(
    (member) =>
      member.buildId === query.source.buildId &&
      Math.abs(member.frame.d - liftedSeatM) < DECLARED_DEPTH_EPSILON_M &&
      Math.abs(occupiedDepthM(member) - query.depthM) <
        DECLARED_DEPTH_EPSILON_M,
  );
}

/** Every published column whose recorded source fails to explain its recorded depth, minus the exemption, one line
 *  each. A column with no source, or one the catalogue does not hold, passes (ADR 0073 decision 3), which is why
 *  `assertSourcesExplainTheirDepths` asserts non-vacuity. */
export function unexplainedColumns(state: PublishedState): readonly string[] {
  return inspectedColumns(state)
    .filter(({ query }) => !isExplainedOrIsTheKnownLiftedColumnDefect(query))
    .map(asReportLine);
}

/** The invariant with no exemption applied: what `unexplainedColumns` would report once wave 6Y has landed, so the
 *  breach is pinned as a measured fact (ADR 0102 decision 3b). Its one caller is the witness suite. */
export function columnsWhoseSourceDoesNotDeclareTheirDepth(
  state: PublishedState,
): readonly string[] {
  return inspectedColumns(state)
    .filter(({ query }) => !declarationIsTheDepth(query))
    .map(asReportLine);
}

/** The published columns the two functions above inspected: those carrying a source the catalogue holds. The
 *  predicate holds trivially over a map with no known sources (ADR 0079 decision 10 part 3), so every caller asserts
 *  this is non-zero. */
export function columnsWithKnownSources(
  state: PublishedState,
): readonly string[] {
  return inspectedColumns(state).map(({ key }) => key);
}

/** The invariant and its non-vacuity as one call. `label` names the command that produced the state, since the
 *  predicate is checked after every command and a failure must say which. */
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

/** The same invariant asked of the document: every stored entry whose `depthFromBuildId` names a catalogue body
 *  whose declared depth at the document's setting is not the entry's `depthMm`.
 *
 *  Separate because the units differ: a published column is metres compared in a float band, a stored entry is a
 *  whole millimetre compared as integers, and folding them would round one side to suit the other. This half makes
 *  the defect durable: `projectFrozenMap` writes the pair into `columnExtents`. */
export function unexplainedStoredEntries(design: Design): readonly string[] {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const live = liveColumnsByAlongWallCentre(design);
  return storedEntriesOf(design).flatMap((entry) => {
    const buildId = entry.depthFromBuildId;
    if (buildId === undefined) return [];
    const definition = catalog.get(buildId);
    if (!definition) return [];
    const declaredMm = Math.round(
      occupiedDepthOfEntryM({ buildId, definition }) * 1000,
    );
    if (declaredMm === entry.depthMm) return [];
    // The exemption, through the same predicate as the published half so the two cannot drift (ADR 0088 decision 2). A
    // stored entry carries neither `hasFullHeightUnder` nor its members, so both are re-answered off the design's own
    // columns.
    const column = live.get(alongWallCentreKeyOf(entry));
    if (
      column !== undefined &&
      isTheKnownLiftedColumnDefect({
        depthM: toMetres(entry.depthMm),
        hasFullHeightUnder: column.hasFullHeightUnder,
        source: { buildId, definition },
        members: column.members,
        cabinetDepthMm,
      })
    ) {
      return [];
    }
    return [
      `${entry.wall}|${String(entry.alongMm)} depthMm=${String(entry.depthMm)} ` +
        `src=${buildId} declares ${String(declaredMm)} mm at ${String(cabinetDepthMm)}`,
    ];
  });
}

/** How many stored entries the check above inspected: the non-vacuity half, since a document with no sources
 *  satisfies it trivially. */
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

/** One column the invariant has something to say about: it records a source and the catalogue holds it. A pair so
 *  `columnsWithKnownSources` counts exactly the population the predicates walk. */
interface InspectedColumn {
  readonly key: string;
  readonly query: RecordedSourceQuery;
}

function inspectedColumns(state: PublishedState): readonly InspectedColumn[] {
  const cabinetDepthMm = cabinetDepthMmOf(state.design);
  const catalog = (state.catalogAt ?? buildKitchenLBodyCatalog)(cabinetDepthMm);
  const membersOf = membersByColumn(
    derivePlacementRecords(state.design, catalog),
  );
  return [...state.columns].flatMap(([key, column]) => {
    const buildId = column.depthFromBuildId;
    if (buildId === undefined) return [];
    const definition = catalog.get(buildId);
    if (!definition) return [];
    return [
      {
        key,
        query: {
          depthM: column.d,
          hasFullHeightUnder: column.hasFullHeightUnder,
          source: { buildId, definition },
          members: membersOf.get(key) ?? [],
          cabinetDepthMm,
        },
      },
    ];
  });
}

function asReportLine({ key, query }: InspectedColumn): string {
  const declaredMm = occupiedDepthOfEntryM(query.source) * 1000;
  return (
    `${key} d=${(query.depthM * 1000).toFixed(1)} mm, source ${query.source.buildId} declares ` +
    `${declaredMm.toFixed(1)} mm at ${String(query.cabinetDepthMm)}`
  );
}

/** What stands in each column, filed under the key `deriveColumns` publishes it as — the same
 *  `record.col` the store's own map is keyed on. */
function membersByColumn(
  records: readonly PlacementRecord[],
): ReadonlyMap<string, readonly PlacementRecord[]> {
  const byColumn = new Map<string, PlacementRecord[]>();
  for (const record of records) {
    const members = byColumn.get(record.col);
    if (members) members.push(record);
    else byColumn.set(record.col, [record]);
  }
  return byColumn;
}

/** The live column at each along-wall centre, with what stands in it: facts a stored entry does not carry.
 *
 *  Keyed on the along-wall centre, which `EmptyColumn.alongMm` records, so a wall-B run that slid when the corner
 *  deepened (ADR 0089) is matched to the column it became rather than the coordinate it left. */
function liveColumnsByAlongWallCentre(
  design: Design,
): ReadonlyMap<string, LiveColumn> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
  const membersOf = membersByColumn(records);
  return new Map(
    [...deriveColumns(records, {}, design.room)].map(([key, column]) => [
      `${column.wall}|${String(Math.round(1000 * (column.wall === "A" ? column.x : column.z)))}`,
      {
        hasFullHeightUnder: column.hasFullHeightUnder,
        members: membersOf.get(key) ?? [],
      },
    ]),
  );
}

interface LiveColumn {
  readonly hasFullHeightUnder: boolean;
  readonly members: readonly PlacementRecord[];
}

function alongWallCentreKeyOf(entry: EmptyColumn): string {
  return `${entry.wall}|${String(entry.alongMm)}`;
}

/** Both halves of the frozen map, as one list — they are one shape (ADR 0053) and this invariant
 *  makes no distinction between a space and an occupied column's extent. */
function storedEntriesOf(design: Design): readonly EmptyColumn[] {
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])];
}
