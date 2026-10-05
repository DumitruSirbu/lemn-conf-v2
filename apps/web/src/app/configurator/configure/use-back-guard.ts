"use client";

// M7C wave C1 slice S4 (FB-001, Q10): the confirmation the back links ask, asked of the browser's
// Back and the phone's swipe-back as well.
//
// **The router cannot refuse a traversal.** Next's `onPopState` restores whichever entry the browser
// landed on (`next/dist/client/components/app-router.js`), so the only shape available is a **guard
// entry**: one extra history entry with the editor's own URL, pushed once the customer has something
// to lose. Back then lands on the editor's first entry — the address bar does not move — and a
// `popstate` listener asks. The decisions are the pure functions below; the hook is the wiring.
//
// Three rules the wiring keeps, each with a defect behind it:
//
// **1. The guard is pushed from the customer's first edit, never earlier.** Chrome marks the entries
// a document pushed without a user gesture as skippable on Back, and after a browser-initiated
// traversal it stops honouring the document's earlier gestures until the next one
// (`content/browser/renderer_host/navigation_controller_impl.cc`, `SetShouldSkipOnBackForwardUIIfNeeded`;
// `render_frame_host_impl.cc`, `honor_sticky_activation_for_history_intervention_`). An edit is a tap or
// a key press, so the entry it pushes is a real one.
//
// **2. *Stay* never pushes.** Escape is not a user activation, so a guard re-pushed after Escape — in the
// window the traversal opened — would mark the editor's entries skippable and take Back past Step 1.
// *Stay* goes `forward()` onto the guard entry that is still there, which creates no entry at all and
// is therefore also what keeps the history at one guard however often the customer stays.
//
// **3. One guard per visit, held in two places that must agree.** The module's origin record survives
// a language switch's remount (the history entries do too); the marker in `history.state` survives a
// reload (the module does not). A push needs both to say *none yet*.
//
// **The marker is fragile to one thing.** Any same-URL navigation or `router.refresh()` in the editor
// would strip it (`next/dist/client/components/router-reducer/reducers/refresh-reducer.js:75`; the
// history updater rewrites the entry's state), so none may be added to the editor without revisiting
// this guard.
import type { DesignId } from "@lemnaria/configurator-domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import {
  forgetEditorOrigin,
  readEditorOrigin,
  recordGuardPushed,
  recordQuestionClosed,
  recordQuestionOpened,
  type EditorOrigin,
} from "./back-guard";

/** What marks a history entry as the guard. It is state of the entry, so a reload keeps it. */
const GUARD_STATE_KEY = "lemnariaBackGuard";

/** `/{locale}/d/{id}` — or `/d/{id}` — is the editor of design `id`, in any language. */
export function isEditorPathnameOf(
  designId: DesignId,
  pathname: string,
): boolean {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const isShaped = segments.length <= 3 && segments.at(-2) === "d";
  return isShaped && decodedOrSelf(segments.at(-1) ?? "") === designId;
}

function decodedOrSelf(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function isGuardEntryState(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    Reflect.get(state, GUARD_STATE_KEY) === true
  );
}

function isArmedFor(origin: EditorOrigin, designId: DesignId | null): boolean {
  return designId !== null && origin.designId === designId;
}

export interface GuardPushFacts {
  readonly isOwner: boolean;
  readonly designId: DesignId | null;
  readonly hasBeenEdited: boolean;
  readonly origin: EditorOrigin;
  readonly pathname: string;
  readonly isCurrentEntryAGuard: boolean;
}

/**
 * Whether the screen should push its guard now. Every condition is one of the plan's *must not
 * warn* rows: the shared variant, an untouched kitchen, an editor not reached from Step 1 (a link,
 * resume, a reload), and a second guard — whichever of the two records says one exists. The pathname
 * condition is failure mode 2: a guard pushed while the URL is already leaving would sit on the
 * wrong page.
 */
export function shouldPushGuard(facts: GuardPushFacts): boolean {
  const { designId, origin } = facts;
  if (!facts.isOwner || !facts.hasBeenEdited) return false;
  if (designId === null || !isArmedFor(origin, designId)) return false;
  if (origin.guardedPathname !== null || facts.isCurrentEntryAGuard) {
    return false;
  }
  return isEditorPathnameOf(designId, facts.pathname);
}

export type PopstateVerdict =
  | "ask"
  | "close-question"
  | "keep-leaving"
  | "forget-origin"
  | "ignore";

export interface PopstateFacts {
  readonly origin: EditorOrigin;
  readonly designId: DesignId | null;
  readonly landedPathname: string;
  readonly isLandedEntryAGuard: boolean;
  readonly isLinkQuestionOpen: boolean;
}

/**
 * What a traversal that has just landed means for the question.
 *
 * Only a landing on **the entry the guard was pushed over** asks: that is Back from the guard. Forward
 * lands on the guard itself, and a landing on Step 1 is the customer leaving. Once the customer is
 * answering, *any* editor entry that is not the guard is passed through — the older-language ones
 * before a switch, and equally an entry that happens to share the guarded pathname (two switches back
 * to the same language) — so *Confirm*, and a second Back with the question open, each reach Step 1
 * in one step however many editor entries stand in the way.
 */
export function decidePopstate(facts: PopstateFacts): PopstateVerdict {
  const { origin, designId, landedPathname } = facts;
  if (designId === null || !isArmedFor(origin, designId)) return "ignore";
  if (!isEditorPathnameOf(designId, landedPathname)) return "forget-origin";
  if (facts.isLandedEntryAGuard) {
    return origin.isBeingAnswered ? "close-question" : "ignore";
  }
  if (origin.guardedPathname === null) return "ignore";
  if (origin.isBeingAnswered) return "keep-leaving";
  if (landedPathname !== origin.guardedPathname) return "ignore";
  return facts.isLinkQuestionOpen ? "ignore" : "ask";
}

export interface RearmFacts {
  readonly origin: EditorOrigin;
  readonly pathname: string;
  readonly isCurrentEntryAGuard: boolean;
}

/**
 * Whether the customer, having just dismissed the back links' question, is standing on the entry the
 * guard was pushed over rather than on the guard: Back was pressed while that question was open, so it
 * stayed open and the traversal was let through (a Back with a question open is the customer leaving).
 * The guard is still ahead of them, and *Stay* on the link's question means they are staying — so it is
 * put back under them, exactly as *Stay* on the Back question does.
 */
export function shouldRearmGuard(facts: RearmFacts): boolean {
  const { origin } = facts;
  return (
    origin.guardedPathname !== null &&
    facts.pathname === origin.guardedPathname &&
    !facts.isCurrentEntryAGuard
  );
}

export interface BackGuard {
  readonly isAsking: boolean;
  /** Leaves for the entry behind the editor — where Back was going. Writes nothing. */
  readonly confirm: () => void;
  /** Closes the question and puts the guard back under the customer. */
  readonly stay: () => void;
}

/**
 * Whether the browser's Back is being asked about, and the two answers to it.
 *
 * `isLinkQuestionOpen` is the back links' own question, and a Back pressed while it is open is the
 * customer answering it: this hook asks nothing over it (never two dialogs) and lets the traversal
 * through, so the next Back reaches Step 1. If they instead dismiss that question, the guard they
 * stepped past is put back (`useRearmGuardWhenLinkQuestionCloses`).
 */
export function useBackGuard({
  isOwner,
  isLinkQuestionOpen,
}: {
  readonly isOwner: boolean;
  readonly isLinkQuestionOpen: boolean;
}): BackGuard {
  const designId = useConfiguratorStore((state) => state.designId);
  const hasBeenEdited = useConfiguratorStore((state) => state.hasBeenEdited);
  const [isAsking, setIsAsking] = useState(false);
  const askerRef = useRef<HTMLElement | null>(null);
  const hasConfirmedRef = useRef(false);

  const closeQuestion = useCallback(() => {
    recordQuestionClosed();
    setIsAsking(false);
  }, []);

  useGuardEntry({ isOwner, designId, hasBeenEdited });
  usePopstateQuestion({
    isOwner,
    designId,
    isLinkQuestionOpen,
    onAsk: () => {
      const focused = document.activeElement;
      askerRef.current = focused instanceof HTMLElement ? focused : null;
      hasConfirmedRef.current = false;
      recordQuestionOpened();
      setIsAsking(true);
    },
    onClose: closeQuestion,
  });
  useRestoreFocusWhenClosed(isAsking, askerRef);
  useRearmGuardWhenLinkQuestionCloses({ isOwner, isLinkQuestionOpen });

  // Latched: a second tap before the first traversal has landed would queue a second one, and the two
  // together go past Step 1.
  const confirm = useCallback(() => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    window.history.back();
  }, []);

  const stay = useCallback(() => {
    hasConfirmedRef.current = false;
    closeQuestion();
    window.history.forward();
  }, [closeQuestion]);

  return { isAsking, confirm, stay };
}

/** Puts the guard back under a customer who dismissed the links' question after stepping past it. */
function useRearmGuardWhenLinkQuestionCloses({
  isOwner,
  isLinkQuestionOpen,
}: {
  readonly isOwner: boolean;
  readonly isLinkQuestionOpen: boolean;
}): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    const hasJustClosed = wasOpen.current && !isLinkQuestionOpen;
    wasOpen.current = isLinkQuestionOpen;
    if (!isOwner || !hasJustClosed) return;
    const shouldRearm = shouldRearmGuard({
      origin: readEditorOrigin(),
      pathname: window.location.pathname,
      isCurrentEntryAGuard: isGuardEntryState(window.history.state),
    });
    if (shouldRearm) window.history.forward();
  }, [isOwner, isLinkQuestionOpen]);
}

/** Pushes the one guard entry, when `shouldPushGuard` says the moment has come. */
function useGuardEntry({
  isOwner,
  designId,
  hasBeenEdited,
}: {
  readonly isOwner: boolean;
  readonly designId: DesignId | null;
  readonly hasBeenEdited: boolean;
}): void {
  useEffect(() => {
    const shouldPush = shouldPushGuard({
      isOwner,
      designId,
      hasBeenEdited,
      origin: readEditorOrigin(),
      pathname: window.location.pathname,
      isCurrentEntryAGuard: isGuardEntryState(window.history.state),
    });
    if (!shouldPush) return;
    // No URL: the entry keeps this one's, and Next's patched `pushState` carries its own state onto
    // the new entry so the router accepts it on Forward. A URL would also make it dispatch a restore.
    window.history.pushState({ [GUARD_STATE_KEY]: true }, "");
    recordGuardPushed(window.location.pathname);
  }, [isOwner, designId, hasBeenEdited]);
}

/**
 * **Next's `popstate` listener runs before ours and, for a traversal that changes the language or the
 * route, renders and commits inside its call** — measured in Chrome 2026-10-05: the screen that was
 * listening is unmounted, and its replacement's listener added, while the one event is still being
 * dispatched, and the DOM delivers an event only to the listeners present when its dispatch began.
 * (A `capture` listener does not help: at the window the order is the order of registration.)
 *
 * So a landing can be missed by both screens, and each case has its own answer here. A landing on
 * Step 1 is read off the URL when the screen goes away (`forgetOriginIfTheEditorHasBeenLeft`). A
 * landing on an older-language editor entry, while the customer is answering, is read by the screen
 * that mounts on it, one tick later (the `catchUp` timer below — a timer so that StrictMode's
 * discarded first run is cleared before it can act, and the traversal is never made twice).
 */
function usePopstateQuestion({
  isOwner,
  designId,
  isLinkQuestionOpen,
  onAsk,
  onClose,
}: {
  readonly isOwner: boolean;
  readonly designId: DesignId | null;
  readonly isLinkQuestionOpen: boolean;
  readonly onAsk: () => void;
  readonly onClose: () => void;
}): void {
  const latest = useRef({ onAsk, onClose });
  useEffect(() => {
    latest.current = { onAsk, onClose };
  });

  useEffect(() => {
    if (!isOwner) return;
    const verdictFor = (isLandedEntryAGuard: boolean): PopstateVerdict =>
      decidePopstate({
        origin: readEditorOrigin(),
        designId,
        landedPathname: window.location.pathname,
        isLandedEntryAGuard,
        isLinkQuestionOpen,
      });
    const onPopState = (event: PopStateEvent) => {
      applyVerdict(verdictFor(isGuardEntryState(event.state)), latest.current);
    };
    window.addEventListener("popstate", onPopState);
    const catchUp = window.setTimeout(() => {
      // Only the one landing a mounting screen can have missed (see above).
      if (
        verdictFor(isGuardEntryState(window.history.state)) === "keep-leaving"
      ) {
        applyVerdict("keep-leaving", latest.current);
      }
    }, 0);
    return () => {
      window.clearTimeout(catchUp);
      window.removeEventListener("popstate", onPopState);
      forgetOriginIfTheEditorHasBeenLeft(designId);
    };
  }, [isOwner, designId, isLinkQuestionOpen]);
}

/**
 * The editor going away for another page. A traversal to Step 1 unmounts this screen **before** it
 * delivers `popstate`, so the listener never sees that landing; the URL, which has already moved, is
 * what says so. Without it the next arrival at the editor — Forward from Step 1 — would still find a
 * guard on record and ask.
 */
function forgetOriginIfTheEditorHasBeenLeft(designId: DesignId | null): void {
  const isStillTheEditor =
    designId !== null && isEditorPathnameOf(designId, window.location.pathname);
  if (!isStillTheEditor) forgetEditorOrigin();
}

function applyVerdict(
  verdict: PopstateVerdict,
  question: { readonly onAsk: () => void; readonly onClose: () => void },
): void {
  switch (verdict) {
    case "ask":
      question.onAsk();
      return;
    case "close-question":
      question.onClose();
      return;
    case "keep-leaving":
      window.history.back();
      return;
    case "forget-origin":
      forgetEditorOrigin();
      return;
    case "ignore":
      return;
  }
}

/** Focus goes back to what had it when Back was pressed, once the dialog — which marks the rest of
 *  the screen `inert` while open — has unmounted. */
function useRestoreFocusWhenClosed(
  isAsking: boolean,
  askerRef: { current: HTMLElement | null },
): void {
  useEffect(() => {
    if (isAsking) return;
    askerRef.current?.focus();
    askerRef.current = null;
  }, [isAsking, askerRef]);
}
