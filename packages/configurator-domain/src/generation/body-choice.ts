// ADR 0110 Amendment H: which cabinet body stands in a base-row storage slot, and which of a plan's
// modules generation composed as one.
//
// The owner's rule is a run order, not a proportion (H2): a storage slot takes the door body, and the
// one slot standing first after the hob in the reading order takes a drawer body instead. Locating that
// slot is the composer's job, not this leaf's (D15.7). There is no cycle and no ratio constant: an
// alternation over the slot index composed a proportion the owner corrected in writing, and a
// proportion is not the composer's to promise (ADR 0110 G6, H4).
//
// Every body this leaf names is a plain `baseCabinet(…)` row with `widthFlex: 'fit'`, so it drops into
// the 600 mm module the leftover rule planned at exactly that width: a body that could not be built at
// its planned tile width would move a tile boundary the merge and `plannedVoid` both depend on. Only the
// width-neutral half of the owner's order lives here (H6); the bottle and second drawer cabinet are
// width changes.
//
// Whose module is this? The storage **role** has six referents: the storage run's composed slots
// (`storage:<wall>:<n>`), the tall-end block's full-height columns (`role: "storage"` deliberately, so
// frame 1F's row set does not move, ADR 0110 E5.2), the bottle cabinet, the pan drawer, the threshold
// drawer and the dishwasher. A rule scoped by that role is wrong on 32.8 % of 211 551 placed rooms and
// one scoped by width on 14.9 %, against correct output, so it presents as a defect in a closed wave.
// A slot is therefore identified by what composed it: `isComposedStorageSlot` is the only answer, and
// this is the only module that knows the id convention it reads.
//
// A pure leaf, beside `leftover-rule.ts`: no catalogue, probe, design, room or run layout. It states no
// width and no price; a generation-side copy of one would be a second authority (ADR 0102).

/** ADR 0033 merged `base-1door` and `base-2door` into one row whose door count follows its width, so
 *  the catalogue holds one door-front base body. It fills every storage slot the owner's order does not
 *  name (Amendment H2). */
export const DOOR_BASE_BUILD_ID = "base-cabinet";

/** Three shallow drawers: the **preparation** cabinet's body, the body of the one storage slot standing
 *  first after the hob in the reading order (D15.3), and the threshold drawer's body, the module added
 *  after the bottle where the run is long (ADR 0110 Q-H5). */
export const THREE_DRAWER_BASE_BUILD_ID = "base-3drawer";

/** The fixed-width cargo that stands immediately after the hob in the reading order when the same
 * core kitchen, and the pan drawer where it stood, still fit (ADR 0110 Q-H6b). Once the pan drawer
 * stands, the bottle gives way rather than cost that kitchen a tall column (Q-H6c). Its offered widths
 * remain catalogue data; this leaf names only the body chosen by the composer. */
export const BOTTLE_CARGO_BUILD_ID = "base-bottle-cargo";

/** Two deep pan drawers: a different product from the three-drawer base, which lets the drawer group
 *  carry two types. It stands immediately before the hob in the reading order, on the hob's wall,
 *  wherever that keeps every core role on its wall and costs no tall column (`optional-run-items.ts`,
 *  ADR 0110 Amendment J1); where it and the bottle cabinet cannot both stand, it wins (Q-H6b). */
export const PAN_DRAWER_BASE_BUILD_ID = "base-panbank";

/** The integrated dishwasher's niche: it takes a module already standing beside the sink (a plain door
 *  cabinet, or else the preparation 3-drawer) under its own id, as a storage-role conversion rather
 *  than a core role (ADR 0110 Amendment M1); `dishwasher-beside-the-sink.ts` decides where. */
export const DISHWASHER_BUILD_ID = "base-dishwasher";

/** The id `storagePriorities` writes for a module the storage run composed; the predicate below is its
 *  one reader. */
const COMPOSED_STORAGE_ID_PREFIX = "storage:";

/** The one field the answer reads. Structural rather than an import of `PlannedGenerationBase`, so
 *  this leaf keeps the dependency floor its head comment claims. */
export interface ComposedModuleIdentity {
  readonly id: string;
}

/**
 * Did the **storage run** compose this module, as opposed to a tall-end block column, the bottle
 * cabinet, the pan drawer, the threshold drawer or the dishwasher, the other five modules that carry
 * `role: "storage"`?
 *
 * Neither the role nor the width can answer this: a block column carries `role: "storage"`
 * (ADR 0110 E5.2) and E6.2 lets its outermost column absorb the run's remainder up to 800 mm, so a rule
 * reading either field is wrong on a third and a seventh of placed rooms respectively, against correct
 * output. Provenance is what separates one 600 mm module from another once they stop being identical.
 */
export function isComposedStorageSlot(base: ComposedModuleIdentity): boolean {
  return base.id.startsWith(COMPOSED_STORAGE_ID_PREFIX);
}
