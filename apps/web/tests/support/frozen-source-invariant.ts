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
//
// **The invariant itself is unchanged and unnarrowed** (ADR 0102 decision 1). What this module
// carries beside it is an **acknowledged, measured, temporary exemption** for one production defect —
// `isExplainedOrIsTheKnownLiftedColumnDefect` — which is not a second authority and may not be cited
// as a rule. Its whole shape is set by ADR 0102 decision 3, and the breach it waves through is pinned
// positively by `qa-6y-lifted-column-source.witness.test.ts`, which goes red the day wave 6Y lands.
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

/** The narrowest thing this helper can be handed: whatever holds a design and the columns derived
 *  beside it. A zustand store satisfies it, and so does a hand-built pair, so a test does not have to
 *  own a store to be checked. */
export interface PublishedState {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  /** **The catalogue this state was produced against**, where it is not the shipped one.
   *
   *  A suite that declares its own body (`pinned-top-witness.ts`) drives the store with a catalogue
   *  the shipped map does not hold, and a source this helper cannot look up is skipped as a legal
   *  state — so without this the declared body would be invisible to the very check it exists to
   *  keep falsifiable. Absent means the shipped catalogue, which is every other caller. */
  readonly catalogAt?: (cabinetDepthMm: number) => BodyCatalog;
}

/** Float slack on a comparison of two declared depths, not manufacturing slack — the band
 *  `FROZEN_SURPLUS_EPSILON_M` and the void engine's own `DECLARED_DEPTH_EPSILON_M` occupy for the
 *  same reason (ADR 0015). Both sides are sums of declared millimetres divided by 1000.
 *
 *  Exported so a test comparing two declared depths states which band it is working in rather than
 *  writing `1e-9` and leaving the next reader to guess whether it meant a fit tolerance. */
export const DECLARED_DEPTH_EPSILON_M = 1e-9;

/** One published column as the pairing invariant reads it: the depth it carries, the source it
 *  records, and **the bodies actually standing in it**. */
export interface RecordedSourceQuery {
  /** The depth the column carries, in metres. */
  readonly depthM: number;
  /** The column's own live answer — never the source entry's band. ADR 0011's third correction
   *  makes this a fact about *now*, re-answered by every derivation. */
  readonly hasFullHeightUnder: boolean;
  /** The recorded `depthFromBuildId`, and the catalogue row it names at the design's own setting. */
  readonly source: CatalogEntryDepthQuery;
  /** **The members standing in this column right now.** The exemption below is keyed on one of
   *  them, so a caller with no members to offer passes an empty list and gets ADR 0079 decision 10
   *  point 2 unexempted — which is the safe direction and the one a member-less frozen extent
   *  deserves. */
  readonly members: readonly PlacementRecord[];
  readonly cabinetDepthMm: number;
}

/** ADR 0079 decision 10 point 2, exactly as written and with nothing carved out of it: the recorded
 *  entry's own declaration at the design's own setting **is** the depth the column carries. */
export function declarationIsTheDepth(query: RecordedSourceQuery): boolean {
  const declaredM = occupiedDepthOfEntryM(query.source);
  return Math.abs(declaredM - query.depthM) < DECLARED_DEPTH_EPSILON_M;
}

/** **The invariant above, or the one production defect this tree currently carries** — ADR 0102
 *  decision 3, and it is an exemption under supervision rather than a second authority.
 *
 *  ADR 0102 decision 2 refused the predicate this replaces. Read its name: `sourceExplainsTheDepth`
 *  asserted, in the identifier itself, the statement that is false in the second arm. Nothing here
 *  says the source explains the depth. It says the pair either agrees, **or** disagrees in exactly
 *  the one shape wave 6I2's defect makes — and no reader may cite the second half as a rule.
 *
 *  **The defect.** `resolveDepthM` (`commands/insert-fit.ts`) builds a wall body over a full-height
 *  column to `columnBuildDepthMm`'s lifted arm — the cabinet-depth line — and never to the entry's
 *  `frameDepthMm`; `restoredColumns` (`void-engine.ts`) then records that member's `buildId` as the
 *  source of a depth its entry does not declare. Measured on the shipped kitchen, 2026-09-08:
 *  `B|1.90 d=700.0 src=wall-cabinet declares 400.0 at 700`, one ordinary command from load. The fix
 *  is **wave 6Y**, against `restoredColumns`; this exemption dies with it.
 *
 *  **Keyed on the body standing there, never on a coincidence of numbers** (ADR 0102 decision 3a).
 *  The refused version asked only whether `depthM` equalled the lifted build depth, which waved
 *  through every source id in that column — one declaring 330, one declaring 620, one naming a body
 *  that was never there — and so stopped inspecting the single column the defect lives in. All four
 *  conditions below have to hold, and each of them can fail:
 *
 *  - the column lifts §5.2's head-clearance cap, by its own live answer;
 *  - the recorded entry is a wall carcass, because the lift reaches those and nothing else — and a
 *    `wall-plane` entry declares a finished depth outright, so the lift never set its seat;
 *  - a member **standing in this column carries the recorded id**, so a record naming a body that is
 *    not there fails as it did before — which is 6K-c's F1 shape, and it stays catchable here;
 *  - that member's recorded seat is the one the lifted arm produces, and what it occupies is the
 *    depth the column publishes — so a member at any other seat, and a frozen surplus no member
 *    reaches, both fail.
 *
 *  Metres and the declared-depth band throughout, including for the document half: every quantity in
 *  the comparison is a sum of declared millimetres divided by 1000, which is what
 *  `DECLARED_DEPTH_EPSILON_M` names. The integer discipline `unexplainedStoredEntries` keeps belongs
 *  to the invariant's own arm, where a stored whole millimetre meets an entry's declaration. */
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

/** Every published column whose recorded source **fails to explain its own recorded depth**, minus
 *  the acknowledged exemption above — as one readable line each.
 *
 *  A column passes when it records no source at all, or one the catalogue does not hold — both are
 *  legal states (ADR 0073 decision 3, ADR 0052) and both are why `assertSourcesExplainTheirDepths`
 *  asserts non-vacuity beside this. */
export function unexplainedColumns(state: PublishedState): readonly string[] {
  return inspectedColumns(state)
    .filter(({ query }) => !isExplainedOrIsTheKnownLiftedColumnDefect(query))
    .map(asReportLine);
}

/** **The invariant with no exemption applied at all** — ADR 0079 decision 10 point 2 as its own
 *  amendment restates it, over the same population.
 *
 *  This is what `unexplainedColumns` would report if wave 6Y had already landed, and it exists so
 *  the breach can be pinned as a measured fact rather than merely tolerated (ADR 0102 decision 3b).
 *  Its one caller is the witness suite; an ordinary test asserting a green tree wants
 *  `assertSourcesExplainTheirDepths`. */
export function columnsWhoseSourceDoesNotDeclareTheirDepth(
  state: PublishedState,
): readonly string[] {
  return inspectedColumns(state)
    .filter(({ query }) => !declarationIsTheDepth(query))
    .map(asReportLine);
}

/** Which published columns the two functions above actually **inspected** — the ones carrying a
 *  source the catalogue holds.
 *
 *  ADR 0079 decision 10 part 3: the predicate holds trivially over a map with no sources, or with only
 *  sources the catalogue has never heard of, and both are reachable states. A check that cannot fail
 *  is the failure mode this project has now shipped twice, so every caller asserts this is non-zero. */
export function columnsWithKnownSources(
  state: PublishedState,
): readonly string[] {
  return inspectedColumns(state).map(({ key }) => key);
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
    // The acknowledged exemption, on the document, through the **same** predicate the published half
    // uses — one author for one rule (ADR 0088 decision 2), which is what stops the two halves
    // drifting while the exemption stands. A stored entry carries neither `hasFullHeightUnder` nor
    // its members — ADR 0011 Gap D deliberately freezes neither — so both are re-answered off the
    // design's own columns, which is where the live map reads them too.
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

/** One column the invariant has something to say about: it records a source and the catalogue holds
 *  it. Carried as a pair so `columnsWithKnownSources` counts exactly the population the predicates
 *  walk, rather than a second list that could drift from it. */
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

/** The live column at each along-wall centre, with what stands in it — the two facts the exemption
 *  needs and a stored entry does not carry.
 *
 *  Derived from the design rather than read off the entry, because `hasFullHeightUnder` is the one
 *  fact a frozen extent does not carry: ADR 0011's third correction makes it a fact about **now**,
 *  re-answered by every derivation.
 *
 *  Keyed on the along-wall **centre**, which is what `EmptyColumn.alongMm` records and what
 *  `deriveColumnKeyAt` renders — so a wall-B run that slid when the corner deepened (ADR 0089) is
 *  still matched to the column it became rather than to the coordinate it left. */
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
