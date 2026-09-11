// **Whether this browser may offer an edit at all — the one answer, for every write surface.**
//
// It lived inside `panel-model.ts` until wave W2, where only §9's panel could reach it. That is the
// root cause the M6 audit records under "UI authorization drift": wave 6G's global settings surface
// was written without it, so its trigger, its radios and its *Aplică* had no locked state, and a
// read-only visitor on a `/d/{id}` link could mutate local state, watch the price move, and land on
// `saveStatus: "unauthorized"` with the change still on screen. Duplicating the rule per surface is
// what let two surfaces disagree; a shared module is what stops the third from repeating it.
//
// It decides what the interface **offers** and nothing about what the server **authorises**:
// `canWrite` stays advisory, ADR 0019 decision 1's write token is still the only thing a write is
// allowed on, and no write path reads this module.
import type { Content } from "@/i18n/content";
import type { SaveStatus } from "@/persistence/save-coalescer";
import type { WriteAccess } from "@/store/configurator-store";

/** The two store fields the answer is a function of, named as an object so a caller cannot pass
 *  them in the wrong order — they are both about "may I write" and neither is a boolean. */
export interface WriteAccessState {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

/** Whether a surface's controls may be offered at all, and — when they may not — the one sentence
 *  every greyed control carries (§13.1). Resolved once per surface and threaded, so ten controls
 *  cannot answer it in three different ways, and so adding a fourth `WriteAccess` state means
 *  editing one function rather than six. */
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
 * The one place "this surface may not edit" is decided, from the two independent ways it becomes
 * true: the load has not said it may, or a save has already been refused.
 *
 * The second is kept even though the first normally covers it. `canWrite` is presence of a cookie,
 * not proof it is the right one (`hasWriteCredentialFor`), so a stale or forged credential reads as
 * writable until a write is attempted — and `unauthorized` is that attempt's answer. Reading both
 * means a surface stops offering edits at the first refusal rather than at every one.
 *
 * **Only an explicit `true` unlocks a surface** (wave S7, finding WEB-002). It used to be only an
 * explicit `false` that locked it, which made `/d/{id}`'s "nobody has asked yet" an offer to edit:
 * a reader on a slow or blocked API mutated local state, believed it saved, and had the controls
 * disabled only after the write was refused, with the unsaved edit still on screen.
 * `DEVELOPMENT-SPEC.md` §9's "never offer what cannot be satisfied" is exactly the rule that
 * forbids it, and an unanswered question cannot satisfy anything.
 */
function isReadOnly(access: WriteAccessState): boolean {
  return access.canWrite !== true || access.saveStatus === "unauthorized";
}

/** §13.1's "greyed and unclickable **with the reason**", where the reason is about this browser
 *  rather than about the thing being edited. The three locked states are three different facts and
 *  must not share a sentence: "Doar vizualizare" states a permission the page has been told about,
 *  and saying it while the probe is still in flight would be a claim nothing has answered.
 *
 *  The sentences stay under the catalogue's `panel` group where §9 first needed them. They are one
 *  vocabulary rather than the panel's own — moving them would leave the panel's tests naming a
 *  section that no longer describes who reads it, and a copy under a second key is exactly the drift
 *  this module exists to end. The group is **passed in** rather than imported, because since 6B-f
 *  the only source of a Romanian sentence is the active locale's catalogue. */
function describeDisabledReason(
  canWrite: WriteAccess,
  panel: Content["panel"],
): string {
  if (canWrite === "checking") return panel.accessCheckingReason;
  if (canWrite === "check-failed") return panel.accessUncheckableReason;
  return panel.readOnlyReason;
}
