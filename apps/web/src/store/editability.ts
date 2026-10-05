// Whether this browser may offer an edit at all: the one answer for every write surface. It is shared so a new
// surface cannot repeat the drift where global settings had no locked state and a read-only visitor could
// mutate local state, watch the price move and land on `saveStatus: "unauthorized"` with the change on screen.
// It decides what the interface offers and nothing about what the server authorises: `canWrite` stays advisory
// (ADR 0019 decision 1) and no write path reads this module.
import type { Content } from "@/i18n/content";
import type { SaveStatus } from "@/persistence/save-coalescer";
import type { WriteAccess } from "@/store/configurator-store";

/** The two store fields the answer is a function of, as an object so a caller cannot pass them in the wrong
 *  order: both are about "may I write" and neither is a boolean. */
export interface WriteAccessState {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

/** Whether a surface's controls may be offered at all and, when not, the one sentence every greyed control
 *  carries (§13.1). Resolved once per surface and threaded, so ten controls cannot answer it differently and a
 *  new `WriteAccess` state means editing one function. */
export interface Editability {
  readonly isReadOnly: boolean;
  /** Meaningless when `isReadOnly` is false, and never read there. */
  readonly disabledReason: string;
}

export function describeEditability(
  access: WriteAccessState,
  panel: Content["panel"],
): Editability {
  return {
    isReadOnly: isReadOnly(access),
    disabledReason: describeDisabledReason(access.canWrite, panel),
  };
}

/**
 * The one place "this surface may not edit" is decided, from two independent causes: the load has not said it may,
 * or a save was refused. The second is kept although the first normally covers it: `canWrite` is presence of a
 * cookie, not proof (`hasWriteCredentialFor`), so a forged credential reads as writable until `unauthorized`. Only
 * an explicit `true` unlocks a surface: offering edits before the answer lets a reader on a blocked API edit,
 * believe it saved, and see the controls disable after the refusal (DEVELOPMENT-SPEC §9).
 */
function isReadOnly(access: WriteAccessState): boolean {
  return access.canWrite !== true || access.saveStatus === "unauthorized";
}

/** §13.1's "greyed and unclickable with the reason", where the reason is about this browser, not the thing being
 *  edited. The three locked states are three different facts and must not share a sentence: "Doar vizualizare"
 *  states a permission the page has been told about, and saying it while the probe is in flight would claim
 *  something unanswered. The sentences stay under the catalogue's `panel` group, one vocabulary rather than a
 *  copy under a second key; the group is passed in because the only source of a Romanian sentence is the active
 *  locale's catalogue. */
function describeDisabledReason(
  canWrite: WriteAccess,
  panel: Content["panel"],
): string {
  if (canWrite === "checking") return panel.accessCheckingReason;
  if (canWrite === "check-failed") return panel.accessUncheckableReason;
  return panel.readOnlyReason;
}
