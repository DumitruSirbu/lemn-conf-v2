// M7 wave 7D4 — ADR 0110 Amendment F: which cabinet body stands in a base-row storage slot, and
// which of a plan's modules the storage cycle composed.
//
// **The wave exists because the largest approved room composed eleven identical `base-cabinet`s.**
// The owner's answer names two classes of front in roughly equal measure — *"if there is like space
// for 6 cabinets will be like 3 with drawers and 3 with doors"* — together with the widest spread of
// cabinet types the catalogue can supply.
//
// **There is no ratio constant here, and writing one would be the defect.** *Half* is a consequence
// of the cycle's shape rather than a number this module states: a four-step alternation whose two
// drawer steps are different products. At every even slot count the split is exact; at every odd one
// drawers carry the extra, because index 0 is a drawer and drawers are the preferred option. A fourth
// drawer row extends the cycle and the balance follows without a figure being edited. **Refused:**
// computing `floor(n / 2)` and then distributing it — two authorities for one fact, and the
// distribution step is where a run of identical cabinets comes back.
//
// **The second question this module answers is *whose module is this?*** After wave 7D3 the storage
// **role** has two referents: the cycle's slots, and the full-height columns of the block at wall A's
// free end, which carry `role: "storage"` deliberately so frame 1F's row set does not move (ADR 0110
// E5.2). Measured over 211 551 placed rooms, a rule scoped by that role is wrong on 32.8 % of them
// and one scoped by width on 14.9 % — in both cases against output that is **correct**, so the
// failure presents as a defect in a closed wave. A slot is therefore identified by **what composed
// it**; `isCycleStorageSlot` is the only answer to that question, and this is the only module in the
// repository that knows the id convention it reads.
//
// A pure leaf, beside `leftover-rule.ts` and for the reason that module exists: no catalogue, no
// probe, no design, no room, and no knowledge of how a run is laid out. It states no width and no
// price — those are the catalogue's, and a generation-side copy of one is the second authority
// [ADR 0102](../../../../docs/decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
// forbids.

/** ADR 0033 merged `base-1door` and `base-2door` into one row whose door count follows its width, so
 *  the catalogue holds exactly **one** door-front base body. That is why the owner's *"maximum
 *  cabinet types"* cannot be answered inside the door half of the balance. */
export const DOOR_BASE_BUILD_ID = "base-cabinet";

/** Three shallow drawers. Also the **preparation** cabinet's body from wave 7D4 on: the cutlery
 *  reached while cutting lives in drawers within reach of the preparation surface, which amends the
 *  *interim data* of ADR 0110 A1's reading order rather than the order itself. */
export const THREE_DRAWER_BASE_BUILD_ID = "base-3drawer";

/** Two deep pan drawers — a genuinely different product from the three-drawer base rather than the
 *  same row at another size, which is what makes the drawer half of the cycle carry two types. */
export const PAN_DRAWER_BASE_BUILD_ID = "base-panbank";

/** The kitchen's storage slots form one sequence and slot `i` takes `STORAGE_CYCLE[i % length]`.
 *
 *  Every member is a plain `baseCabinet(…)` row with `widthFlex: 'fit'`, so each drops into the
 *  600 mm module the leftover rule planned, at exactly that width: this wave changes a body's
 *  identity and never its width, and a body that could not be built at its planned tile width would
 *  move a tile boundary the merge and `plannedVoid` both depend on. */
const STORAGE_CYCLE: readonly string[] = [
  THREE_DRAWER_BASE_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  PAN_DRAWER_BASE_BUILD_ID,
  DOOR_BASE_BUILD_ID,
];

/** The id `storagePriorities` writes for a module the cycle composed. Declared here because the
 *  predicate below is the one reader of it (wave 7D4 criterion 22). */
const CYCLE_STORAGE_ID_PREFIX = "storage:";

/**
 * The body standing in the kitchen's `slotIndex`-th storage slot.
 *
 * The sequence is per kitchen and runs across the corner — wall B's slots from its free end to the
 * corner, then wall A's from the corner to its free end (ADR 0110 Amendment F). **That order is the
 * caller's**; this answers only what stands at an index, which is what keeps the balance a property
 * of the whole kitchen rather than of an engineering wall split the customer never sees.
 */
export function storageBodyAt(slotIndex: number): string {
  refuseASlotThatIsNotAWholePosition(slotIndex);
  const body = STORAGE_CYCLE[slotIndex % STORAGE_CYCLE.length];
  if (body === undefined) {
    throw new Error("storageBodyAt: the storage cycle declares no body");
  }
  return body;
}

function refuseASlotThatIsNotAWholePosition(slotIndex: number): void {
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    throw new Error(
      `storageBodyAt: slotIndex must be a non-negative whole slot position, not ${String(slotIndex)}`,
    );
  }
}

/** The one field the answer reads. Structural rather than an import of `PlannedGenerationBase`, so
 *  this leaf keeps the dependency floor its head comment claims. */
export interface ComposedModuleIdentity {
  readonly id: string;
}

/**
 * Did the **storage cycle** compose this module, as opposed to the tall-end block?
 *
 * **Neither the role nor the width can answer this**, and both look as though they can: a block
 * column carries `role: "storage"` by ADR 0110 E5.2, and E6.2 lets its outermost column absorb the
 * run's remainder up to 800 mm, so a rule reading either field is wrong on a third and on a seventh
 * of all placed rooms respectively — against output that is right. Provenance is what separates one
 * 600 mm module from another once they stop being identical.
 */
export function isCycleStorageSlot(base: ComposedModuleIdentity): boolean {
  return base.id.startsWith(CYCLE_STORAGE_ID_PREFIX);
}
