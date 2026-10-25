// M7C wave C1 slice S4: what the browser-Back confirmation remembers between screens — where the editor
// was reached from — with no React and **no store**, so that Step 1 can record its hand-over
// (`room/use-generation.ts`) without carrying anything of the editor into its first load. What is decided
// from it, and the hook that wires it to a history, are `use-back-guard.ts`.
//
// Lot 2 U15d adds one more fact, kept apart from the origin because the origin is forgotten the moment the
// editor unmounts, which is before Step 1 mounts: whether Step 1 owes the visitor the account card
// (`StepOneAccountCardLatch`).
import type { DesignId } from "@lemnaria/configurator-domain";

/** Where the editor was reached from, whether it has pushed its one guard, and whether the customer
 *  is answering. */
export interface EditorOrigin {
  /** The design Step 1 handed over to; null when this tab did not arrive from Step 1. */
  readonly designId: DesignId | null;
  /** The pathname the guard was pushed at; null until it is. */
  readonly guardedPathname: string | null;
  /** The question is open, or *Confirm* has been pressed and the traversal is on its way. Held here
   *  and not in the hook's state because a traversal across languages remounts the screen **before**
   *  `popstate` is delivered, so the instance that asked is gone when the answer lands. */
  readonly isBeingAnswered: boolean;
}

const NO_ORIGIN: EditorOrigin = {
  designId: null,
  guardedPathname: null,
  isBeingAnswered: false,
};

// Module scope, like the store and the camera: a language switch remounts the screen, and a reload
// starts a new document — which is exactly the lifetime *"reached from Step 1 in this tab"* has.
let editorOrigin: EditorOrigin = NO_ORIGIN;

/** Step 1's hand-over: the editor about to open is one with Step 1 behind it. Recorded before the push,
 *  so a push that never mounts an editor (the customer left first) leaves a record naming a design no
 *  screen asks about: it is inert until that design's own editor mounts, and the next hand-over
 *  replaces it. */
export function recordEditorOpenedFromStepOne(designId: DesignId): void {
  editorOrigin = { ...NO_ORIGIN, designId };
  recordStepOneAccountCardOffered();
}

export function readEditorOrigin(): EditorOrigin {
  return editorOrigin;
}

export function forgetEditorOrigin(): void {
  editorOrigin = NO_ORIGIN;
}

export function recordGuardPushed(pathname: string): void {
  editorOrigin = { ...editorOrigin, guardedPathname: pathname };
}

export function recordQuestionOpened(): void {
  editorOrigin = { ...editorOrigin, isBeingAnswered: true };
}

export function recordQuestionClosed(): void {
  editorOrigin = { ...editorOrigin, isBeingAnswered: false };
}

/**
 * Whether Step 1 owes the visitor the card that says their kitchen is kept in this browser (plan M8B Lot 2 section
 * 14.2, U15-4). The latch only moves forward, so the card is owed at most once per document:
 * - `none`: no edited editor has been left, or the card is spent;
 * - `due`: one has, and the card has not been answered yet;
 * - `offered`: the card was dismissed, or Step 1 handed over to an editor, and it is not owed again.
 *
 * Module scope, as `editorOrigin` is: a language switch on Step 1 remounts the screen and must keep the card, and a
 * reload is a new document, which starts at `none`.
 */
export type StepOneAccountCardLatch = "none" | "due" | "offered";

let stepOneAccountCardLatch: StepOneAccountCardLatch = "none";

export function readStepOneAccountCardLatch(): StepOneAccountCardLatch {
  return stepOneAccountCardLatch;
}

/** The customer confirmed leaving an editor they had changed, reached from Step 1. Owes the card the first time only. */
export function recordEditedEditorLeft(facts: {
  readonly designId: DesignId | null;
  readonly hasBeenEdited: boolean;
}): void {
  const { designId, hasBeenEdited } = facts;
  const isFromStepOne = designId !== null && editorOrigin.designId === designId;
  if (!hasBeenEdited || !isFromStepOne) return;
  if (stepOneAccountCardLatch === "none") stepOneAccountCardLatch = "due";
}

/** "Nu acum", or the visit to Step 1 ending in an editor: the card has had its one showing. */
export function recordStepOneAccountCardOffered(): void {
  if (stepOneAccountCardLatch === "due") stepOneAccountCardLatch = "offered";
}

/** Forgets the card's latch, as a fresh document would. For tests only: nothing in the application calls it. */
export function resetStepOneAccountCardLatchForTests(): void {
  stepOneAccountCardLatch = "none";
}
