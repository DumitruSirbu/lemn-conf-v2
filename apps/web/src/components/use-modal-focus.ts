"use client";

// What makes a surface modal, written once so every dialog in the application behaves as the same modal: focus
// lands inside on open, Tab stays inside, Escape dismisses, and the rest of the screen cannot be operated. The
// settings sheet, the back confirmation, the preset dialogs and the account dialog all stand on these pieces.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

/** The tab ring inside the dialog. A radio group contributes exactly its checked member (the browser's own rule),
 *  so unchecked radios are not listed: they would put the trap's first and last stops on elements Tab never
 *  visits. `:not([disabled])` is on every part because a disabled radio is no more tabbable than a disabled
 *  button. Any other input is a stop of its own (the preset dialog's name field): left out, Tab would skip the field
 *  and the trap's first stop would be wrong. A link with an `href` is a stop too (an account menu's destinations).
 *  *Renunță* is never disabled, so the ring is never empty: leaving must
 *  stay possible on every surface. */
const TAB_STOP_SELECTOR =
  'button:not([disabled]), a[href], input[type="radio"]:checked:not([disabled]), input:not([type="radio"]):not([disabled])';

/** Where focus goes when the dialog closes, for a dialog whose caller does not return it itself. */
export interface ReturnFocusPolicy {
  /** Where focus goes when whatever had it on open is gone by the time the dialog closes (a menu item the dialog's
   *  own act removed, a menu that closed on open). Left out, focus is not moved and the document keeps it. */
  readonly fallbackRef?: RefObject<HTMLElement | null> | undefined;
}

/** What a modal surface hands the shared behaviour. */
export interface ModalFocusTargets {
  /** The element that holds the dialog's scrim and surface: the band `useBackgroundInert` leaves live. */
  readonly hostRef: RefObject<HTMLDivElement | null>;
  /** Where focus lands on open: the surface itself, or a named control inside it. Read once, on open: it must stay
   *  the same ref for as long as the dialog is open. */
  readonly initialFocusRef: RefObject<HTMLElement | null>;
  /** Where focus lands if `initialFocusRef` holds nothing when the dialog opens (the surface, which takes focus
   *  with `tabIndex={-1}`), so that focus never stays behind the scrim. */
  readonly focusFallbackRef?: RefObject<HTMLElement | null>;
  /** What Escape does. A dialog that must not be left (a request in flight) passes a function that does nothing. */
  readonly dismiss: () => void;
  /** Present, focus goes back to what had it on open once the dialog has gone. Absent, the caller returns it: the
   *  settings sheet and the back confirmation do, after they unmount. */
  readonly returnFocus?: ReturnFocusPolicy;
}

/**
 * What makes a surface modal: focus lands where the dialog names, Escape dismisses, the screen behind goes inert and,
 * if asked, focus comes back to the opener on close. The Tab trap is `trapTab`, bound to the surface's `onKeyDown`.
 */
export function useModalFocus({
  hostRef,
  initialFocusRef,
  focusFallbackRef,
  dismiss,
  returnFocus,
}: ModalFocusTargets): void {
  useFocusOnOpen(initialFocusRef, focusFallbackRef);
  useEscapeToDismiss(true, dismiss);
  useBackgroundInert(true, hostRef);
  // Last: its cleanup must run after the inert one has lifted, because the opener sits in a band that cannot take
  // focus while it is inert. Cleanups run in declaration order.
  useReturnFocusOnClose(returnFocus);
}

function useFocusOnOpen(
  initialFocusRef: RefObject<HTMLElement | null>,
  focusFallbackRef: RefObject<HTMLElement | null> | undefined,
): void {
  // Taken once: a ref that changes while the dialog is open must not pull focus back from where the person has got to.
  const refsAtOpen = useRef({ initialFocusRef, focusFallbackRef });
  useEffect(() => {
    const refs = refsAtOpen.current;
    const target =
      refs.initialFocusRef.current ?? refs.focusFallbackRef?.current;
    target?.focus();
  }, []);
}

/** The opener is read in a layout effect, which runs before the focus move of `useFocusOnOpen`. */
function useReturnFocusOnClose(policy: ReturnFocusPolicy | undefined): void {
  const policyRef = useRef(policy);
  const openerRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    policyRef.current = policy;
  });
  useLayoutEffect(() => {
    openerRef.current = document.activeElement;
  }, []);
  useEffect(() => {
    return () => {
      const currentPolicy = policyRef.current;
      if (currentPolicy === undefined) return;
      focusOpenerOr(currentPolicy.fallbackRef?.current, openerRef.current);
    };
  }, []);
}

function focusOpenerOr(
  fallback: HTMLElement | null | undefined,
  opener: Element | null,
): void {
  if (hasFocusableOpener(opener)) {
    opener.focus();
    return;
  }
  fallback?.focus();
}

/** The body is what holds focus when a press did not focus the control that opened the dialog (Safari and Firefox do not
 *  focus a button on click), so it names no opener and the fallback is the better answer. */
function hasFocusableOpener(opener: Element | null): opener is HTMLElement {
  return (
    opener instanceof HTMLElement &&
    opener.isConnected &&
    opener !== document.body
  );
}

/** One open modal's way out of Escape. The object is the modal's place in `openEscapeHandlers`, and its `dismiss` is
 *  replaced in place as the modal redraws, so a new function never moves the modal in the stack. */
interface EscapeHandler {
  dismiss: () => void;
}

/** The open modals in the order they opened: the last is the topmost, and the only one Escape reaches. */
const openEscapeHandlers: EscapeHandler[] = [];

function dismissTopmostOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  openEscapeHandlers.at(-1)?.dismiss();
}

function pushEscapeHandler(handler: EscapeHandler): void {
  if (openEscapeHandlers.length === 0) {
    document.addEventListener("keydown", dismissTopmostOnEscape);
  }
  openEscapeHandlers.push(handler);
}

function removeEscapeHandler(handler: EscapeHandler): void {
  const at = openEscapeHandlers.indexOf(handler);
  if (at !== -1) openEscapeHandlers.splice(at, 1);
  if (openEscapeHandlers.length === 0) {
    document.removeEventListener("keydown", dismissTopmostOnEscape);
  }
}

/**
 * Escape dismisses wherever focus has got to, so this listens on the document rather than the surface
 * (`price-breakdown.tsx` records what binding it to the dialog cost). Registered only while open, and shared: one
 * document listener serves every open modal and reaches only the topmost, so a second modal opened over the first
 * (the session sheet over a settings sheet) is closed by Escape alone and the first by the next press. It calls whatever
 * `dismiss` its asker hands it (the sheet steps back one step at a time, ADR 0081 decision 3; the back confirmation's
 * is Stay): a second document-level handler inside either is what that decision refuses.
 */
export function useEscapeToDismiss(isOpen: boolean, dismiss: () => void): void {
  const handlerRef = useRef<EscapeHandler>({ dismiss });
  useLayoutEffect(() => {
    handlerRef.current.dismiss = dismiss;
  });
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = handlerRef.current;
    pushEscapeHandler(handler);
    return () => {
      removeEscapeHandler(handler);
    };
  }, [isOpen]);
}

/** How many open modals hold each band inert. A band is let go only by the last of them. */
const inertHoldCounts = new Map<Element, number>();

function holdInert(bands: readonly Element[]): void {
  for (const band of bands) {
    inertHoldCounts.set(band, (inertHoldCounts.get(band) ?? 0) + 1);
    band.setAttribute("inert", "");
  }
}

function releaseInert(bands: readonly Element[]): void {
  for (const band of bands) {
    const remaining = (inertHoldCounts.get(band) ?? 1) - 1;
    if (remaining > 0) {
      inertHoldCounts.set(band, remaining);
      continue;
    }
    inertHoldCounts.delete(band);
    band.removeAttribute("inert");
  }
}

/**
 * Marks the rest of the screen inert while the dialog is open: the half of "modal" a scrim cannot do, because a
 * keyboard can activate controls a pointer cannot. Applied to the screen's own children rather than a named list
 * of components, so a later change to where this mounts cannot leave a band operable. The band holding the
 * anchor stays live; every sibling band goes inert. Holds are counted per band, so a modal that closes while another
 * still needs a band inert does not lift it.
 */
export function useBackgroundInert(
  isOpen: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const anchor = anchorRef.current;
    const screenElement = anchor?.closest("main");
    if (isOpen && anchor && !screenElement) reportInertNeedsMain();
    if (!isOpen || !anchor || !screenElement) return undefined;
    const behind = [...screenElement.children].filter(
      (band) => !band.contains(anchor),
    );
    holdInert(behind);
    return () => {
      releaseInert(behind);
    };
  }, [isOpen, anchorRef]);
}

/** A dialog outside `<main>` leaves the whole page operable, and nothing else would say so. */
function reportInertNeedsMain(): void {
  if (process.env.NODE_ENV === "production") return;
  console.error(
    "useBackgroundInert: the dialog is not inside a <main>, so nothing behind it was made inert. " +
      "Mount it as a direct child of the screen's <main>.",
  );
}

/** The focus trap, bound to the dialog rather than the document because it is about where focus *is*, which is
 *  what made a document listener right for Escape and wrong here. */
export function trapTab(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Tab") return;
  const stops = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR),
  ];
  const landing = whereTabMustLand(stops, event.shiftKey);
  if (landing === undefined) return;
  event.preventDefault();
  landing.focus();
}

/**
 * Where this keypress has to be sent, or `undefined` where the browser's own answer is already inside the ring.
 * The question is "would this keypress leave the dialog", not "is focus at an end": opening focuses the dialog
 * container (`tabIndex={-1}`, not a tab stop), and Shift+Tab from there reaches the trigger, which sits in the one
 * band `useBackgroundInert` leaves live. So focus on none of the dialog's own stops takes the end the direction
 * implies. It cannot fire once focus has left the dialog (it hangs off `onKeyDown`); the step-change effect in
 * `GlobalSettings` is what keeps focus inside when the confirm step unmounts the focused button.
 */
function whereTabMustLand(
  stops: readonly HTMLElement[],
  isBackwards: boolean,
): HTMLElement | undefined {
  const first = stops.at(0);
  const last = stops.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const at = stops.findIndex((stop) => stop === document.activeElement);
  if (at === -1) return isBackwards ? last : first;
  if (isBackwards) return at === 0 ? last : undefined;
  return at === stops.length - 1 ? first : undefined;
}
