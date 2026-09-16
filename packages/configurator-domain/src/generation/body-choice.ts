// M7 wave 7D4 — ADR 0110 Amendment H: which cabinet body stands in a base-row storage slot, and
// which of a plan's modules generation composed as one.
//
// **The wave exists because the largest approved room composed eleven identical `base-cabinet`s.**
// The owner's answer is a **run order** rather than a proportion — *"Fridge (if space - door
// cabinet) => sink => drawer cabinetss (if space drawer cabinet) hub => bottle cabinets (if space
// for a large number of cabinets, the drawer cabinet) and after only door cabinets to fit spaces or
// tall cabinets instead of door but at the edge"* — so a body follows its **position in the run**,
// and two of that order's clauses are door cabinets the generator already composes (H2).
//
// **There is no cycle here and no ratio constant, and writing either would be the defect.** A
// storage slot takes the door body; the one slot standing first after the hob in the **reading**
// order takes a drawer body instead, and locating that slot is the composer's job rather than this
// leaf's (D15.7). How many drawers a kitchen ends up with follows from how long its run is and from
// where 7D3's block took the free end. **Refused:** an alternation over the slot index, which is
// what this module held until D14 — it composed a proportion the owner corrected in writing one day
// after it shipped, and a proportion is not the composer's to promise (ADR 0110 G6, H4).
//
// **The order is the composer's and the ids are this module's.** Which slot stands first after the
// hob is a fact about the reading order, the wall cut and the corner, and `generation-priorities.ts`
// holds all three. What this leaf guarantees instead is that every body it names is a plain
// `baseCabinet(…)` row with `widthFlex: 'fit'`, so each drops into the 600 mm module the leftover
// rule planned, at exactly that width: **this wave changes a body's identity and never its width**,
// and a body that could not be built at its planned tile width would move a tile boundary the merge
// and `plannedVoid` both depend on. 7D4 builds only the width-neutral half of the owner's order
// (H6); the bottle cabinet and the second drawer cabinet are 7D5's, and both are width changes.
//
// **The second question this module answers is *whose module is this?*** After wave 7D3 the storage
// **role** has two referents: the storage run's slots, and the full-height columns of the block at
// wall A's free end, which carry `role: "storage"` deliberately so frame 1F's row set does not move
// (ADR 0110 E5.2). Measured over 211 551 placed rooms, a rule scoped by that role is wrong on 32.8 %
// of them and one scoped by width on 14.9 % — in both cases against output that is **correct**, so
// the failure presents as a defect in a closed wave. A slot is therefore identified by **what
// composed it**; `isComposedStorageSlot` is the only answer to that question, and this is the only
// module in the repository that knows the id convention it reads.
//
// A pure leaf, beside `leftover-rule.ts` and for the reason that module exists: no catalogue, no
// probe, no design, no room, and no knowledge of how a run is laid out. It states no width and no
// price — those are the catalogue's, and a generation-side copy of one is the second authority
// [ADR 0102](../../../../docs/decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
// forbids.

/** ADR 0033 merged `base-1door` and `base-2door` into one row whose door count follows its width, so
 *  the catalogue holds exactly **one** door-front base body. It fills every storage slot the owner's
 *  order does not name — *"after only door cabinets to fit spaces"* (Amendment H2). */
export const DOOR_BASE_BUILD_ID = "base-cabinet";

/** Three shallow drawers. The **preparation** cabinet's body from wave 7D4 on — the cutlery reached
 *  while cutting lives in drawers within reach of the preparation surface — and the body of the one
 *  storage slot standing first after the hob in the reading order (D15.3). Both amend the *interim
 *  data* of ADR 0110 A1's reading order rather than the order itself. */
export const THREE_DRAWER_BASE_BUILD_ID = "base-3drawer";

/** Two deep pan drawers — a genuinely different product from the three-drawer base rather than the
 *  same row at another size, which is what lets the drawer group carry two types.
 *
 *  **Generation places it nowhere in this wave and it is kept anyway**, reversing ADR 0110 G7's
 *  ruling that a constant with no reader is dead configuration. G7 was right while the rule composed
 *  one drawer per kitchen; under the owner's run order the drawer group astride the hob takes a
 *  second member (H1), and 7D5 is the wave that places it. **ADR 0118 is not violated**: the caller
 *  is a planned wave behind a dated owner ruling, not a hazard someone imagined. */
export const PAN_DRAWER_BASE_BUILD_ID = "base-panbank";

/** The id `storagePriorities` writes for a module the storage run composed. Declared here because
 *  the predicate below is the one reader of it (wave 7D4 criterion 22). */
const COMPOSED_STORAGE_ID_PREFIX = "storage:";

/** The one field the answer reads. Structural rather than an import of `PlannedGenerationBase`, so
 *  this leaf keeps the dependency floor its head comment claims. */
export interface ComposedModuleIdentity {
  readonly id: string;
}

/**
 * Did the **storage run** compose this module, as opposed to the tall-end block?
 *
 * **Neither the role nor the width can answer this**, and both look as though they can: a block
 * column carries `role: "storage"` by ADR 0110 E5.2, and E6.2 lets its outermost column absorb the
 * run's remainder up to 800 mm, so a rule reading either field is wrong on a third and on a seventh
 * of all placed rooms respectively — against output that is right. Provenance is what separates one
 * 600 mm module from another once they stop being identical.
 */
export function isComposedStorageSlot(base: ComposedModuleIdentity): boolean {
  return base.id.startsWith(COMPOSED_STORAGE_ID_PREFIX);
}
