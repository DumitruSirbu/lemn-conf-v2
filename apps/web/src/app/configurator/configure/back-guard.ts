// M7C wave C1 slice S4: the one thing the browser-Back confirmation remembers between screens — where
// the editor was reached from — with no React and **no store**, and nothing else, so that Step 1 can
// record its hand-over (`room/use-generation.ts`) without carrying anything of the editor into its first
// load. What is decided from it, and the hook that wires it to a history, are `use-back-guard.ts`.
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
